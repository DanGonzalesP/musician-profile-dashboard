-- Huella y certificado juntos, sin reemplazar el catálogo desde una copia antigua.
begin;
create function public.register_track_fingerprint(
  p_profile_id uuid, p_block_id bigint, p_expected_content jsonb,
  p_album_index integer, p_track_index integer, p_file_hash text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_content jsonb; v_path text[]; v_track jsonb;
begin
  -- Misma identidad real y RLS que el resto del editor. Primero lock del perfil,
  -- después del bloque, en el orden de publish_profile_complete.
  perform 1 from public.profiles where id = p_profile_id and user_id = auth.uid() for update;
  if not found then raise exception 'perfil_no_autorizado' using errcode = '42501'; end if;
  if p_file_hash is null or p_file_hash !~ '^[0-9a-f]{64}$'
    or p_album_index is null or p_album_index < 0
    or p_track_index is null or p_track_index < 0 then
    raise exception 'huella_invalida' using errcode = '23514';
  end if;
  select content into v_content from public.profile_blocks
    where id = p_block_id and profile_id = p_profile_id and block_type = 'tracks' for update;
  if not found or p_expected_content is null or v_content is distinct from p_expected_content then
    raise exception 'conflicto_de_version' using errcode = 'PT409';
  end if;
  if jsonb_typeof(v_content->'albums') = 'array' then
    if coalesce((v_content #> array['albums',p_album_index::text])->>'isExample','false') = 'true' then
      raise exception 'pista_de_ejemplo' using errcode = '23514';
    end if;
    v_path := array['albums',p_album_index::text,'tracks',p_track_index::text];
  elsif p_album_index = 0 and jsonb_typeof(v_content->'tracks') = 'array' then
    v_path := array['tracks',p_track_index::text];
  else
    raise exception 'pista_invalida' using errcode = '23514';
  end if;
  v_track := v_content #> v_path;
  if jsonb_typeof(v_track) is distinct from 'object' or coalesce(v_track->>'audioUrl','') = '' then
    raise exception 'pista_invalida' using errcode = '23514';
  end if;
  v_content := jsonb_set(v_content, v_path || array['fileHash'], to_jsonb(p_file_hash), true);
  update public.profile_blocks set content = v_content where id = p_block_id and profile_id = p_profile_id;
  if not found then raise exception 'perfil_no_autorizado' using errcode = '42501'; end if;
  insert into public.author_certificates(profile_id, song_title, file_hash)
    values(p_profile_id, coalesce(nullif(v_track->>'title',''),'Sin título'), p_file_hash)
    on conflict(profile_id,file_hash) do nothing;
  update public.profiles set content_version = content_version + 1 where id = p_profile_id;
  return v_content;
end;
$$;
revoke all on function public.register_track_fingerprint(uuid,bigint,jsonb,integer,integer,text) from public, anon;
grant execute on function public.register_track_fingerprint(uuid,bigint,jsonb,integer,integer,text) to authenticated;
notify pgrst, 'reload schema';
commit;
