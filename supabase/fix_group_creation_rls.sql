-- Arregla la creación de grupos musicales (perfiles profile_type='band').
--
-- Causa raíz: harden_profiles_rls.sql borra TODAS las políticas de `profiles`
-- y `profile_blocks` y recrea solo las del perfil personal (auth.uid() =
-- user_id). Eso eliminó las políticas de band_profiles.sql, así que:
--   1. Crear un grupo fallaba — el insert lleva user_id NULL (solo
--      owner_user_id), y ninguna política lo permitía.
--   2. Editar el nombre/borrador de un grupo fallaba — el update exige
--      auth.uid() = user_id, que en un grupo es NULL.
--   3. Los miembros invitados perdieron el acceso de escritura a los bloques.
--
-- Este archivo re-crea las políticas necesarias de forma idempotente.
-- Correr DESPUÉS de harden_profiles_rls.sql (o en cualquier momento: no
-- borra nada de lo que ese archivo creó, solo agrega lo que falta).

-- 1) profiles: crear un grupo propio (user_id NULL, owner_user_id = uno mismo).
drop policy if exists "profiles_insert_band_owner" on profiles;
create policy "profiles_insert_band_owner"
on profiles for insert
to authenticated
with check (profile_type = 'band' and owner_user_id = auth.uid());

-- 2) profiles: el dueño del grupo (y sus administradores aceptados) pueden
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

-- 3) profiles: solo el dueño puede eliminar su grupo.
drop policy if exists "profiles_delete_band_owner" on profiles;
create policy "profiles_delete_band_owner"
on profiles for delete
to authenticated
using (profile_type = 'band' and owner_user_id = auth.uid());

-- 4) profile_blocks: reponer la escritura por rol (get_profile_role viene de
-- band_profiles.sql). El "editor" solo puede tocar el bloque hero; el dueño y
-- los admins pueden todo. Las políticas *_owner de harden_profiles_rls.sql
-- siguen vigentes para el perfil personal — acá solo se agregan las de grupo.
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
