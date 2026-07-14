-- Datos del artista para la Licencia Express (nombre legal/artístico, DNI).
-- Ya no viven como un bloque de página (profile_blocks) — son configuración
-- interna del artista, no contenido público, así que se guardan directo en
-- profiles. Es aditivo y con default, no afecta filas existentes.
alter table profiles
  add column if not exists legal_settings jsonb not null default '{}'::jsonb;
