-- ═══════════════════════════════════════════════════════════════════════════
-- 0011_limites_de_escritura.sql — Anti-abuso donde de verdad hace falta.
--
-- PROBLEMA QUE RESUELVE (P-09)
-- El rate limit de la aplicación cubre 4 rutas de API. Pero comentarios,
-- preguntas, reportes y bloqueos NO pasan por ninguna función serverless: el
-- navegador escribe DIRECTO contra PostgREST con la anon key. Ningún contador
-- de Node los ve nunca. Spam trivial, sin ningún freno.
--
-- POR QUÉ EN POSTGRES Y NO EN REDIS
-- Porque el problema difícil ya está resuelto en 0009: contador atómico con un
-- UPSERT sin condición de carrera, `security definer`, atado a `auth.uid()`.
-- Extenderlo a triggers es barato, no añade proveedor, no añade costo y —lo
-- importante— vive exactamente donde ocurre la escritura, así que no hay forma
-- de saltárselo. Redis/Upstash queda descartado salvo que la medición de F12
-- demuestre que este contador es un cuello de botella real.
--
-- LÍMITES: se despliegan GENEROSOS a propósito (§F5, mitigación del riesgo).
-- Un límite mal calibrado frustra a un usuario legítimo, y eso es peor que
-- dejar pasar algo de spam la primera semana. Se ajustan con las métricas de
-- F12, bajándolos, nunca al revés.
--
-- Idempotente. Correr DESPUÉS de 0009.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) Ventanas de escritura ─────────────────────────────────────────────
-- Tabla propia y no `rate_limit_windows` de 0009 por dos motivos: aquí el
-- sujeto no siempre es un usuario con sesión (un reporte de copyright puede
-- venir de un titular de derechos sin cuenta), y la clave es texto libre
-- normalizado, no un uuid de auth.users.

create table if not exists public.write_rate_limit_windows (
  bucket text not null,
  -- Sujeto del límite. Para escrituras con sesión: 'user:<uuid>'. Para
  -- reportes anónimos: 'email:<correo normalizado>' o 'global:<bucket>'.
  -- NUNCA se guarda el correo en claro: ver hash_sujeto() más abajo.
  sujeto text not null,
  started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (bucket, sujeto)
);

alter table public.write_rate_limit_windows enable row level security;

-- Sin políticas: nadie lee ni escribe esta tabla directamente. Solo la toca la
-- función `security definer` de abajo. Es la falla segura — si alguien pudiera
-- borrar sus propias filas, el límite sería decorativo.

create index if not exists write_rate_limit_windows_started_idx
  on public.write_rate_limit_windows (started_at);


-- ─── 2) Hash del sujeto ───────────────────────────────────────────────────
-- El correo de quien reporta es un dato personal. Como clave del contador solo
-- hace falta que sea estable y única, no legible: se guarda su hash. Así la
-- tabla de límites no se convierte en un directorio de correos.

-- `sha256(bytea)` es una función del núcleo de Postgres desde la 11: no hace
-- falta pgcrypto ni depender de en qué esquema lo instaló Supabase.
--
-- Sin sal: la tabla no tiene NINGUNA política de RLS, así que ni anon ni
-- authenticated pueden leerla, y el hash existe para que un volcado accidental
-- no sea un directorio de correos, no para resistir un ataque con la base ya
-- comprometida.

create or replace function public.hash_sujeto(p_valor text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(lower(trim(p_valor)), 'UTF8')), 'hex');
$$;


-- ─── 3) El contador ───────────────────────────────────────────────────────
-- Misma mecánica que consume_authenticated_rate_limit de 0009: un solo UPSERT
-- atómico que crea la ventana, la reinicia si venció, o suma una petición.
-- ON CONFLICT cubre las filas que aún no existen, cosa que FOR UPDATE no hace
-- (fue el bug que 0009 corrigió; no se repite aquí).
--
-- Devuelve true si la escritura está permitida.

create or replace function public.check_write_rate_limit(
  p_bucket text,
  p_sujeto text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := now();
  v_count integer;
begin
  if p_bucket !~ '^[a-z0-9_-]{1,64}$' or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters';
  end if;
  if p_sujeto is null or length(p_sujeto) = 0 then
    -- Sin sujeto no hay a quién contar: se deja pasar en vez de bloquear a
    -- todos por igual. El caso no debería darse (los triggers siempre pasan uno).
    return true;
  end if;

  insert into public.write_rate_limit_windows as w (bucket, sujeto, started_at, request_count)
  values (p_bucket, p_sujeto, now_at, 1)
  on conflict (bucket, sujeto) do update
    set started_at = case
          when w.started_at <= now_at - make_interval(secs => p_window_seconds) then now_at
          else w.started_at
        end,
        request_count = case
          when w.started_at <= now_at - make_interval(secs => p_window_seconds) then 1
          else w.request_count + 1
        end
  returning w.request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_write_rate_limit(text, text, integer, integer) from public, anon, authenticated;


-- ─── 4) Poda de ventanas vencidas ─────────────────────────────────────────
-- Sin esto la tabla crece sin techo. Se llama de forma perezosa desde el
-- trigger (1 de cada ~200 escrituras), que para el volumen de Vibe es de sobra
-- y evita depender de pg_cron.

create or replace function public.podar_write_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.write_rate_limit_windows
  where started_at < now() - interval '2 days';
$$;

revoke all on function public.podar_write_rate_limits() from public, anon, authenticated;


-- ─── 5) El trigger genérico ───────────────────────────────────────────────
-- Un solo cuerpo para todas las tablas. Los parámetros llegan por TG_ARGV:
--   TG_ARGV[0] = bucket
--   TG_ARGV[1] = límite
--   TG_ARGV[2] = ventana en segundos
--   TG_ARGV[3] = nombre de la columna de usuario de la tabla. Se declara para
--                que cada trigger documente a quién pertenece la fila, pero el
--                contador NO la usa: el sujeto sale de auth.uid(), que el
--                cliente no puede falsificar. Ver el comentario del paso 1.
--   TG_ARGV[4] = (opcional) columna de correo, para las escrituras sin sesión
--
-- El mensaje de la excepción es estable a propósito: `limite_de_escritura` es
-- lo que lib/rate-limit-errors.ts busca para traducirlo al toast amable que la
-- interfaz YA usa. La UI no cambia: mismo toast, distinto texto.

create or replace function public.aplicar_limite_de_escritura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket text := TG_ARGV[0];
  v_limite integer := TG_ARGV[1]::integer;
  v_ventana integer := TG_ARGV[2]::integer;
  v_col_correo text := case when TG_NARGS > 4 then TG_ARGV[4] else null end;
  v_uid uuid := auth.uid();
  v_sujeto text;
  v_correo text;
  v_fila jsonb := to_jsonb(NEW);
begin
  -- Poda perezosa.
  if random() < 0.005 then
    perform public.podar_write_rate_limits();
  end if;

  -- 1) Con sesión: el sujeto es el usuario. Se usa auth.uid() y NO el valor de
  --    la columna, porque la columna la manda el cliente y podría mentir; la
  --    RLS ya obliga a que coincidan, pero el contador no debe depender de eso.
  if v_uid is not null then
    v_sujeto := 'user:' || v_uid::text;
  elsif v_col_correo is not null and v_fila ? v_col_correo
        and nullif(trim(v_fila ->> v_col_correo), '') is not null then
    -- 2) Sin sesión, con correo declarado (reporte de copyright de un titular
    --    de derechos que no tiene cuenta): el cupo va por correo normalizado.
    v_correo := v_fila ->> v_col_correo;
    v_sujeto := 'email:' || public.hash_sujeto(v_correo);
  else
    -- 3) Sin sesión y sin correo: no hay a quién atribuirlo. Cae al cupo
    --    global del bucket, que existe para que un anónimo no sature la cola
    --    de moderación. Es deliberadamente estrecho.
    v_sujeto := 'global';
  end if;

  if not public.check_write_rate_limit(v_bucket, v_sujeto, v_limite, v_ventana) then
    raise exception 'limite_de_escritura: demasiadas escrituras en %', v_bucket
      using errcode = 'check_violation';
  end if;

  -- Tope global adicional para lo anónimo: aunque cada correo tenga su cupo,
  -- nadie debería poder llenar la cola de moderación desde fuera.
  if v_uid is null and v_col_correo is not null then
    if not public.check_write_rate_limit(v_bucket || '_global', 'global', v_limite * 20, 86400) then
      raise exception 'limite_de_escritura: demasiadas escrituras anonimas en %', v_bucket
        using errcode = 'check_violation';
    end if;
  end if;

  return NEW;
end;
$$;

-- Es `security definer` (necesita escribir en una tabla que nadie más toca),
-- así que no se deja con el EXECUTE que Postgres concede a PUBLIC por defecto.
-- Llamarla a mano fallaría igual —plpgsql rechaza una función de trigger
-- invocada fuera de un trigger—, pero el privilegio mínimo no depende de que
-- ese detalle siga siendo cierto. El disparo del trigger no comprueba EXECUTE:
-- el privilegio se verifica al CREAR el trigger, no al ejecutarlo.
revoke all on function public.aplicar_limite_de_escritura() from public, anon, authenticated;


-- ─── 6) Los triggers, tabla por tabla ─────────────────────────────────────
-- Límites propuestos por el plan, desplegados a 3× (mitigación explícita de
-- §F5). Un artista comentando activamente en el feed jamás toca 90 en una
-- hora; un script sí.
--
--   comentarios de publicaciones  30/h  →  90/h
--   comentarios de pistas         30/h  →  90/h
--   preguntas                     10/h  →  30/h
--   reportes                       5/h  →  15/h
--   bloqueos                      50/h  → 150/h
--
-- `create trigger` no admite `if not exists` en todas las versiones; el
-- `drop ... if exists` previo hace la migración idempotente igual.

do $$
begin
  if to_regclass('public.feed_post_comments') is not null then
    drop trigger if exists limite_escritura on public.feed_post_comments;
    create trigger limite_escritura
      before insert on public.feed_post_comments
      for each row execute function public.aplicar_limite_de_escritura(
        'comentarios_publicacion', '90', '3600', 'user_id');
  end if;

  if to_regclass('public.feed_comments') is not null then
    drop trigger if exists limite_escritura on public.feed_comments;
    create trigger limite_escritura
      before insert on public.feed_comments
      for each row execute function public.aplicar_limite_de_escritura(
        'comentarios_pista', '90', '3600', 'user_id');
  end if;

  if to_regclass('public.profile_questions') is not null then
    drop trigger if exists limite_escritura on public.profile_questions;
    create trigger limite_escritura
      before insert on public.profile_questions
      for each row execute function public.aplicar_limite_de_escritura(
        'preguntas', '30', '3600', 'asker_user_id');
  end if;

  if to_regclass('public.content_reports') is not null then
    drop trigger if exists limite_escritura on public.content_reports;
    create trigger limite_escritura
      before insert on public.content_reports
      for each row execute function public.aplicar_limite_de_escritura(
        'reportes', '15', '3600', 'reporter_user_id', 'reporter_email');
  end if;

  if to_regclass('public.user_blocks') is not null then
    drop trigger if exists limite_escritura on public.user_blocks;
    create trigger limite_escritura
      before insert on public.user_blocks
      for each row execute function public.aplicar_limite_de_escritura(
        'bloqueos', '150', '3600', 'blocker_user_id');
  end if;
end $$;


-- ─── 7) Longitud máxima en los campos de texto libre que no la tenían ─────
-- `feed_comments.content`, `feed_post_comments.content`, `profile_questions.message`
-- y `content_reports.details` ya tienen su `check`. Los que faltaban:

do $$
begin
  -- Nombre de autor mostrado junto al comentario. Sin techo, un solo comentario
  -- podía reventar el layout del feed con 100 kB de texto.
  if to_regclass('public.feed_comments') is not null
     and not exists (select 1 from pg_constraint where conname = 'feed_comments_author_name_acotado') then
    alter table public.feed_comments
      add constraint feed_comments_author_name_acotado
      check (author_name is null or char_length(author_name) <= 120) not valid;
  end if;

  if to_regclass('public.feed_post_comments') is not null
     and not exists (select 1 from pg_constraint where conname = 'feed_post_comments_author_name_acotado') then
    alter table public.feed_post_comments
      add constraint feed_post_comments_author_name_acotado
      check (author_name is null or char_length(author_name) <= 120) not valid;
  end if;

  if to_regclass('public.feed_post_comments') is not null
     and not exists (select 1 from pg_constraint where conname = 'feed_post_comments_post_id_acotado') then
    alter table public.feed_post_comments
      add constraint feed_post_comments_post_id_acotado
      check (char_length(post_id) <= 200) not valid;
  end if;

  if to_regclass('public.profile_questions') is not null
     and not exists (select 1 from pg_constraint where conname = 'profile_questions_etiquetas_acotadas') then
    alter table public.profile_questions
      add constraint profile_questions_etiquetas_acotadas
      check (char_length(block_type) <= 60
             and char_length(block_label) <= 200
             and (asker_display_name is null or char_length(asker_display_name) <= 120)) not valid;
  end if;

  if to_regclass('public.content_reports') is not null
     and not exists (select 1 from pg_constraint where conname = 'content_reports_campos_acotados') then
    alter table public.content_reports
      add constraint content_reports_campos_acotados
      check ((reporter_email is null or char_length(reporter_email) <= 320)
             and (target_id is null or char_length(target_id) <= 200)
             and (moderator_notes is null or char_length(moderator_notes) <= 4000)) not valid;
  end if;
end $$;


-- ─── 8) Verificación ──────────────────────────────────────────────────────
-- Deben aparecer los 5 triggers.

select
  c.relname as tabla,
  t.tgname as trigger
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and t.tgname = 'limite_escritura'
order by c.relname;
