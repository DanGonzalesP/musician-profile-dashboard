-- get_profile_role es deliberadamente sólo authenticated. Postgres verifica
-- su EXECUTE incluso cuando otra rama del OR aceptaría un perfil público.
-- Políticas separadas: no conceder RPC de gestión al visitante para resolverlo.
alter policy products_suspension on public.products to authenticated;
alter policy services_suspension on public.services to authenticated;
alter policy music_feed_suspension on public.music_feed to authenticated;

create policy products_suspension_anon on public.products as restrictive for select to anon
using (exists(select 1 from public.profiles p where p.id = seller_id and p.is_suspended = false));
create policy services_suspension_anon on public.services as restrictive for select to anon
using (exists(select 1 from public.profiles p where p.id = profile_id and p.is_suspended = false));
create policy music_feed_suspension_anon on public.music_feed as restrictive for select to anon
using (exists(select 1 from public.profiles p where p.id = profile_id and p.is_suspended = false));
notify pgrst, 'reload schema';
