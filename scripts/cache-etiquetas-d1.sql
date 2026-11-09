-- Esquema de caché del adaptador OpenNext instalado (d1-next-tag-cache).
-- Ejecutar sólo sobre la D1 identificada del entorno correspondiente.
CREATE TABLE IF NOT EXISTS revalidations (
  tag TEXT NOT NULL,
  revalidatedAt INTEGER NOT NULL,
  stale INTEGER,
  expire INTEGER DEFAULT NULL,
  UNIQUE(tag) ON CONFLICT REPLACE
);
