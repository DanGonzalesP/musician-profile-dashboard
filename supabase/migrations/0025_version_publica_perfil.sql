-- El render público consulta content_version antes de leer la caché para
-- detectar publicaciones aunque se pierda la invalidación. Las allowlists de
-- 0003/0006 no concedían esa columna a anon: PostgREST rechazaba la consulta
-- completa y el render degradaba silenciosamente al cliente, sin llenar R2.
-- Sólo se expone el contador público, nunca SELECT de toda la tabla. RLS y
-- los permisos de escritura permanecen vigentes.
grant select (content_version) on public.profiles to anon;
notify pgrst, 'reload schema';
