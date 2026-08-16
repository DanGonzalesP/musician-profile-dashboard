-- ═══════════════════════════════════════════════════════════════════════════
-- 0010_validar_bloques.sql — La capa de base de la validación de contenido.
--
-- PROBLEMA QUE RESUELVE (P-08)
-- `lib/blocks.ts` describe la forma de cada bloque con tipos de TypeScript,
-- pero TypeScript se borra al compilar. El navegador —o cualquiera con la anon
-- key y una sesión— puede escribir lo que quiera en `profile_blocks.content`,
-- y `publish_profile` solo comprobaba que el arreglo fuera un arreglo:
-- `block_type` y `position_index` entraban sin mirar.
--
-- Es la superficie sin protección más grande que quedaba en el proyecto.
--
-- DEFENSA EN PROFUNDIDAD
-- La capa de código es `lib/blocks-schema.ts`, que valida en el editor antes
-- de llamar al RPC. Esta es la otra mitad: si el editor se salta (petición
-- directa a PostgREST, cliente viejo, bug), la base rechaza igual.
--
-- ─── POR QUÉ LAS RESTRICCIONES SON `NOT VALID` ────────────────────────────
-- `not valid` NO significa "desactivada". Significa: se aplica a todo INSERT y
-- UPDATE de ahora en adelante, pero no se recorren las filas que ya existen.
--
-- Es deliberado. Una restricción validada de golpe aborta la migración entera
-- si una sola fila histórica no cumple, y en este proyecto hay contenido
-- guardado desde antes de que la lista canónica de `block_type` existiera (el
-- bloque "license" que se retiró del editor, por ejemplo). Abortar la
-- migración por eso dejaría la base sin ninguna protección, que es peor.
--
-- Para validar retroactivamente, cuando se haya confirmado que no queda basura
-- histórica, ver el bloque comentado del final.
--
-- Idempotente. Correr DESPUÉS de 0009.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 0) Diagnóstico previo — CORRER ESTO ANTES Y MIRAR EL RESULTADO ───────
-- Si devuelve filas, hay contenido histórico que las restricciones de abajo
-- rechazarían. No rompe nada (son `not valid`), pero conviene saberlo: es
-- exactamente el registro que el "modo observación" del editor produce.

do $$
declare
  v_malos integer;
begin
  select count(*) into v_malos
  from public.profile_blocks
  where block_type not in (
          'hero','single','crowdfunding','tracks','credits',
          'merch','service','legado','publicaciones','embeds')
     or jsonb_typeof(content) is distinct from 'object'
     or position_index < 0;

  if v_malos > 0 then
    raise notice 'AVISO: % fila(s) de profile_blocks no cumplen las nuevas reglas. Siguen intactas (las restricciones son NOT VALID), pero no se podrán actualizar hasta corregirlas.', v_malos;
  else
    raise notice 'Ninguna fila historica incumple las nuevas reglas: se pueden validar retroactivamente (ver el final del archivo).';
  end if;
end $$;


-- ─── 1) La lista canónica de tipos de bloque ──────────────────────────────
-- Debe coincidir EXACTAMENTE con KNOWN_BLOCK_TYPES de lib/blocks.ts
-- (= BLOCK_LIBRARY + 'embeds'). Si divergen, se rechaza contenido legítimo.
-- Hay una prueba en lib/blocks-schema.test.ts que vigila el lado del código.
--
-- 'embeds' está aunque ya no se ofrezca en la librería: se fusionó con
-- Publicaciones, pero las filas guardadas antes de la fusión siguen ahí y
-- mergePublicacionesEmbeds() las lee. Quitarlo de aquí las volvería
-- inactualizables.

alter table public.profile_blocks
  drop constraint if exists profile_blocks_block_type_valido;

alter table public.profile_blocks
  add constraint profile_blocks_block_type_valido
  check (block_type in (
    'hero',
    'single',
    'crowdfunding',
    'tracks',
    'credits',
    'merch',
    'service',
    'legado',
    'publicaciones',
    'embeds'
  ))
  not valid;


-- ─── 2) `content` tiene que ser un objeto JSON ────────────────────────────
-- Ni un arreglo, ni un número, ni la cadena "null". Todo el código que lee
-- bloques asume un objeto: `normalizeBlockData` hace
-- `raw && typeof raw === "object" ? raw : {}`, o sea que un no-objeto se
-- convierte en un bloque vacío en silencio. Mejor rechazarlo al escribir.
--
-- `null` se permite: es como quedan los bloques sin datos todavía.

alter table public.profile_blocks
  drop constraint if exists profile_blocks_content_es_objeto;

alter table public.profile_blocks
  add constraint profile_blocks_content_es_objeto
  check (content is null or jsonb_typeof(content) = 'object')
  not valid;


-- ─── 3) La posición es un entero no negativo ──────────────────────────────
alter table public.profile_blocks
  drop constraint if exists profile_blocks_position_index_no_negativo;

alter table public.profile_blocks
  add constraint profile_blocks_position_index_no_negativo
  check (position_index >= 0)
  not valid;


-- ─── 4) Techo de tamaño por bloque ────────────────────────────────────────
-- 512 kB, el mismo MAX_BYTES_POR_BLOQUE de lib/blocks-schema.ts. Un bloque
-- real (incluso un `tracks` con 40 pistas) pesa unos pocos kB; esto frena que
-- alguien use profile_blocks como almacenamiento gratuito o infle la tabla
-- hasta degradar el feed.

alter table public.profile_blocks
  drop constraint if exists profile_blocks_content_acotado;

alter table public.profile_blocks
  add constraint profile_blocks_content_acotado
  check (content is null or pg_column_size(content) <= 524288)
  not valid;


-- ─── 5) Índice para leer los bloques de un perfil en orden ────────────────
-- Es la consulta más caliente del proyecto: la hace el editor al abrir y el
-- perfil público en cada visita (y, desde F10, el render del servidor).

create index if not exists profile_blocks_perfil_posicion_idx
  on public.profile_blocks (profile_id, position_index);


-- ─── 6) publish_profile v3 — valida DENTRO de la transacción ──────────────
-- Misma firma (uuid, jsonb, integer) y mismo comportamiento observable que la
-- v2 de 0007: atómica, security invoker, FOR UPDATE, versión optimista, y
-- limpieza del borrador en la misma transacción.
--
-- Lo nuevo: antes de borrar nada, recorre el lote y rechaza el LOTE ENTERO si
-- algún elemento no cumple. Importa que la comprobación vaya ANTES del
-- `delete`: si fuera después, un lote inválido dejaría el perfil vacío hasta
-- que el rollback lo deshaga — y aunque el rollback lo deshace, el orden
-- correcto es no llegar a intentarlo.

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

  -- ─── A partir de aquí, idéntico a 0007 ──────────────────────────────────

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
  if p_expected_version is not null and p_expected_version <> v_actual then
    raise exception 'conflicto_de_version: el perfil fue editado desde otra sesion (version % vs %)',
      p_expected_version, v_actual
      using errcode = 'serialization_failure';
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


-- ─── 7) Validación retroactiva — SOLO cuando el paso 0 diga que no hay basura
-- Descomentar y correr en una migración POSTERIOR (no aquí: forward-only, y
-- este archivo ya está aplicado para cuando se llegue a esto).
--
-- alter table public.profile_blocks validate constraint profile_blocks_block_type_valido;
-- alter table public.profile_blocks validate constraint profile_blocks_content_es_objeto;
-- alter table public.profile_blocks validate constraint profile_blocks_position_index_no_negativo;
-- alter table public.profile_blocks validate constraint profile_blocks_content_acotado;


-- ─── 8) Verificación ──────────────────────────────────────────────────────
-- Debe devolver las 4 restricciones y el índice.

select conname as restriccion, convalidated as validada
from pg_constraint
where conrelid = 'public.profile_blocks'::regclass
  and conname like 'profile_blocks_%'
order by conname;

select indexname from pg_indexes
where schemaname = 'public' and tablename = 'profile_blocks';
