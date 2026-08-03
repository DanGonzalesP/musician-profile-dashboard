-- ═══════════════════════════════════════════════════════════════════════════
-- 0007_optimistic_concurrency.sql — Evita que dos sesiones se pisen en silencio.
--
-- PROBLEMA QUE RESUELVE
-- El editor no tiene ningún control de concurrencia: dos pestañas abiertas
-- (o el celular y la laptop a la vez) hacen last-write-wins sobre la misma
-- fila. El usuario que publicó primero pierde su trabajo sin enterarse.
--
-- Solución estándar: un contador de versión. Quien publica declara sobre qué
-- versión venía trabajando; si la fila ya avanzó, la publicación se rechaza y
-- la app avisa en vez de sobrescribir.
--
-- Idempotente. Correr DESPUÉS de 0006.
-- ═══════════════════════════════════════════════════════════════════════════

alter table profiles add column if not exists content_version integer not null default 0;


-- publish_profile pasa a exigir la versión conocida por el cliente.
-- Se reemplaza la firma anterior (uuid, jsonb) por (uuid, jsonb, integer).
drop function if exists public.publish_profile(uuid, jsonb);

create or replace function public.publish_profile(
  p_profile_id uuid,
  p_blocks jsonb,
  p_expected_version integer default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actual integer;
  v_nueva integer;
begin
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'p_blocks debe ser un arreglo JSON';
  end if;

  -- FOR UPDATE serializa a dos publicaciones simultáneas: la segunda espera y
  -- recién entonces compara versiones, en vez de leer un valor ya obsoleto.
  select content_version into v_actual
  from profiles where id = p_profile_id
  for update;

  if v_actual is null then
    raise exception 'El perfil % no existe', p_profile_id;
  end if;

  -- p_expected_version null = publicación sin control de versión (clientes
  -- viejos). Se acepta para no romper una pestaña que quedó abierta durante
  -- el despliegue.
  if p_expected_version is not null and p_expected_version <> v_actual then
    raise exception 'conflicto_de_version: el perfil fue editado desde otra sesion (version % vs %)',
      p_expected_version, v_actual
      using errcode = 'serialization_failure';
  end if;

  delete from profile_blocks where profile_id = p_profile_id;

  insert into profile_blocks (profile_id, block_type, position_index, content, is_visible)
  select
    p_profile_id,
    bloque ->> 'block_type',
    (bloque ->> 'position_index')::int,
    bloque -> 'content',
    true
  from jsonb_array_elements(p_blocks) as bloque;

  update profile_private
  set draft_content = null,
      updated_at = now()
  where profile_id = p_profile_id;

  v_nueva := v_actual + 1;
  update profiles set content_version = v_nueva where id = p_profile_id;

  return v_nueva;
end;
$$;

revoke execute on function public.publish_profile(uuid, jsonb, integer) from public, anon;
grant execute on function public.publish_profile(uuid, jsonb, integer) to authenticated;
