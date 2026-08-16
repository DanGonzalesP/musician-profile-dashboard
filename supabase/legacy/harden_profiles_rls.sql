-- Endurece las políticas de RLS de 'profiles' y 'profile_blocks'.
--
-- Diagnóstico primero: lista TODAS las políticas actuales de ambas tablas
-- para que veas exactamente qué se va a reemplazar (corre esto solo, mira el
-- resultado, y luego corre el resto del archivo).
--
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where tablename in ('profiles', 'profile_blocks');

-- 1) Elimina TODAS las políticas existentes de estas dos tablas, sin
-- importar su nombre — así no queda ninguna política permisiva vieja
-- ("Allow all access", "public_update_profile_blocks", etc.) conviviendo
-- con las nuevas (en Postgres, las políticas de RLS se combinan con OR: si
-- una sola sigue diciendo "true", las nuevas no sirven de nada).
do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where tablename = 'profiles' loop
    execute format('drop policy if exists %I on profiles', pol.policyname);
  end loop;
  for pol in select policyname from pg_policies where tablename = 'profile_blocks' loop
    execute format('drop policy if exists %I on profile_blocks', pol.policyname);
  end loop;
end $$;

alter table profiles enable row level security;
alter table profile_blocks enable row level security;

-- 2) profiles: la LECTURA se mantiene pública (el perfil público y el QR
-- dependen de que cualquiera pueda leer profiles por display_name/id sin
-- estar logueado). Solo INSERT/UPDATE/DELETE quedan atados al dueño real.
create policy "profiles_select_public"
on profiles for select
to anon, authenticated
using (true);

create policy "profiles_insert_owner"
on profiles for insert
to authenticated
with check (auth.uid() = user_id);

create policy "profiles_update_owner"
on profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "profiles_delete_owner"
on profiles for delete
to authenticated
using (auth.uid() = user_id);

-- 3) profile_blocks: misma idea. LECTURA pública (el perfil público lee los
-- bloques de cualquier artista), escritura solo para el dueño del profile_id.
create policy "profile_blocks_select_public"
on profile_blocks for select
to anon, authenticated
using (true);

create policy "profile_blocks_insert_owner"
on profile_blocks for insert
to authenticated
with check (profile_id in (select id from profiles where user_id = auth.uid()));

create policy "profile_blocks_update_owner"
on profile_blocks for update
to authenticated
using (profile_id in (select id from profiles where user_id = auth.uid()))
with check (profile_id in (select id from profiles where user_id = auth.uid()));

create policy "profile_blocks_delete_owner"
on profile_blocks for delete
to authenticated
using (profile_id in (select id from profiles where user_id = auth.uid()));
