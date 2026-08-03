-- ═══════════════════════════════════════════════════════════════════════════
-- _diagnostico_rls.sql — SOLO LECTURA. No modifica nada.
--
-- Pégalo completo en el SQL Editor de Supabase y mándame los 4 resultados.
-- Con eso calibro las migraciones de la Fase 0 a tu esquema real en vez de
-- asumir cómo está.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) TODAS las políticas RLS del proyecto ──────────────────────────────
-- Lo que busco: filas con qual = 'true' o with_check = 'true' en tablas que
-- NO deberían ser públicas. Esas son los agujeros abiertos.
select
  tablename,
  policyname,
  cmd,
  roles::text,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;


-- ─── 2) ¿Qué tablas tienen RLS activo? ────────────────────────────────────
-- Una tabla con rls_activo = false ignora TODAS las políticas: queda abierta
-- de par en par para cualquiera con la anon key.
select
  c.relname as tabla,
  c.relrowsecurity as rls_activo,
  c.relforcerowsecurity as rls_forzado,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as num_politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;


-- ─── 3) Columnas reales de las tablas sensibles ───────────────────────────
-- Necesito esto para escribir la vista public_profiles con las columnas que
-- de verdad existen (y para saber qué datos personales hay que sacar del
-- alcance público).
select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles', 'profile_blocks', 'music_feed', 'orders', 'order_items',
    'donations', 'products', 'services', 'band_members'
  )
order by table_name, ordinal_position;


-- ─── 4) Volumen actual (para saber si ya cruzaste el límite de 1000 filas
-- que rompe el borrado de archivos, y para dimensionar los backfills) ─────
select 'profiles' as tabla, count(*) from profiles
union all select 'profile_blocks', count(*) from profile_blocks
union all select 'products', count(*) from products
union all select 'services', count(*) from services
union all select 'music_feed', count(*) from music_feed
union all select 'band_members', count(*) from band_members
order by 1;


-- ─── 5) Colisiones de display_name (para el backfill de username) ─────────
-- Si esto devuelve filas, esos perfiles HOY son inalcanzables en la web
-- (maybeSingle() revienta con múltiples resultados).
select lower(trim(display_name)) as nombre_normalizado, count(*) as veces
from profiles
where display_name is not null and trim(display_name) <> ''
group by 1
having count(*) > 1
order by 2 desc;
