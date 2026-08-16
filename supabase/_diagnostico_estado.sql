-- ═══════════════════════════════════════════════════════════════════════════
-- _diagnostico_estado.sql — SOLO LECTURA. No modifica absolutamente nada.
--
-- Complemento de `_diagnostico_parte2.sql`, exigido por F0 del
-- PLAN_VIBE_EMPRESARIAL.md. Aquel responde "¿qué está abierto?"; este responde
-- "¿qué migraciones corrieron de verdad?", que es la pregunta que hoy solo se
-- puede contestar mirando la forma del esquema, porque las migraciones se
-- aplicaron a mano en el SQL Editor y nadie llevó registro (P-14).
--
-- CÓMO USARLO
--   1. Supabase → SQL Editor → pegar este archivo COMPLETO → Run.
--   2. Copiar cada resultado a `docs/estado-desplegado.md`, en su sección.
--   3. No ejecutar nada más en el SQL Editor. Es una herramienta de solo
--      lectura para diagnóstico (§6.6 del plan).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) Huella de cada migración 0001…0009 ────────────────────────────────
-- Cada fila es "esta migración dejó su marca en el esquema, sí o no".
-- Si alguna dice `false`, esa migración NO corrió (o corrió y algo la revirtió).
select
  m.migracion,
  m.marca_esperada,
  m.aplicada
from (
  values
    ('0001_catalog_schema_fix',
     'products.profile_id existe',
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'products'
               and column_name = 'profile_id')),

    ('0002_media_assets',
     'tabla public.media_assets existe',
     to_regclass('public.media_assets') is not null),

    ('0003_profile_private',
     'tabla profile_private existe Y profiles YA NO tiene legal_settings',
     to_regclass('public.profile_private') is not null
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'profiles'
                       and column_name = 'legal_settings')),

    ('0004_lock_remaining_rls',
     'ninguna tabla de public con RLS apagado',
     not exists (select 1 from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relkind = 'r'
                   and c.relrowsecurity = false)),

    ('0005+0007_publish_profile',
     'función publish_profile con 3 argumentos existe',
     exists (select 1 from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'publish_profile'
               and p.pronargs = 3)),

    ('0006_username',
     'profiles.username existe y es único',
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles'
               and column_name = 'username')),

    ('0007_optimistic_concurrency',
     'profiles.content_version existe',
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles'
               and column_name = 'content_version')),

    ('0008_moderacion_y_cumplimiento',
     'content_reports + user_blocks + audit_log existen',
     to_regclass('public.content_reports') is not null
     and to_regclass('public.user_blocks') is not null
     and to_regclass('public.audit_log') is not null),

    ('0009_shared_rate_limits',
     'rate_limit_windows + consume_authenticated_rate_limit existen',
     to_regclass('public.rate_limit_windows') is not null
     and exists (select 1 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public'
                   and p.proname = 'consume_authenticated_rate_limit')),

    -- Las siguientes todavía no deberían estar aplicadas: son las que este
    -- plan introduce. Sirven para saber en qué punto de la ejecución estás.
    ('0010_validar_bloques (F3)',
     'constraint profile_blocks_block_type_valido existe',
     exists (select 1 from pg_constraint
             where conname = 'profile_blocks_block_type_valido')),

    ('0011_limites_de_escritura (F5)',
     'función check_write_rate_limit existe',
     exists (select 1 from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'check_write_rate_limit')),

    ('0012_descubrimiento_y_feed (F11)',
     'función descubrimiento_perfiles existe',
     exists (select 1 from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'descubrimiento_perfiles')),

    ('0013_cuotas (F11)',
     'función verificar_cuota existe',
     exists (select 1 from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'verificar_cuota')),

    ('0014_moderacion_operativa (F14)',
     'tabla takedown_cases existe',
     to_regclass('public.takedown_cases') is not null)
) as m(migracion, marca_esperada, aplicada)
order by m.migracion;


-- ─── 2) Funciones esperadas, con su modo de seguridad ─────────────────────
-- `security definer` salta RLS: cada una debe estar acotada a auth.uid() y con
-- search_path fijo. Si aparece alguna definer que no esté en esta lista, es
-- superficie sin dueño.
select
  p.proname as funcion,
  p.pronargs as num_args,
  pg_get_function_identity_arguments(p.oid) as firma,
  case when p.prosecdef then 'DEFINER (salta RLS)' else 'invoker (respeta RLS)' end as modo,
  coalesce(array_to_string(p.proconfig, ', '), '⚠ sin search_path fijo') as config,
  -- Quién puede ejecutarla. `anon` en una definer es lo que hay que mirar.
  coalesce((
    select string_agg(distinct a.grantee, ', ')
    from information_schema.routine_privileges a
    where a.specific_schema = 'public'
      and a.routine_name = p.proname
      and a.privilege_type = 'EXECUTE'
  ), '(nadie)') as puede_ejecutar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
order by p.prosecdef desc, p.proname;


-- ─── 3) Columnas sensibles que NO deben existir en tablas públicas ────────
-- Tras 0003, `profiles` no debe tener legal_settings ni draft_content. Si
-- aparecen aquí, 0003 no corrió y la anon key está sirviendo DNIs.
select
  table_name as tabla,
  column_name as columna,
  '⚠ NO debería estar aquí' as veredicto
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles', 'profile_blocks', 'products', 'services')
  and column_name in ('legal_settings', 'draft_content', 'dni', 'documento',
                      'owner_user_id', 'user_id', 'email')
order by table_name, column_name;


-- ─── 4) Qué columnas ve REALMENTE el rol anon en profiles ─────────────────
-- Es la respuesta exacta a "¿la anon key devuelve DNIs?". No hace falta curl.
select
  c.column_name as columna,
  string_agg(cp.privilege_type, ', ' order by cp.privilege_type) as permisos_anon
from information_schema.columns c
left join information_schema.column_privileges cp
  on cp.table_schema = c.table_schema
 and cp.table_name = c.table_name
 and cp.column_name = c.column_name
 and cp.grantee = 'anon'
where c.table_schema = 'public' and c.table_name = 'profiles'
group by c.column_name, c.ordinal_position
order by c.ordinal_position;


-- ─── 5) Deuda del prototipo anterior (P-03b) ──────────────────────────────
-- artist / merch / donations con lectura pública, y la tabla de respaldo.
select
  c.relname as tabla,
  c.relrowsecurity as rls_activo,
  pg_size_pretty(pg_total_relation_size(c.oid)) as tamano,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
      and (p.qual = 'true')) as politicas_abiertas,
  case
    when c.relname like '\_backup\_%' then 'respaldo — decidir si se archiva y se borra'
    else 'prototipo anterior — decidir si se retira'
  end as accion
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and (c.relname in ('artist', 'merch', 'donations', 'orders', 'order_items')
       or c.relname like '\_backup\_%')
order by c.relname;


-- ─── 6) Índices que las fases posteriores dan por hechos ──────────────────
-- Si faltan, F11 (keyset) y F10 (render servidor) van a ser lentos.
select
  t.tabla,
  t.indice_esperado,
  exists (
    select 1 from pg_indexes i
    where i.schemaname = 'public' and i.tablename = t.tabla
      and i.indexdef ilike '%' || t.columnas || '%'
  ) as existe
from (values
  ('profile_blocks', 'profile_id + position_index', 'profile_id, position_index'),
  ('profiles',       'username único',              'username'),
  ('media_assets',   'owner_user_id',               'owner_user_id'),
  ('products',       'profile_id',                  'profile_id'),
  ('services',       'profile_id',                  'profile_id')
) as t(tabla, indice_esperado, columnas);


-- ─── 7) Versión de Postgres (la necesita supabase/config.toml, F6) ────────
select
  version() as version_completa,
  current_setting('server_version_num')::int / 10000 as version_mayor;
