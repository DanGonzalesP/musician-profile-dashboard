-- ═══════════════════════════════════════════════════════════════════════════
-- 0017_marca_tiempo_profile_blocks.sql — Completa el contrato del feed.
--
-- La paginación keyset de publicaciones ordena por (created_at, id), pero la
-- tabla histórica `profile_blocks` nunca tuvo `created_at`. Tras restaurar la
-- FK de 0015, PostgREST pudo resolver el join y expuso este segundo desajuste.
--
-- El default no cambia la UX: los bloques existentes reciben la fecha del
-- despliegue como punto de partida determinista y los nuevos guardan su fecha
-- real. El índice parcial cubre exactamente el subconjunto del feed.
--
-- Idempotente. Correr DESPUÉS de 0016.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profile_blocks
  add column if not exists created_at timestamptz not null default now();

create index if not exists profile_blocks_publicaciones_keyset_idx
  on public.profile_blocks (created_at desc, id desc)
  where block_type = 'publicaciones' and is_visible = true;

notify pgrst, 'reload schema';

-- Verificación de solo lectura.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profile_blocks'
  and column_name = 'created_at';
