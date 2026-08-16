-- ═══════════════════════════════════════════════════════════════════════════
-- 0016_refrescar_cache_postgrest.sql — Publica la FK de 0015 en la Data API.
--
-- En producción, PostgREST conservó el esquema anterior después de aplicar
-- 0015 y siguió respondiendo PGRST200. La relación sí existe en Postgres y el
-- entorno local la descubre después de reiniciar; este NOTIFY pide el mismo
-- refresco sin reiniciar ni interrumpir la base.
--
-- No cambia esquema ni datos. Idempotente. Correr DESPUÉS de 0015.
-- ═══════════════════════════════════════════════════════════════════════════

notify pgrst, 'reload schema';

-- Verificación de solo lectura: la FK sigue presente.
select conname, convalidated
from pg_constraint
where conrelid = 'public.profile_blocks'::regclass
  and conname = 'profile_blocks_profile_id_fkey';
