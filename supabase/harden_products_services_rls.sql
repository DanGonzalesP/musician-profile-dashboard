-- Cierra "products_all_anon" y "services_all_anon": ambas son ALL con
-- qual/with_check = true para anon + authenticated, es decir, CUALQUIER
-- visitante sin sesión puede insertar, editar o borrar productos/servicios
-- de cualquier artista. Es el hueco real detrás de las advertencias.
--
-- La lectura pública se mantiene intacta: "Permitir lectura publica de
-- productos/servicios" ya existe por separado y sigue funcionando igual.

drop policy if exists "products_all_anon" on products;

create policy "products_select_public"
on products for select
to anon, authenticated
using (true);

create policy "products_insert_owner"
on products for insert
to authenticated
with check (seller_id in (select id from profiles where user_id = auth.uid()));

create policy "products_update_owner"
on products for update
to authenticated
using (seller_id in (select id from profiles where user_id = auth.uid()))
with check (seller_id in (select id from profiles where user_id = auth.uid()));

create policy "products_delete_owner"
on products for delete
to authenticated
using (seller_id in (select id from profiles where user_id = auth.uid()));


drop policy if exists "services_all_anon" on services;

create policy "services_insert_owner"
on services for insert
to authenticated
with check (profile_id in (select id from profiles where user_id = auth.uid()));

create policy "services_update_owner"
on services for update
to authenticated
using (profile_id in (select id from profiles where user_id = auth.uid()))
with check (profile_id in (select id from profiles where user_id = auth.uid()));

create policy "services_delete_owner"
on services for delete
to authenticated
using (profile_id in (select id from profiles where user_id = auth.uid()));

-- Nota: no se crea "products_select_public" para services porque ya existe
-- "Permitir lectura publica de servicios" con el mismo efecto — crear otra
-- sería una política duplicada, no un problema en sí, pero innecesaria.
