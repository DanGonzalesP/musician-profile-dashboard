-- ═══════════════════════════════════════════════════════════════════════════
-- 0018_corregir_concurrencia_y_suspension.sql
--
-- Tres defectos que las pruebas de base de F7 destaparon en cuanto existieron.
-- Ninguno se podía ver leyendo el SQL: los tres necesitaban una corrida real
-- contra Postgres y PostgREST. Es exactamente para lo que se escribió la suite.
--
-- ─── 1) `pg_catalog.greatest` no existe ────────────────────────────────────
-- `0013` endureció `consume_authenticated_rate_limit` con `search_path = ''` y
-- calificó cada función con `pg_catalog.`. Correcto para todas… salvo para
-- GREATEST, que **no es una función**: es una construcción del analizador
-- sintáctico, como CURRENT_USER o EXTRACT. No vive en ningún esquema y por eso
-- no se puede calificar.
--
-- El resultado: `42883 function pg_catalog.greatest(integer, integer) does not
-- exist`, y —lo peor— sólo en la rama que calcula `retry_after`, es decir
-- **justo cuando había que rechazar la petición**. Dentro del cupo la función
-- respondía bien; al topar el límite reventaba. Un contador que falla
-- únicamente cuando debe decir "no" es un contador que no existe.
--
-- Se arregla usando `greatest(...)` sin calificar, que es la forma correcta y
-- es inmune a `search_path` precisamente por no resolverse por esquema.
--
-- ─── 2) `publish_profile` marcaba un conflicto lógico como reintentable ────
-- La v3 de `0010` levantaba `conflicto_de_version` con
-- `errcode = 'serialization_failure'` (40001). Ese código significa, para todo
-- el ecosistema de Postgres, "no pude serializar esta transacción, vuelve a
-- intentarlo": PostgREST reintenta la llamada en vez de devolver el error.
--
-- Pero aquí el conflicto **no es transitorio**. La versión esperada quedó
-- obsoleta para siempre; reintentar sólo produce el mismo rechazo. La prueba
-- se comía los 30 s de timeout, y un artista con una pestaña vieja se comía la
-- misma espera antes de ver el aviso de "alguien más publicó".
--
-- Se sustituye por `PT409`, la convención de PostgREST para fijar el estado
-- HTTP: la respuesta pasa a ser un **409 Conflict** inmediato y no reintentable.
-- El texto `conflicto_de_version` —que consume `components/profile-editor.tsx`
-- para mostrar su aviso— se conserva intacto.
--
-- ─── 3) El dueño podía levantarse su propia suspensión ─────────────────────
-- `profiles_update_owner` (y `profiles_update_band_managers`) autorizan el
-- UPDATE de la fila **entera**. RLS en Postgres no distingue columnas, así que
-- un perfil suspendido por un takedown podía mandar `is_suspended = false` por
-- PostgREST y volver a la vista pública. La moderación era decorativa.
--
-- POR QUÉ UN TRIGGER Y NO PRIVILEGIOS POR COLUMNA
-- `revoke update … / grant update (col, col, …)` es la respuesta canónica de
-- Postgres, pero obliga a enumerar todas las columnas actuales de `profiles` y
-- a acordarse de conceder cada columna futura: la primera que se olvide rompe
-- el editor en silencio. Un trigger `before update` protege por nombre las tres
-- columnas administrativas, deja el resto exactamente como está hoy, y no se
-- puede quedar desactualizado al añadir una columna. La UX no cambia: ninguna
-- pantalla de Vibe escribe estas tres columnas (verificado en `app/`, `lib/` y
-- `components/`; sólo se leen en el feed, el sitemap y `lib/supabase-server.ts`).
--
-- SIN SERVICE ROLE EN EL RUNTIME
-- La excepción legítima no es "la app con más privilegios", sino "una sesión
-- que no llegó por la Data API". `anon` y `authenticated` son los dos roles que
-- PostgREST asume; cualquier otro (el backoffice del runbook de takedown, la
-- CLI, un rol de moderación dedicado) queda fuera del veto. Además se deja
-- escrito el hueco de F14: `private.es_admin(uuid)` existe desde hoy como
-- talón que devuelve `false`, y F14 la reemplaza con `create or replace` sobre
-- `private.admin_users` sin tocar el trigger ni una sola política.
--
-- LÍMITE CONOCIDO, DELIBERADAMENTE FUERA DE ALCANCE
-- Un perfil suspendido todavía puede borrarse y volver a crearse (P-13/F14).
-- Cerrarlo exige decidir qué pasa con el `username` y con el historial de
-- moderación, que es una decisión de producto de F14, no de esta corrección.
--
-- Idempotente. Correr DESPUÉS de 0017.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) Contador distribuido: corrección de GREATEST ─────────────────────
-- Copia literal de la versión de 0013 salvo la línea de `greatest`. Se
-- conservan: la lista cerrada de buckets, `security definer`, `search_path=''`,
-- el UPSERT atómico (correcto bajo concurrencia: la fila se bloquea en el
-- `on conflict do update` y cada llamada recibe su propio `request_count` por
-- RETURNING) y los grants mínimos.

create or replace function private.consume_authenticated_rate_limit(p_bucket text)
returns table (is_allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer;
  v_window_seconds integer;
  now_at timestamptz := pg_catalog.now();
  v_started_at timestamptz;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  -- Lista cerrada: quien llama no puede reducir la ventana ni aumentar el
  -- cupo para reiniciar o eludir su propio contador.
  case p_bucket
    when 'upload' then
      v_limit := 120;
      v_window_seconds := 3600;
    when 'image-generation' then
      v_limit := 10;
      v_window_seconds := 3600;
    else
      raise exception 'unknown rate limit bucket';
  end case;

  insert into public.rate_limit_windows as w (bucket, user_id, started_at, request_count)
  values (p_bucket, v_uid, now_at, 1)
  on conflict (bucket, user_id) do update
    set started_at = case
          when w.started_at <= now_at - pg_catalog.make_interval(secs => v_window_seconds) then now_at
          else w.started_at
        end,
        request_count = case
          when w.started_at <= now_at - pg_catalog.make_interval(secs => v_window_seconds) then 1
          else w.request_count + 1
        end
  returning w.started_at, w.request_count into v_started_at, v_count;

  if v_count <= v_limit then
    return query select true, 0;
  else
    -- `greatest` SIN calificar: es una construcción del analizador, no una
    -- función de `pg_catalog`. Calificarla es lo que rompía 0013.
    return query
      select false,
             greatest(
               1,
               pg_catalog.ceil(
                 extract(epoch from (
                   v_started_at
                   + pg_catalog.make_interval(secs => v_window_seconds)
                   - now_at
                 ))
               )::integer
             );
  end if;
end;
$$;

revoke all on function private.consume_authenticated_rate_limit(text) from public, anon;
grant execute on function private.consume_authenticated_rate_limit(text) to authenticated;

-- El wrapper público sigue siendo `security invoker`: PostgREST sólo ve esta
-- firma y la implementación privilegiada vive fuera del esquema expuesto.
create or replace function public.consume_authenticated_rate_limit(p_bucket text)
returns table (is_allowed boolean, retry_after integer)
language sql
security invoker
set search_path = ''
as $$
  select * from private.consume_authenticated_rate_limit(p_bucket);
$$;

revoke all on function public.consume_authenticated_rate_limit(text) from public, anon;
grant execute on function public.consume_authenticated_rate_limit(text) to authenticated;


-- ─── 2) publish_profile v4 — el conflicto deja de ser reintentable ───────
-- Idéntica a la v3 de 0010 (misma firma, `security invoker`, validación del
-- lote ANTES del `delete`, `FOR UPDATE`, versión optimista, limpieza del
-- borrador en la misma transacción) salvo el `errcode` del conflicto.

create or replace function public.publish_profile(
  p_profile_id uuid,
  p_blocks jsonb,
  p_expected_version integer default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actual integer;
  v_nueva integer;
  v_bloque jsonb;
  v_indice integer := 0;
  v_tipo text;
  v_pos jsonb;
  v_tipos_validos text[] := array[
    'hero','single','crowdfunding','tracks','credits',
    'merch','service','legado','publicaciones','embeds'
  ];
begin
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'p_blocks debe ser un arreglo JSON';
  end if;

  -- Techo del lote: 200 bloques y 4 MB, iguales a MAX_BLOQUES_POR_LOTE y
  -- MAX_BYTES_POR_LOTE de lib/blocks-schema.ts.
  if jsonb_array_length(p_blocks) > 200 then
    raise exception 'bloques_invalidos: la publicacion tiene % bloques y el maximo es 200',
      jsonb_array_length(p_blocks)
      using errcode = 'check_violation';
  end if;

  if pg_column_size(p_blocks) > 4194304 then
    raise exception 'bloques_invalidos: la publicacion supera el maximo de 4 MB'
      using errcode = 'check_violation';
  end if;

  -- Validación elemento por elemento. Todo o nada.
  for v_bloque in select * from jsonb_array_elements(p_blocks)
  loop
    v_indice := v_indice + 1;

    if jsonb_typeof(v_bloque) <> 'object' then
      raise exception 'bloques_invalidos: el bloque % no es un objeto', v_indice
        using errcode = 'check_violation';
    end if;

    v_tipo := v_bloque ->> 'block_type';
    if v_tipo is null or not (v_tipo = any (v_tipos_validos)) then
      raise exception 'bloques_invalidos: el bloque % tiene un tipo desconocido (%)', v_indice, coalesce(v_tipo, 'null')
        using errcode = 'check_violation';
    end if;

    v_pos := v_bloque -> 'position_index';
    if v_pos is null
       or jsonb_typeof(v_pos) <> 'number'
       or (v_bloque ->> 'position_index')::numeric < 0
       or (v_bloque ->> 'position_index')::numeric <> floor((v_bloque ->> 'position_index')::numeric)
    then
      raise exception 'bloques_invalidos: el bloque % tiene una posicion invalida', v_indice
        using errcode = 'check_violation';
    end if;

    -- `content` puede faltar (bloque sin datos) pero si viene tiene que ser un
    -- objeto, igual que exige la restricción de la tabla.
    if v_bloque ? 'content'
       and jsonb_typeof(v_bloque -> 'content') not in ('object', 'null')
    then
      raise exception 'bloques_invalidos: el contenido del bloque % no es un objeto', v_indice
        using errcode = 'check_violation';
    end if;

    if pg_column_size(v_bloque -> 'content') > 524288 then
      raise exception 'bloques_invalidos: el contenido del bloque % supera 512 kB', v_indice
        using errcode = 'check_violation';
    end if;
  end loop;

  -- ─── A partir de aquí, idéntico a 0007/0010 ─────────────────────────────

  -- FOR UPDATE serializa a dos publicaciones simultáneas: la segunda espera y
  -- recién entonces compara versiones, en vez de leer un valor ya obsoleto.
  select content_version into v_actual
  from profiles where id = p_profile_id
  for update;

  if v_actual is null then
    raise exception 'El perfil % no existe', p_profile_id;
  end if;

  -- p_expected_version null = publicación sin control de versión (clientes
  -- viejos). Se acepta para no romper una pestaña que quedó abierta durante
  -- el despliegue.
  --
  -- `PT409`: convención de PostgREST para fijar el estado HTTP (409 Conflict).
  -- Antes era `serialization_failure`, que anuncia un fallo TRANSITORIO y hace
  -- que PostgREST reintente. Este conflicto es permanente: la versión esperada
  -- ya no vuelve. Reintentar sólo alarga la espera hasta el timeout.
  if p_expected_version is not null and p_expected_version <> v_actual then
    raise exception 'conflicto_de_version: el perfil fue editado desde otra sesion (version % vs %)',
      p_expected_version, v_actual
      using errcode = 'PT409';
  end if;

  delete from profile_blocks where profile_id = p_profile_id;

  insert into profile_blocks (profile_id, block_type, position_index, content, is_visible)
  select
    p_profile_id,
    bloque ->> 'block_type',
    (bloque ->> 'position_index')::int,
    bloque -> 'content',
    true
  from jsonb_array_elements(p_blocks) as bloque;

  update profile_private
  set draft_content = null,
      updated_at = now()
  where profile_id = p_profile_id;

  v_nueva := v_actual + 1;
  update profiles set content_version = v_nueva where id = p_profile_id;

  return v_nueva;
end;
$$;

revoke execute on function public.publish_profile(uuid, jsonb, integer) from public, anon;
grant execute on function public.publish_profile(uuid, jsonb, integer) to authenticated;


-- ─── 3) Las columnas de suspensión son administrativas ───────────────────

-- 3.1 · El hueco de F14. Hoy no existe ningún administrador representado en
-- Postgres, y fingir que sí sería peor que no tenerlo: el talón devuelve
-- `false` y por eso la única vía legítima es un contexto que no pase por la
-- Data API. F14 la reemplaza con `create or replace` sobre `private.admin_users`
-- y ni el trigger ni las políticas cambian.
create or replace function private.es_admin(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- F14: select exists (select 1 from private.admin_users a where a.user_id = p_uid);
  select false;
$$;

comment on function private.es_admin(uuid) is
  'Talon de F14: hoy nadie es administrador en Postgres. Reemplazar con create or replace cuando exista private.admin_users.';

revoke all on function private.es_admin(uuid) from public, anon;
grant execute on function private.es_admin(uuid) to authenticated;


-- 3.2 · El guardián. `security invoker` a propósito: dentro de una función
-- `security definer` `current_user` sería el dueño (postgres) y el control no
-- distinguiría nada. Invoker devuelve el rol efectivo de quien escribe, que es
-- justo lo que hay que mirar.
--
-- `current_user`, igual que `greatest`, es una construcción del analizador: no
-- se califica con esquema y por eso es inmune a `search_path = ''`.
create or replace function private.proteger_columnas_de_suspension()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Camino normal y abrumadoramente mayoritario: el UPDATE no toca ninguna
  -- columna administrativa. Sale antes de mirar nada más, así que renombrar el
  -- perfil o publicar (que actualiza content_version) cuesta lo mismo que ayer.
  if new.is_suspended is not distinct from old.is_suspended
     and new.suspended_reason is not distinct from old.suspended_reason
     and new.suspended_at is not distinct from old.suspended_at then
    return new;
  end if;

  if current_user in ('anon', 'authenticated') then
    if not private.es_admin(auth.uid()) then
      raise exception
        'suspension_administrativa: las columnas de suspension solo las mueve la moderacion'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

-- Es una función de trigger, no una RPC: nadie debe poder invocarla suelta.
-- (El disparo del trigger no comprueba EXECUTE — el privilegio se verifica al
-- CREAR el trigger —, así que revocarlo no rompe nada. Mismo razonamiento que
-- `aplicar_limite_de_escritura` en 0011.)
revoke all on function private.proteger_columnas_de_suspension() from public, anon, authenticated;

-- `create trigger` no admite `if not exists` en todas las versiones.
drop trigger if exists proteger_suspension on public.profiles;
create trigger proteger_suspension
  before update on public.profiles
  for each row
  execute function private.proteger_columnas_de_suspension();


-- ─── 4) Verificación de solo lectura ─────────────────────────────────────

-- 4.1 · Ninguna de las dos funciones corregidas debe mencionar
-- `pg_catalog.greatest` ni `serialization_failure`. Se espera `f` en ambas.
select
  p.proname as funcion,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as argumentos,
  n.nspname as esquema,
  p.prosecdef as security_definer,
  p.proconfig as configuracion,
  pg_catalog.pg_get_functiondef(p.oid) like '%pg_catalog.greatest%' as usa_greatest_calificado,
  pg_catalog.pg_get_functiondef(p.oid) like '%serialization_failure%' as usa_codigo_reintentable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'private' and p.proname = 'consume_authenticated_rate_limit')
   or (n.nspname = 'public' and p.proname in ('consume_authenticated_rate_limit', 'publish_profile'))
order by n.nspname, p.proname;

-- 4.2 · El contador responde con un retry_after útil en vez de reventar.
-- (Sin sesión levanta 'authentication required', que es el comportamiento
-- correcto; se ejecuta como comprobación de que la función al menos resuelve.)
select 'private.consume_authenticated_rate_limit compila' as comprobacion;

-- 4.3 · El trigger existe, es BEFORE UPDATE FOR EACH ROW y está habilitado
-- ('O' = origin, el estado normal).
select
  t.tgname as trigger,
  c.relname as tabla,
  t.tgenabled as habilitado,
  pg_catalog.pg_get_triggerdef(t.oid) as definicion
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'profiles'
  and not t.tgisinternal
order by t.tgname;

-- 4.4 · El talón de administración existe, es SECURITY DEFINER y no lo puede
-- ejecutar un visitante sin sesión.
select
  p.proname as funcion,
  p.prosecdef as security_definer,
  pg_catalog.has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in ('es_admin', 'proteger_columnas_de_suspension')
order by p.proname;
