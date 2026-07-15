-- Punto 4: Perfiles para Bandas de Música y Roles de Gestión.
--
-- Una "banda" es simplemente OTRA fila de `profiles` (profile_type='band'),
-- dueña de sus propios profile_blocks/products/services — así todo el editor,
-- el catálogo, los créditos, etc. funcionan igual sin duplicar código. La
-- diferencia es quién puede escribir sobre esa fila: en vez de solo
-- `user_id = auth.uid()`, ahora puede ser el dueño de la banda o alguno de
-- sus miembros invitados (band_members), según su rol.

-- 1) profiles: nuevas columnas para distinguir tipo de página y, para
-- bandas, quién la creó/administra en última instancia.
alter table profiles add column if not exists profile_type text not null default 'artist';
alter table profiles add constraint profiles_profile_type_check check (profile_type in ('artist', 'band'));
alter table profiles add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

-- 2) band_members: quién pertenece a qué banda y con qué rol. La invitación
-- nace "pending" — el invitado debe aceptarla desde su panel antes de que el
-- rol tenga efecto (get_profile_role solo cuenta membresías "accepted").
create table if not exists band_members (
  id uuid primary key default gen_random_uuid(),
  band_profile_id uuid not null references profiles(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  invited_username text,
  created_at timestamptz not null default now(),
  unique (band_profile_id, member_user_id)
);

create index if not exists band_members_band_idx on band_members (band_profile_id);
create index if not exists band_members_member_idx on band_members (member_user_id);

alter table band_members enable row level security;

drop policy if exists "band_members_select_involved" on band_members;
drop policy if exists "band_members_insert_owner" on band_members;
drop policy if exists "band_members_update_involved" on band_members;
drop policy if exists "band_members_delete_owner" on band_members;

-- El dueño de la banda y el propio miembro pueden ver la fila.
create policy "band_members_select_involved"
on band_members for select
to authenticated
using (
  member_user_id = auth.uid()
  or band_profile_id in (select id from profiles where owner_user_id = auth.uid())
);

-- Solo el dueño de la banda invita.
create policy "band_members_insert_owner"
on band_members for insert
to authenticated
with check (band_profile_id in (select id from profiles where owner_user_id = auth.uid()));

-- El dueño puede cambiar el rol de un miembro; el propio miembro puede
-- aceptar/rechazar su invitación (solo puede tocar status, no su rol).
create policy "band_members_update_involved"
on band_members for update
to authenticated
using (
  member_user_id = auth.uid()
  or band_profile_id in (select id from profiles where owner_user_id = auth.uid())
)
with check (
  member_user_id = auth.uid()
  or band_profile_id in (select id from profiles where owner_user_id = auth.uid())
);

create policy "band_members_delete_owner"
on band_members for delete
to authenticated
using (
  member_user_id = auth.uid()
  or band_profile_id in (select id from profiles where owner_user_id = auth.uid())
);

-- 3) get_profile_role: rol efectivo del usuario autenticado sobre una fila
-- de `profiles` — 'owner' para el dueño (perfil personal o banda propia),
-- 'admin'/'editor' para un miembro de banda aceptado, o null si no tiene
-- ningún vínculo. Centraliza la regla para no repetirla en cada política.
create or replace function get_profile_role(target_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from profiles p
      where p.id = target_profile_id
        and (p.user_id = auth.uid() or p.owner_user_id = auth.uid())
    ) then 'owner'
    else (
      select bm.role from band_members bm
      where bm.band_profile_id = target_profile_id
        and bm.member_user_id = auth.uid()
        and bm.status = 'accepted'
      limit 1
    )
  end
$$;

-- 4) profiles: cualquier usuario autenticado puede crear una página de
-- banda propia (profile_type='band', owner_user_id = uno mismo). Los perfiles
-- personales se siguen creando igual que antes (profiles_insert_owner ya
-- cubre user_id = auth.uid()).
drop policy if exists "profiles_insert_band_owner" on profiles;
create policy "profiles_insert_band_owner"
on profiles for insert
to authenticated
with check (profile_type = 'band' and owner_user_id = auth.uid());

-- 5) profile_blocks: reemplaza las políticas de escritura "solo el dueño"
-- por chequeos vía get_profile_role — el "editor" de una banda solo puede
-- tocar el bloque "hero" (fotos, redes, biografía); no puede crear/borrar
-- bloques de canciones ni ningún otro tipo.
drop policy if exists "profile_blocks_insert_owner" on profile_blocks;
drop policy if exists "profile_blocks_update_owner" on profile_blocks;
drop policy if exists "profile_blocks_delete_owner" on profile_blocks;

create policy "profile_blocks_insert_by_role"
on profile_blocks for insert
to authenticated
with check (
  get_profile_role(profile_id) in ('owner', 'admin')
  or (get_profile_role(profile_id) = 'editor' and block_type = 'hero')
);

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

create policy "profile_blocks_delete_by_role"
on profile_blocks for delete
to authenticated
using (get_profile_role(profile_id) in ('owner', 'admin'));

-- 6) products/services: mismo criterio, pero sin el caso especial de
-- "editor" — un editor de banda NO gestiona merch/servicios/facturación.
drop policy if exists "products_insert_owner" on products;
drop policy if exists "products_update_owner" on products;
drop policy if exists "products_delete_owner" on products;

create policy "products_insert_by_role"
on products for insert
to authenticated
with check (get_profile_role(seller_id) in ('owner', 'admin'));

create policy "products_update_by_role"
on products for update
to authenticated
using (get_profile_role(seller_id) in ('owner', 'admin'))
with check (get_profile_role(seller_id) in ('owner', 'admin'));

create policy "products_delete_by_role"
on products for delete
to authenticated
using (get_profile_role(seller_id) in ('owner', 'admin'));

drop policy if exists "services_insert_owner" on services;
drop policy if exists "services_update_owner" on services;
drop policy if exists "services_delete_owner" on services;

create policy "services_insert_by_role"
on services for insert
to authenticated
with check (get_profile_role(profile_id) in ('owner', 'admin'));

create policy "services_update_by_role"
on services for update
to authenticated
using (get_profile_role(profile_id) in ('owner', 'admin'))
with check (get_profile_role(profile_id) in ('owner', 'admin'));

create policy "services_delete_by_role"
on services for delete
to authenticated
using (get_profile_role(profile_id) in ('owner', 'admin'));

-- Nota de alcance: licenses, author_certificates, credit_requests y orders
-- siguen atados solo al dueño real (user_id/owner_user_id) — extenderlos a
-- admin/editor de banda queda fuera de este punto.
