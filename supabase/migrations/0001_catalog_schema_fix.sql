-- Alinea la tabla services con lo que espera lib/catalog.ts (editor de
-- bloques merch/service del dashboard). products ya tiene todas las
-- columnas necesarias (seller_id, title, price, type, stock_quantity,
-- images_urls) y no requiere cambios.

-- services: agrega profile_id (uuid, FK real a profiles.id) y position_index.
-- artist_id (bigint) se deja intacto para no romper otras integraciones que
-- puedan depender de él; el dashboard usará profile_id en su lugar.
alter table services
  add column if not exists profile_id uuid references profiles(id),
  add column if not exists position_index integer not null default 0;

-- Backfill: las 4 filas existentes (artist_id = 1) pertenecen al único
-- perfil sembrado en este proyecto (user_id = PROFILE_ID constante).
update services
set profile_id = (select id from profiles where user_id = '00000000-0000-0000-0000-000000000000' limit 1)
where profile_id is null;

-- products: agrega orden explícito para que el drag-and-drop del editor
-- se conserve al publicar (sin esto, el orden de lectura sería por
-- created_at, que no refleja reordenamientos del usuario).
alter table products
  add column if not exists position_index integer not null default 0;
