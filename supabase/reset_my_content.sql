-- Vacía el contenido publicado y el borrador de TU perfil personal, para
-- empezar de cero subiendo todo de nuevo ya en mp3/aac (sin pasar por wav).
-- No toca cuentas de otros usuarios ni tablas de sistema (auth.*).
--
-- Correr en Supabase Dashboard > SQL Editor, con la sesión completa (los
-- botones "Run" del SQL Editor corren como postgres, sin necesitar RLS).
--
-- Esto NO borra los archivos ya subidos en Supabase Storage (bucket
-- "assets") ni nada en R2 — eso se limpia aparte, a mano, desde:
--   Supabase Dashboard > Storage > bucket "assets" > seleccionar todo > Delete
-- (no hace falta si preferís simplemente dejarlos ahí sin usar).

do $$
declare
  target_profile_id uuid;
begin
  select p.id into target_profile_id
  from profiles p
  join auth.users u on u.id = p.user_id
  where u.email = 'danielgonzales200427@gmail.com'
    and p.profile_type = 'artist';

  if target_profile_id is null then
    raise exception 'No se encontró el perfil personal para ese email.';
  end if;

  delete from profile_blocks where profile_id = target_profile_id;
  delete from products where seller_id = target_profile_id;
  delete from services where profile_id = target_profile_id;
  delete from music_feed where profile_id = target_profile_id;

  update profiles
  set draft_content = null
  where id = target_profile_id;

  raise notice 'Perfil % vaciado correctamente.', target_profile_id;
end $$;
