-- ═══════════════════════════════════════════════════════════════════════════
-- 0015_relacion_bloques_perfiles.sql — Restaura el join del feed público.
--
-- La portada consulta `profile_blocks` con el recurso embebido `profiles`.
-- PostgREST sólo permite ese join cuando existe una FK inequívoca. El esquema
-- histórico nunca declaró la relación, por lo que producción devolvía PGRST200
-- y `/` respondía 500 en vez de mostrar el feed.
--
-- Se añade NOT VALID para no recorrer ni rechazar datos históricos durante el
-- despliegue. Desde este instante protege todas las escrituras nuevas y
-- PostgREST puede descubrir la relación. La validación retroactiva será una
-- migración posterior, después de auditar posibles huérfanos.
--
-- Idempotente. Correr DESPUÉS de 0014.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profile_blocks'::regclass
      and conname = 'profile_blocks_profile_id_fkey'
  ) then
    alter table public.profile_blocks
      add constraint profile_blocks_profile_id_fkey
      foreign key (profile_id)
      references public.profiles(id)
      on delete cascade
      not valid;
  end if;
end $$;

-- Verificación de solo lectura: convalidated=false es deliberado en esta fase.
select
  conname,
  convalidated,
  pg_catalog.pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.profile_blocks'::regclass
  and conname = 'profile_blocks_profile_id_fkey';
