-- Vacía TODO el contenido de prueba de la plataforma (perfiles, bloques,
-- publicaciones, comentarios, créditos, licencias, certificados, tienda,
-- pedidos, donaciones) para que ningún músico real se encuentre con datos
-- inventados por vos durante el desarrollo. Deja intactos: el esquema
-- (tablas/columnas), las políticas RLS, las funciones/triggers, y las
-- cuentas de auth.users (nadie pierde su login).
--
-- ⚠️ ANTES DE CORRER ESTO: andá a Supabase Dashboard > Database > Backups
-- y confirmá que hay un backup reciente (o esperá al automático). Esto
-- borra filas de verdad, sin forma de deshacerlo desde acá.
--
-- Paso 1 (opcional pero recomendado): corré SOLO este bloque primero para
-- ver cuántas filas hay hoy en cada tabla que SÍ existe en tu proyecto — así
-- confirmás que lo que se va a borrar es efectivamente todo de prueba y no
-- algo que no reconocés. (to_regclass devuelve null en vez de tirar error
-- si la tabla no existe, así que esta consulta nunca falla.)
--
--   select t as tabla,
--          case when to_regclass(t) is null then null
--               else (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', t), false, true, '')))[1]::text::bigint
--          end as filas
--   from unnest(array[
--     'profiles','profile_blocks','band_members','music_feed','feed_comments',
--     'feed_post_comments','credit_requests','profile_questions','products',
--     'services','licenses','author_certificates','orders','order_items','donations'
--   ]) as t
--   order by 1;
--
-- Una fila con "filas" en null = esa tabla no existe en tu proyecto (como
-- pasó con order_items) — el paso 2 ya la salta solo, no hace falta que
-- edites nada a mano.

-- Paso 2: el borrado real. En vez de un TRUNCATE fijo (que revienta apenas
-- una sola tabla de la lista no existe, como acabas de ver con order_items),
-- este bloque revisa cada nombre con to_regclass y solo trunca las tablas
-- que de verdad están creadas en tu proyecto. CASCADE se encarga de
-- cualquier tabla relacionada que dependa de las que sí se truncan.
do $$
declare
  nombre text;
  existentes text[] := '{}';
begin
  foreach nombre in array array[
    'feed_post_comments', 'feed_comments', 'credit_requests',
    'profile_questions', 'band_members', 'order_items', 'orders',
    'donations', 'products', 'services', 'licenses', 'author_certificates',
    'music_feed', 'profile_blocks', 'profiles'
  ]
  loop
    if to_regclass(nombre) is not null then
      existentes := array_append(existentes, nombre);
    else
      raise notice 'Se salta "%": no existe en este proyecto.', nombre;
    end if;
  end loop;

  if array_length(existentes, 1) is null then
    raise exception 'Ninguna de las tablas esperadas existe — revisa el nombre del proyecto/conexión.';
  end if;

  execute format('truncate table %s restart identity cascade', array_to_string(existentes, ', '));
  raise notice 'Truncadas: %', array_to_string(existentes, ', ');
end $$;

-- Con esto la tabla `profiles` queda en cero. La próxima vez que vos (u
-- otro músico) inicien sesión, el trigger `handle_new_user` (instalado por
-- setup_vibra.sql) — o el respaldo del cliente en lib/ensure-profile.ts —
-- les crea automáticamente una fila nueva y vacía. Si no corriste
-- setup_vibra.sql todavía en este proyecto, hacelo antes de invitar a nadie:
-- sin ese trigger, el alta de perfil depende solo del respaldo del cliente.

-- Lo que esto NO borra (hacelo a mano si también lo querés limpio):
--   • Supabase Dashboard > Storage > bucket "assets" > seleccionar todo > Delete
--     (fotos/audio que subiste probando — no se auto-borran con este script).
--   • Supabase Dashboard > Authentication > Users > borrar las cuentas de
--     prueba que hayas creado (este script deja auth.users intacto a
--     propósito, para no romper sesiones activas por accidente).
