-- ═══════════════════════════════════════════════════════════════════════════
-- setup_decima.sql — ÚNICA migración pendiente. Corre este archivo COMPLETO
-- en el SQL Editor de Supabase y la app queda lista para funcionar con
-- varios usuarios reales. Es idempotente: puedes correrlo las veces que
-- quieras sin romper nada.
--
-- Incluye (y reemplaza) las migraciones que estaban pendientes:
--   • fix_group_creation_rls.sql  (crear/editar grupos musicales)
--   • profiles_musician_category.sql  (ahora superada por musician_roles)
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) Registro multi-usuario: cada cuenta nueva recibe su fila en
-- `profiles` automáticamente (la app también lo intenta desde el cliente,
-- esto es el respaldo a nivel de base de datos). ──────────────────────────

-- Un solo perfil personal por usuario (las filas de grupos llevan user_id
-- NULL y no entran en el índice).
create unique index if not exists profiles_user_artist_unique
  on profiles (user_id)
  where user_id is not null and profile_type = 'artist';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, profile_type, display_name)
  values (new.id, 'artist', split_part(coalesce(new.email, 'artista'), '@', 1))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ─── 2) Roles profesionales: un perfil puede tener VARIOS roles (text[]).
-- Reemplaza a la columna vieja musician_category (que queda intacta como
-- respaldo; la app ya no la escribe). ─────────────────────────────────────

alter table profiles add column if not exists musician_roles text[] not null default '{}';

do $$ begin
  alter table profiles add constraint profiles_musician_roles_check check (
    musician_roles <@ array[
      'autores', 'compositores', 'arreglistas', 'directores',
      'productores', 'mezclas', 'musicos'
    ]::text[]
  );
exception when duplicate_object then null;
end $$;

-- Traduce la categoría vieja (si existe y la fila aún no tiene roles):
-- interpretes → musicos, tecnicos → mezclas; el resto conserva su nombre.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'musician_category'
  ) then
    update profiles
    set musician_roles = array[
      case musician_category
        when 'interpretes' then 'musicos'
        when 'tecnicos' then 'mezclas'
        else musician_category
      end
    ]
    where musician_category is not null and musician_roles = '{}';
  end if;
end $$;


-- ─── 3) Comentarios del feed principal (estilo TikTok) ────────────────────

create table if not exists feed_comments (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references music_feed(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists feed_comments_track_idx on feed_comments (track_id, created_at desc);

alter table feed_comments enable row level security;

drop policy if exists "feed_comments_select_public" on feed_comments;
create policy "feed_comments_select_public"
on feed_comments for select
to anon, authenticated
using (true);

drop policy if exists "feed_comments_insert_own" on feed_comments;
create policy "feed_comments_insert_own"
on feed_comments for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "feed_comments_delete_own" on feed_comments;
create policy "feed_comments_delete_own"
on feed_comments for delete
to authenticated
using (user_id = auth.uid());


-- ─── 4) Grupos musicales: repone las políticas que harden_profiles_rls.sql
-- borró (idéntico a fix_group_creation_rls.sql — si ya lo corriste, esto
-- simplemente las recrea igual). ──────────────────────────────────────────

-- profiles: crear un grupo propio (user_id NULL, owner_user_id = uno mismo).
drop policy if exists "profiles_insert_band_owner" on profiles;
create policy "profiles_insert_band_owner"
on profiles for insert
to authenticated
with check (profile_type = 'band' and owner_user_id = auth.uid());

-- profiles: el dueño del grupo (y sus administradores aceptados) pueden
-- actualizar la fila del grupo — nombre, bio, borrador (draft_content), etc.
drop policy if exists "profiles_update_band_managers" on profiles;
create policy "profiles_update_band_managers"
on profiles for update
to authenticated
using (
  profile_type = 'band'
  and (
    owner_user_id = auth.uid()
    or id in (
      select band_profile_id from band_members
      where member_user_id = auth.uid() and status = 'accepted' and role = 'admin'
    )
  )
)
with check (
  profile_type = 'band'
  and (
    owner_user_id = auth.uid()
    or id in (
      select band_profile_id from band_members
      where member_user_id = auth.uid() and status = 'accepted' and role = 'admin'
    )
  )
);

-- profiles: solo el dueño puede eliminar su grupo.
drop policy if exists "profiles_delete_band_owner" on profiles;
create policy "profiles_delete_band_owner"
on profiles for delete
to authenticated
using (profile_type = 'band' and owner_user_id = auth.uid());

-- profile_blocks: escritura por rol (get_profile_role viene de
-- band_profiles.sql). El "editor" solo puede tocar el bloque hero; el dueño
-- y los admins pueden todo.
drop policy if exists "profile_blocks_insert_by_role" on profile_blocks;
create policy "profile_blocks_insert_by_role"
on profile_blocks for insert
to authenticated
with check (
  get_profile_role(profile_id) in ('owner', 'admin')
  or (get_profile_role(profile_id) = 'editor' and block_type = 'hero')
);

drop policy if exists "profile_blocks_update_by_role" on profile_blocks;
create policy "profile_blocks_update_by_role"
on profile_blocks for update
to authenticated
using (
  get_profile_role(profile_id) in ('owner', 'admin')
  or (get_profile_role(profile_id) = 'editor' and block_type = 'hero')
)
with check (
  get_profile_role(profile_id) in ('owner', 'admin')
  or (get_profile_role(profile_id) = 'editor' and block_type = 'hero')
);

drop policy if exists "profile_blocks_delete_by_role" on profile_blocks;
create policy "profile_blocks_delete_by_role"
on profile_blocks for delete
to authenticated
using (get_profile_role(profile_id) in ('owner', 'admin'));
