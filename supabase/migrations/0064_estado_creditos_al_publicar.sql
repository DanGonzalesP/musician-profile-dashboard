begin;
-- El estado enviado por el editor no acredita una colaboración. Se conserva
-- todo el contenido y se sustituye sólo status por la decisión correspondiente
-- a ESTA combinación de perfil, crédito, canción, destinatario y rol.
create function private.normalize_published_credit_statuses() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_credit jsonb;
  v_credits jsonb := '[]'::jsonb;
  v_status text;
begin
  if new.block_type <> 'credits'
    or jsonb_typeof(new.content->'credits') is distinct from 'array' then
    return new;
  end if;
  for v_credit in select value from jsonb_array_elements(new.content->'credits') loop
    if v_credit->>'sourceType' = 'internal' then
      v_status := null;
      select r.status into v_status from public.credit_requests r
      where r.id::text = v_credit->>'requestId'
        and r.requester_profile_id = new.profile_id
        and r.requester_credit_id = v_credit->>'id'
        and r.owner_profile_id::text = v_credit->>'ownerProfileId'
        and r.song_key = v_credit->>'songKey'
        and r.song_title = v_credit->>'title'
        and r.role = v_credit->>'role';
      v_credit := jsonb_set(v_credit, '{status}', to_jsonb(coalesce(v_status, 'pending')), true);
    end if;
    v_credits := v_credits || jsonb_build_array(v_credit);
  end loop;
  new.content := jsonb_set(new.content, '{credits}', v_credits, true);
  return new;
end;
$$;
revoke all on function private.normalize_published_credit_statuses() from public, anon, authenticated;
create trigger normalize_published_credit_statuses
  before insert or update of content, profile_id, block_type on public.profile_blocks
  for each row execute function private.normalize_published_credit_statuses();
notify pgrst, 'reload schema';
commit;
