-- ═══════════════════════════════════════════════════════════════════════════
-- 0002_media_assets.sql — Registro de propiedad de los archivos subidos a R2.
--
-- PROBLEMA QUE RESUELVE
-- /api/delete-file solo verificaba que hubiera sesión, nunca que el archivo
-- fuera tuyo. La única protección era un "¿alguien más lo menciona?" que
-- serializaba media base a un string y buscaba la URL dentro. Eso fallaba de
-- dos maneras:
--   1. Cualquier usuario autenticado podía borrar el archivo de otro con solo
--      conocer su URL (que es pública: está en el HTML de cada perfil).
--   2. PostgREST corta en 1000 filas. Pasado ese punto el string quedaba
--      incompleto y se borraban archivos que SÍ estaban en uso.
--
-- Con esta tabla la autorización pasa a ser un hecho registrado ("quién subió
-- este archivo") en vez de una búsqueda de texto. Es además la base para las
-- cuotas de almacenamiento por usuario (Fase 3).
--
-- Idempotente: se puede correr varias veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists media_assets (
  -- La key de R2 tal cual ("images/1738...-a1b2c3.webp"). Es el identificador
  -- natural: única por definición y derivable de la URL pública.
  key text primary key,
  -- Quién la subió. Es el sujeto de la autorización de borrado.
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  -- Perfil sobre el que se estaba trabajando al subir (personal o banda).
  -- Nullable a propósito: sirve para cuotas y reportes, no para permisos.
  profile_id uuid references profiles(id) on delete set null,
  folder text not null check (folder in ('images', 'audio', 'video')),
  content_type text,
  -- Tamaño declarado por el cliente al pedir la URL firmada. Orientativo
  -- (R2 es la fuente de verdad), suficiente para sumar cuotas.
  bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists media_assets_owner_idx on media_assets (owner_user_id, created_at desc);
create index if not exists media_assets_profile_idx on media_assets (profile_id);

alter table media_assets enable row level security;

drop policy if exists "media_assets_select_own" on media_assets;
drop policy if exists "media_assets_insert_own" on media_assets;
drop policy if exists "media_assets_delete_own" on media_assets;

-- Nadie ve los archivos de nadie más. No hay lectura pública: los archivos en
-- sí ya son públicos vía R2, pero QUIÉN subió QUÉ no tiene por qué serlo.
create policy "media_assets_select_own"
on media_assets for select
to authenticated
using (owner_user_id = auth.uid());

-- El insert lo hace /api/upload-url en nombre del usuario, con su propio JWT,
-- así que esta política se evalúa con auth.uid() = el usuario real.
create policy "media_assets_insert_own"
on media_assets for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy "media_assets_delete_own"
on media_assets for delete
to authenticated
using (owner_user_id = auth.uid());


-- ─── Backfill OPCIONAL de los archivos ya existentes ──────────────────────
-- Los archivos subidos ANTES de esta migración no tienen fila acá, así que
-- /api/delete-file se negará a borrarlos (falla segura: preferimos dejar un
-- huérfano a borrar algo ajeno). La limpieza de esos históricos la hace
-- /api/cleanup-orphaned-files, que ahora es solo para administradores.
--
-- Si quieres además adoptarlos para que el borrado automático vuelva a
-- cubrirlos, descomenta el bloque de abajo y reemplaza la URL pública de tu
-- bucket. Extrae toda URL de R2 que aparezca en el contenido de los bloques y
-- se la atribuye al dueño del perfil que la usa.
--
-- do $$
-- declare
--   r2_base text := 'https://TU-BUCKET-PUBLICO.r2.dev';  -- <— reemplaza esto
-- begin
--   insert into media_assets (key, owner_user_id, profile_id, folder)
--   select distinct
--     substring(m.url from length(r2_base) + 2) as key,
--     coalesce(p.user_id, p.owner_user_id) as owner_user_id,
--     p.id as profile_id,
--     split_part(substring(m.url from length(r2_base) + 2), '/', 1) as folder
--   from profile_blocks b
--   join profiles p on p.id = b.profile_id
--   cross join lateral (
--     select unnest(regexp_matches(b.content::text, r2_base || '/[^"\\]+', 'g')) as url
--   ) m
--   where coalesce(p.user_id, p.owner_user_id) is not null
--     and split_part(substring(m.url from length(r2_base) + 2), '/', 1)
--         in ('images', 'audio', 'video')
--   on conflict (key) do nothing;
-- end $$;
