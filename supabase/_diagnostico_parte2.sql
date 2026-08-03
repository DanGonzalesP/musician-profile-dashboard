-- ═══════════════════════════════════════════════════════════════════════════
-- _diagnostico_parte2.sql — SOLO LECTURA. No modifica nada.
--
-- Lo que falta del diagnostico. Ya tengo el volumen de datos (consulta 4):
-- 2 perfiles, 12 bloques, 2 productos, 1 servicio. Nada critico ahi.
--
-- Corre esto y mandame los 4 resultados.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── A) ¿Existen orders / order_items / donations, y con que columnas? ────
-- Es LO QUE ME BLOQUEA. La migracion 0004 le activa RLS a `orders` pero no
-- crea la politica de lectura, porque no se que columna identifica al
-- comprador en tu esquema (buyer_user_id? user_id? customer_id?). Hasta
-- saberlo la tabla queda cerrada, que es la falla segura.
--
-- Si esto devuelve 0 filas, esas tablas no existen y no hay nada que cerrar.
select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('orders', 'order_items', 'donations')
order by table_name, ordinal_position;


-- ─── B) Tablas con RLS APAGADO ───────────────────────────────────────────
-- Una tabla con rls_activo = false ignora TODAS sus politicas: queda abierta
-- de par en par para cualquiera con la anon key. Estas son las urgentes.
select
  c.relname as tabla,
  c.relrowsecurity as rls_activo,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as num_politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;


-- ─── C) Politicas permisivas (qual = true) ───────────────────────────────
-- Solo las sospechosas, no las 40 filas completas. Una politica con
-- qual = 'true' deja pasar cualquier fila; en un SELECT publico
-- (profiles, profile_blocks, products, services) eso es intencional, en
-- cualquier otro comando o tabla es un agujero.
select
  tablename,
  policyname,
  cmd,
  roles::text,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or with_check = 'true')
order by
  -- Primero lo que NO es un SELECT publico esperado.
  case when cmd = 'SELECT' and tablename in
    ('profiles','profile_blocks','products','services','feed_comments','feed_post_comments')
  then 1 else 0 end,
  tablename, cmd;


-- ─── D) Colisiones de display_name ───────────────────────────────────────
-- Con 2 perfiles es casi seguro que no hay ninguna, pero lo confirmo antes
-- del backfill de username. Si devuelve filas, esos perfiles HOY estan
-- inalcanzables en la web (maybeSingle() revienta con multiples resultados).
select
  lower(trim(display_name)) as nombre_normalizado,
  count(*) as veces,
  array_agg(id) as ids
from profiles
where display_name is not null and trim(display_name) <> ''
group by 1
having count(*) > 1
order by 2 desc;
