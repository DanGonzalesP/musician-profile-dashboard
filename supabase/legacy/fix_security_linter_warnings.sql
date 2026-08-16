-- Corrige los 2 warnings de "SECURITY DEFINER function executable" que
-- reporta el linter de Supabase (Database → Advisors). Ambas funciones ya
-- existían (band_profiles.sql y setup_vibra.sql); esto solo les quita el
-- permiso de ejecución que Postgres les da a PUBLIC por defecto al crearlas,
-- que es lo que las dejaba invocables sin querer desde
-- /rest/v1/rpc/<nombre_funcion>.
--
-- Seguro de correr varias veces (idempotente).

-- 1) handle_new_user: trigger de auth.users (crea la fila de perfil al
-- registrarse). Nadie debería llamarla directo por RPC — los triggers no
-- necesitan permiso de EXECUTE para dispararse, así que quitárselo a todos
-- los roles no rompe el alta de usuarios, solo cierra el endpoint público.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- 2) get_profile_role: a diferencia de la anterior, SÍ la necesita el rol
-- "authenticated" — las políticas RLS de profile_blocks/products/services
-- (ver band_profiles.sql y fix_group_creation_rls.sql) la llaman para
-- resolver el rol efectivo del usuario sobre un perfil/banda. Quitarle el
-- permiso a "authenticated" rompería todo el guardado del editor para
-- bandas, así que se queda. Solo se le quita a "anon" y a PUBLIC: un usuario
-- no logueado no tiene ningún vínculo posible con un perfil (auth.uid() es
-- null adentro de la función), así que no ganaba nada pudiendo llamarla, y
-- ahora directamente no puede.
revoke execute on function public.get_profile_role(uuid) from public;
revoke execute on function public.get_profile_role(uuid) from anon;
grant execute on function public.get_profile_role(uuid) to authenticated;

-- 2.1) La corrección real del warning: cambiarla de SECURITY DEFINER a
-- SECURITY INVOKER. No hace falta que "salte" el RLS, porque solo lee filas
-- que el propio usuario que llama ya puede ver con sus propias políticas:
--   - profiles: la lectura es pública (profiles_select_public, ver
--     harden_profiles_rls.sql), así que el invoker también puede leerla.
--   - band_members: la política "band_members_select_involved" permite
--     member_user_id = auth.uid() — exactamente la fila que la función
--     consulta para el propio usuario.
-- Con esto el linter deja de marcar "authenticated_security_definer_
-- function_executable" para esta función (ya no aplica: no es definer).
alter function public.get_profile_role(uuid) security invoker;

-- 3) "Leaked Password Protection Disabled" (auth_leaked_password_protection)
-- NO se arregla con SQL: es un toggle del servicio de Auth, no de la base de
-- datos. Actívalo desde el Dashboard de Supabase:
--   Authentication → Sign In / Providers → Email → "Leaked password
--   protection" (o Authentication → Policies → Password Security, según la
--   versión del dashboard) → actívalo.
-- Eso hace que Supabase rechace contraseñas que ya aparecieron en filtraciones
-- conocidas (vía HaveIBeenPwned), sin tocar ninguna tabla.
