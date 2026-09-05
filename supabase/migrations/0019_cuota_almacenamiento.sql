-- Cuota de almacenamiento por usuario — la medición.
--
-- Hasta ahora nada impedía que una sola cuenta subiera decenas de gigas al
-- bucket de R2. El rate limit de `/api/upload-url` frena la FRECUENCIA (120
-- subidas por hora), no el VOLUMEN: 120 archivos de 200 MB por hora son 24 GB
-- por hora, todos dentro del límite.
--
-- Esta migración sólo aporta la medición. La decisión de rechazar vive en la
-- aplicación (`lib/cuota-almacenamiento.ts`) y arranca en modo observación,
-- igual que la validación de bloques de F3: primero se mira cuánto ocupa la
-- gente de verdad, y recién después se cierra la puerta con un número que no
-- sea inventado.
--
-- ─── POR QUÉ `security invoker` Y NO `definer` ────────────────────────────
-- Es lo que hace que esta función no pueda convertirse en una fuga. Al
-- ejecutarse con los permisos de QUIEN LLAMA, la política
-- `media_assets_select_own` se sigue aplicando dentro del `sum()`: cada
-- usuario suma sus propias filas y nada más. Con `security definer` la función
-- vería la tabla entera y habría que reimplementar la restricción a mano,
-- que es justo el tipo de código donde se cuelan los errores.
--
-- No lleva parámetros a propósito. Aceptar un `p_user_id` la convertiría en
-- una forma de preguntar cuánto ocupa otra persona; sin parámetro, la única
-- respuesta posible es sobre uno mismo.

create or replace function public.uso_de_almacenamiento_bytes()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  -- `coalesce` porque `sum()` sobre cero filas devuelve NULL, no 0: una cuenta
  -- recién creada haría que la aplicación comparara NULL contra el límite y
  -- tratara "no ha subido nada" como un resultado desconocido.
  --
  -- `bytes` es nullable en la tabla (las filas del backfill de 0002 no lo
  -- tienen), así que también se cubre fila a fila. Un archivo de tamaño
  -- desconocido cuenta como 0: preferimos no cobrarle a nadie por un dato que
  -- no registramos nosotros.
  select coalesce(sum(coalesce(bytes, 0)), 0)::bigint
  from media_assets
  where owner_user_id = auth.uid();
$$;

comment on function public.uso_de_almacenamiento_bytes() is
  'Bytes que ocupa en R2 quien llama, sumados desde media_assets. security invoker: '
  'la RLS de media_assets_select_own limita la suma a las filas propias.';

-- `authenticated` y no `anon`: una cuenta anónima no tiene almacenamiento que
-- consultar, y exponerla sólo ampliaría la superficie sin ganar nada.
--
-- Se nombra `anon` EXPLÍCITAMENTE, además de `public`, y no es redundante:
-- Supabase tiene privilegios por defecto que conceden `execute` a `anon` sobre
-- las funciones nuevas del esquema `public`. `revoke ... from public` quita el
-- permiso implícito de PUBLIC, pero NO esa concesión explícita, así que sin
-- esta línea la función quedaría llamable por cualquiera. Se detectó con la
-- prueba de base, que esperaba un error y no lo recibía. Misma forma que
-- 0009, 0010 y 0011.
revoke all on function public.uso_de_almacenamiento_bytes() from public, anon;
grant execute on function public.uso_de_almacenamiento_bytes() to authenticated;

-- La suma recorre todas las filas del usuario en cada subida. Sin índice, eso
-- es un scan de la tabla entera; con él, sólo las filas propias.
create index if not exists media_assets_owner_bytes_idx
  on media_assets (owner_user_id)
  include (bytes);
