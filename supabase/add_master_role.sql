-- Agrega el rol profesional "masters" (masterización) al catálogo de roles.
-- Va entre 'mezclas' y 'musicos' en la app; en la DB el orden del array del
-- check no importa. Como el constraint profiles_musician_roles_check ya existe
-- en la base desplegada (creado por setup_vibra.sql), acá lo reemplazamos:
-- primero lo soltamos y luego lo volvemos a crear incluyendo 'masters'.
--
-- Seguro de correr varias veces (idempotente).

alter table profiles drop constraint if exists profiles_musician_roles_check;

alter table profiles add constraint profiles_musician_roles_check check (
  musician_roles <@ array[
    'autores', 'compositores', 'arreglistas', 'directores',
    'productores', 'mezclas', 'masters', 'musicos'
  ]::text[]
);
