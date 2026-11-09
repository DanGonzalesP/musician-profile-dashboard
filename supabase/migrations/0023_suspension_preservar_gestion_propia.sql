-- La suspensión corta la distribución pública, no la gestión privada existente.
-- Ocultar también al dueño vuelve invisible el catálogo para DELETE/UPDATE:
-- publicar podría conservar filas antiguas y añadir otras. Se mantiene la RLS
-- de escritura original y se permite leer únicamente a owner/admin del perfil.
alter policy products_suspension on public.products using (
  exists(select 1 from public.profiles p where p.id = seller_id and
    (p.is_suspended = false or public.get_profile_role(p.id) in ('owner','admin')))
);
alter policy services_suspension on public.services using (
  exists(select 1 from public.profiles p where p.id = profile_id and
    (p.is_suspended = false or public.get_profile_role(p.id) in ('owner','admin')))
);
alter policy music_feed_suspension on public.music_feed using (
  exists(select 1 from public.profiles p where p.id = profile_id and
    (p.is_suspended = false or public.get_profile_role(p.id) in ('owner','admin')))
);
notify pgrst, 'reload schema';
