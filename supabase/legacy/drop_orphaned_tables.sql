-- Elimina las tablas huérfanas detectadas por el Advisor (INFO: "RLS enabled
-- no policy"). Ninguna aparece referenciada en el código de la app — son
-- restos de una versión anterior del esquema (álbumes/tracks/pedidos
-- relacionales, previa al modelo actual con profile_blocks en jsonb).
--
-- Antes de borrar: corre esto solo y confirma que en efecto están vacías
-- (no tengo acceso directo a tu base para verificarlo yo mismo):
--
--   select 'albums' as tabla, count(*) from albums
--   union all select 'tracks', count(*) from tracks
--   union all select 'orders', count(*) from orders
--   union all select 'order_items', count(*) from order_items
--   union all select 'authorship_proofs', count(*) from authorship_proofs;
--
-- Si algún conteo es mayor a 0 y no reconoces esos datos, avísame antes de
-- continuar con el drop de abajo.

-- Orden por dependencias (hijas primero): order_items → orders,
-- tracks → albums, authorship_proofs no depende de nada de esta lista.
drop table if exists order_items cascade;
drop table if exists orders cascade;
drop table if exists tracks cascade;
drop table if exists albums cascade;
drop table if exists authorship_proofs cascade;
