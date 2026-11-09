-- F7/F14: el render filtraba suspendidos, pero PostgREST devolvía sus pistas
-- y catálogo directamente. Una política RESTRICTIVE intersecta las políticas
-- permisivas históricas, incluso la lectura legacy de services.
-- No cambia identidad administrativa ni las columnas públicas del perfil.
-- Idempotente, después de 0020. Rollback: retirar estas tres políticas (reabre
-- la exposición; sólo hacerlo con la aplicación fuera de servicio).
drop policy if exists products_suspension on public.products;
create policy products_suspension on public.products as restrictive for select to anon, authenticated
using (exists(select 1 from public.profiles p where p.id = seller_id and p.is_suspended = false));
drop policy if exists services_suspension on public.services;
create policy services_suspension on public.services as restrictive for select to anon, authenticated
using (exists(select 1 from public.profiles p where p.id = profile_id and p.is_suspended = false));
drop policy if exists music_feed_suspension on public.music_feed;
create policy music_feed_suspension on public.music_feed as restrictive for select to anon, authenticated
using (exists(select 1 from public.profiles p where p.id = profile_id and p.is_suspended = false));
-- Verificación:
-- select tablename, policyname, permissive from pg_policies where policyname like '%_suspension';
notify pgrst, 'reload schema';
