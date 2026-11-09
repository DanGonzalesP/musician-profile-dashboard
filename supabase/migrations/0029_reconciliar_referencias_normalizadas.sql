-- La ampliación del normalizador en 0027 también debe cubrir filas anteriores.
-- Reconstruir sólo el índice privado; nunca modificar contenido del artista.
begin;
lock table public.media_assets, public.profiles, public.profile_blocks,
  public.profile_private, public.products, public.services, public.music_feed
  in share row exclusive mode;
lock table private.media_lifecycle, private.media_references in exclusive mode;
create temporary table media_reference_snapshot (
  key text not null, source_table text not null, source_id text not null,
  primary key(key, source_table, source_id)
) on commit drop;
do $$
declare v_table text; v_pk text;
begin
  foreach v_table in array array['profiles','profile_blocks','profile_private','products','services','music_feed'] loop
    v_pk := case when v_table = 'profile_private' then 'profile_id' else 'id' end;
    execute format('insert into pg_temp.media_reference_snapshot(key,source_table,source_id) select unnest(private.media_keys(to_jsonb(t))), %L, t.%I::text from public.%I t', v_table, v_pk, v_table);
  end loop;
  if exists(select 1 from pg_temp.media_reference_snapshot r
    join private.media_lifecycle l using(key) where l.state <> 'active') then
    -- No resucitar una key que puede haber desaparecido en R2. Requiere
    -- resolver la referencia histórica antes de continuar la migración.
    raise exception 'referencia_previa_a_archivo_retirado' using errcode = '23514';
  end if;
end;
$$;
insert into private.media_lifecycle(key)
  select distinct key from pg_temp.media_reference_snapshot on conflict do nothing;
delete from private.media_references;
insert into private.media_references select * from pg_temp.media_reference_snapshot;
commit;
