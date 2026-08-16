-- ═══════════════════════════════════════════════════════════════════════════
-- 0012_descubrimiento_y_feed.sql — El descubrimiento se agrega en Postgres, y
-- el feed puede paginarse por cursor sin repetir ni saltear filas.
--
-- PROBLEMA QUE RESUELVE
--
-- P-16 · La agregación del descubrimiento (cuántos productos/servicios tiene
--        cada artista y en qué categorías) se hace hoy en JavaScript sobre una
--        MUESTRA de 500 filas. Con volumen, esa muestra miente: un artista con
--        productos fuera de las 500 primeras filas desaparece del carrusel, y
--        los conteos que se muestran no son los reales. Un `group by` es
--        exactamente lo que Postgres hace bien y lo que el cliente hace mal.
--
-- P-17 · La paginación es `order + limit`, sin cursor. Con contenido nuevo
--        entrando entre una página y la siguiente, el desplazamiento infinito
--        repite filas y se salta otras. La solución es keyset (`created_at`,
--        `id`) — y para que sea barata hacen falta los índices de abajo.
--
-- P-34 · La suspensión se aplica también acá: un perfil suspendido no aparece
--        en el descubrimiento, aunque tenga productos activos. Es la misma
--        regla que ya aplican `lib/feed/discovery.ts` y `lib/musicFeed.ts` en
--        el código — dos capas, como manda el plan.
--
-- COMPATIBILIDAD: el código llama a `descubrimiento_perfiles` y, si la función
-- no existe todavía (esta migración sin aplicar), cae al camino anterior sin
-- que el usuario note nada. Ver `lib/feed/discovery.ts`. Por eso esta
-- migración se puede aplicar antes o después de desplegar el código.
--
-- Idempotente. No borra ni modifica ninguna fila.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) Índices para keyset ───────────────────────────────────────────────
-- Un keyset ordena por (created_at desc, id desc) y filtra por
-- `(created_at, id) < (cursor_created_at, cursor_id)`. Sin un índice que
-- cubra ese orden, cada página vuelve a ordenar la tabla entera.
--
-- `if not exists` en todos: correr esto dos veces no cuesta nada.
--
-- POR QUÉ SE COMPRUEBA LA COLUMNA ANTES DE CREAR EL ÍNDICE
-- Este repositorio todavía no tiene baseline (`0000`): el esquema real de
-- `products` y `services` nació fuera de las migraciones y no hay ningún
-- archivo que declare su `created_at`. Un `create index` sobre una columna que
-- no existe **aborta la migración entera**, y con ella se perdería también el
-- RPC del paso 2, que es lo que de verdad cierra P-16. Un índice ausente sólo
-- cuesta velocidad; una migración abortada cuesta la fase. Se avisa por
-- `notice` para que la ausencia no pase inadvertida.

do $$
declare
  v_objetivos text[][] := array[
    array['music_feed',     'music_feed_keyset_idx',     ''],
    array['products',       'products_keyset_idx',       ''],
    array['services',       'services_keyset_idx',       ''],
    -- El feed de publicaciones sale de profile_blocks filtrando por tipo: el
    -- índice parcial es mucho más chico que uno sobre toda la tabla.
    array['profile_blocks', 'profile_blocks_publicaciones_keyset_idx',
          ' where block_type = ''publicaciones'' and is_visible']
  ];
  v_tabla text;
  v_indice text;
  v_filtro text;
  i integer;
begin
  for i in 1 .. array_length(v_objetivos, 1) loop
    v_tabla  := v_objetivos[i][1];
    v_indice := v_objetivos[i][2];
    v_filtro := v_objetivos[i][3];

    if to_regclass('public.' || v_tabla) is null then
      raise notice 'Sin indice keyset: la tabla public.% no existe.', v_tabla;
      continue;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_tabla and column_name = 'created_at'
    ) then
      raise notice 'Sin indice keyset en public.%: no tiene columna created_at.', v_tabla;
      continue;
    end if;

    execute format(
      'create index if not exists %I on public.%I (created_at desc, id desc)%s',
      v_indice, v_tabla, v_filtro
    );
  end loop;
end $$;


-- ─── 2) Descubrimiento agregado en la base ────────────────────────────────
--
-- Devuelve una fila por perfil, con su conteo real y sus categorías. Sin
-- muestra, sin límite de filas intermedias, sin traer nada al navegador que no
-- se vaya a pintar.
--
-- `security invoker` a propósito: la función ve exactamente lo que vería quien
-- la llama. Un visitante anónimo obtiene lo que la RLS de `products`,
-- `services` y `profiles` le permita, ni una fila más. Una función
-- `security definer` acá sería una puerta trasera de lectura.
--
-- `stable`: no escribe nada, y el planner puede reusar el resultado dentro de
-- la misma consulta.

create or replace function public.descubrimiento_perfiles(
  p_tipo text,
  p_limite integer default 60
)
returns table (
  username text,
  display_name text,
  profile_type text,
  musician_roles jsonb,
  categorias text[],
  total bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with filas as (
    select
      pr.username,
      pr.display_name,
      pr.profile_type,
      to_jsonb(pr.musician_roles) as musician_roles,
      p.category
    from public.products p
    join public.profiles pr on pr.id = p.seller_id
    where p_tipo = 'productos'
      and coalesce(p.is_active, true)
      and coalesce(pr.is_suspended, false) = false
      and pr.username is not null

    union all

    select
      pr.username,
      pr.display_name,
      pr.profile_type,
      to_jsonb(pr.musician_roles) as musician_roles,
      s.category
    from public.services s
    join public.profiles pr on pr.id = s.profile_id
    where p_tipo = 'servicios'
      and coalesce(s.is_active, true)
      and coalesce(pr.is_suspended, false) = false
      and pr.username is not null
  )
  select
    f.username,
    max(f.display_name)   as display_name,
    max(f.profile_type)   as profile_type,
    -- Todas las filas del mismo perfil traen el mismo valor; `max` sobre jsonb
    -- sirve como "cualquiera de ellos" sin necesitar un group by extra.
    max(f.musician_roles::text)::jsonb as musician_roles,
    array_remove(array_agg(distinct f.category), null) as categorias,
    count(*) as total
  from filas f
  group by f.username
  -- Orden estable y significativo: primero quien más ofrece; el username
  -- desempata para que dos cargas seguidas devuelvan lo mismo.
  order by count(*) desc, f.username asc
  -- La función es pública: el cliente elige p_limite, pero no puede convertir
  -- el RPC en una consulta masiva. El código pide 60; 100 deja margen sin
  -- permitir que `p_limite = 2147483647` fuerce a agregar y devolver toda la
  -- plataforma en una sola petición.
  limit least(greatest(coalesce(p_limite, 60), 1), 100);
$$;

comment on function public.descubrimiento_perfiles(text, integer) is
  'Descubrimiento agregado en Postgres (P-16). p_tipo: productos | servicios. Excluye perfiles suspendidos e ítems inactivos. security invoker: respeta RLS.';

-- La llaman visitantes sin sesión (el feed es público) y usuarios con sesión.
grant execute on function public.descubrimiento_perfiles(text, integer) to anon, authenticated;
