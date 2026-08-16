-- Controla si la página pública del artista se muestra "unificada" (todos los
-- bloques en una sola página, comportamiento actual) o "separada" (Hero,
-- Track List y Donaciones en la página principal; Merch y Servicios en una
-- pestaña aparte). Default false = separada, que es el nuevo comportamiento
-- por defecto pedido para la vista pública.
alter table profiles
  add column if not exists unified_profile boolean not null default false;
