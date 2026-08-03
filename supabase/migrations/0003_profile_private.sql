-- ═══════════════════════════════════════════════════════════════════════════
-- 0003_profile_private.sql — Saca los datos personales de la tabla pública.
--
-- PROBLEMA QUE RESUELVE (el más grave de la auditoría)
-- `profiles` tiene la política "profiles_select_public ... using (true)" para
-- el rol anon, porque el perfil público y el feed necesitan leerla sin sesión.
-- Pero en esa misma tabla viven:
--   • legal_settings → NOMBRE LEGAL y DNI del artista.
--   • draft_content  → todo el borrador sin publicar.
--   • user_id / owner_user_id → correlación directa con auth.users.
--
-- Con la anon key (que está en el bundle del navegador, por diseño) cualquiera
-- hacía  GET /rest/v1/profiles?select=*  y se llevaba los DNIs y los borradores
-- de TODA la plataforma. Además de un incidente de seguridad, eso es
-- incumplimiento de la Ley 29733 (Perú) y del GDPR.
--
-- POR QUÉ ESTE DISEÑO Y NO OTRO
-- RLS es row-level, no column-level: no se puede decir "todos ven la fila pero
-- solo el dueño ve esta columna". Y los GRANT por columna no sirven acá porque
-- son por rol, no por fila (un usuario autenticado necesita ver SU borrador
-- pero no el de los demás).
--
-- La solución correcta es estructural: los datos privados se mudan a su propia
-- tabla, con su propia RLS de solo-dueño. `profiles` queda con puro dato
-- público, así que su lectura abierta deja de ser un problema y TODOS los
-- joins embebidos del feed (music_feed → profiles, products → profiles...)
-- siguen funcionando igual, sin tocar una sola consulta.
--
-- Idempotente. Correr DESPUÉS de 0002.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) La tabla privada ──────────────────────────────────────────────────

create table if not exists profile_private (
  profile_id uuid primary key references profiles(id) on delete cascade,
  -- Borrador del editor (bloques + productos + servicios sin publicar).
  draft_content jsonb,
  -- Nombre legal y DNI para la Licencia Express. Dato sensible.
  legal_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table profile_private enable row level security;

drop policy if exists "profile_private_select_own" on profile_private;
drop policy if exists "profile_private_insert_own" on profile_private;
drop policy if exists "profile_private_update_own" on profile_private;
drop policy if exists "profile_private_delete_own" on profile_private;

-- Solo quien manda sobre el perfil (dueño personal, dueño de la banda, o un
-- admin aceptado de la banda) ve y toca estos datos. Se reutiliza
-- get_profile_role, que ya centraliza esa regla para el resto del proyecto.
-- Nota: NO se concede a 'editor' de banda — un editor puede tocar el hero,
-- no los datos legales ni el borrador completo.
create policy "profile_private_select_own"
on profile_private for select
to authenticated
using (get_profile_role(profile_id) in ('owner', 'admin'));

create policy "profile_private_insert_own"
on profile_private for insert
to authenticated
with check (get_profile_role(profile_id) in ('owner', 'admin'));

create policy "profile_private_update_own"
on profile_private for update
to authenticated
using (get_profile_role(profile_id) in ('owner', 'admin'))
with check (get_profile_role(profile_id) in ('owner', 'admin'));

create policy "profile_private_delete_own"
on profile_private for delete
to authenticated
using (get_profile_role(profile_id) in ('owner', 'admin'));


-- ─── 2) Migrar los datos que ya existen ───────────────────────────────────
-- Solo copia lo que haya; si las columnas viejas no existen, no hace nada.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('draft_content', 'legal_settings')
  ) then
    execute $mig$
      insert into profile_private (profile_id, draft_content, legal_settings)
      select
        p.id,
        to_jsonb(p) -> 'draft_content',
        coalesce(to_jsonb(p) -> 'legal_settings', '{}'::jsonb)
      from profiles p
      on conflict (profile_id) do update
        set draft_content  = coalesce(excluded.draft_content, profile_private.draft_content),
            legal_settings = case
              when excluded.legal_settings <> '{}'::jsonb then excluded.legal_settings
              else profile_private.legal_settings
            end
    $mig$;
  end if;
end $$;


-- ─── 3) Eliminar las columnas viejas de la tabla pública ──────────────────
-- Este es el paso que de verdad cierra la fuga. Hasta que estas columnas no
-- desaparezcan de `profiles`, siguen siendo legibles por anon.
--
-- Se ejecuta al final y por separado para que, si algo del paso 2 falló,
-- no se pierda nada: revisa primero que profile_private tenga tus datos
-- (select count(*) from profile_private where legal_settings <> '{}') y
-- recién entonces corre esto.

alter table profiles drop column if exists draft_content;
alter table profiles drop column if exists legal_settings;


-- ─── 4) Ocultarle a anon las columnas de correlación con auth.users ───────
-- user_id / owner_user_id no son secretos como un DNI, pero son el puente
-- entre un perfil público y una cuenta real: no hay razón para que un
-- visitante sin sesión los lea. Acá sí sirven los GRANT por columna, porque
-- la regla no depende de la fila: anon simplemente nunca los necesita.
--
-- El rol `authenticated` los conserva porque la lógica de bandas consulta
-- profiles por owner_user_id.

-- El GRANT se arma dinámicamente con las columnas que EXISTEN de verdad: si
-- alguna de la lista no está en tu esquema (por ejemplo created_at), un grant
-- estático abortaría la migración entera.
do $$
declare
  columnas_publicas text[] := array[
    'id', 'display_name', 'bio', 'profile_type', 'unified_profile',
    'accent_color', 'musician_roles', 'musician_category', 'created_at'
  ];
  lista text;
begin
  select string_agg(quote_ident(column_name), ', ')
  into lista
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = any (columnas_publicas);

  if lista is null then
    raise exception 'No se encontro ninguna columna publica en profiles';
  end if;

  execute 'revoke select on profiles from anon';
  execute format('grant select (%s) on profiles to anon', lista);

  raise notice 'anon ahora solo puede leer: %', lista;
end $$;


-- ─── 5) Verificación ──────────────────────────────────────────────────────
-- Corre esto después y confirma que:
--   • profile_private tiene tus filas,
--   • `profiles` ya no tiene draft_content ni legal_settings.

select 'profile_private' as tabla, count(*) as filas from profile_private;

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;
