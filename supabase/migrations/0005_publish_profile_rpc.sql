-- ═══════════════════════════════════════════════════════════════════════════
-- 0005_publish_profile_rpc.sql — Publicación atómica del perfil.
--
-- PROBLEMA QUE RESUELVE
-- handlePublish hacía, desde el navegador y en dos llamadas separadas:
--
--    1. DELETE from profile_blocks where profile_id = X
--    2. INSERT de los bloques nuevos
--
-- Si el paso 2 fallaba —red inestable en el celular justo después de subir
-- fotos, un error de RLS, un payload rechazado— el perfil público quedaba
-- COMPLETAMENTE VACÍO y no había vuelta atrás: el borrador ya se había
-- consumido. Es el mismo tipo de fallo detrás del bug histórico de las fotos
-- "desaparecidas".
--
-- Una función de Postgres corre siempre dentro de una única transacción, así
-- que si el insert falla, el delete se revierte solo y el perfil publicado
-- anterior queda intacto.
--
-- security invoker (no definer) a propósito: la función NO se salta RLS. El
-- delete y el insert se evalúan con las políticas de profile_blocks del
-- usuario que llama, igual que antes. La atomicidad es lo único que cambia,
-- no los permisos.
--
-- Idempotente. Correr DESPUÉS de 0003 (usa profile_private).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.publish_profile(
  p_profile_id uuid,
  p_blocks jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'p_blocks debe ser un arreglo JSON';
  end if;

  -- Reemplazo completo de los bloques publicados. Si cualquiera de las dos
  -- sentencias falla, toda la función se revierte.
  delete from profile_blocks where profile_id = p_profile_id;

  insert into profile_blocks (profile_id, block_type, position_index, content, is_visible)
  select
    p_profile_id,
    bloque ->> 'block_type',
    (bloque ->> 'position_index')::int,
    bloque -> 'content',
    true
  from jsonb_array_elements(p_blocks) as bloque;

  -- El borrador se limpia DENTRO de la misma transacción. Antes era una
  -- llamada aparte con 3 reintentos: si igual fallaba, quedaba un borrador
  -- viejo que al reabrir el editor pisaba lo recién publicado.
  update profile_private
  set draft_content = null,
      updated_at = now()
  where profile_id = p_profile_id;
end;
$$;

-- Solo usuarios autenticados. anon no tiene nada que publicar.
revoke execute on function public.publish_profile(uuid, jsonb) from public, anon;
grant execute on function public.publish_profile(uuid, jsonb) to authenticated;
