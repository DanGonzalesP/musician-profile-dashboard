begin;
-- Sólo expone los campos necesarios para acreditar una colaboración YA
-- publicada. Nunca devuelve solicitudes privadas, pendientes ni rechazadas.
create function public.public_credit_approvals(p_profile_id uuid)
returns table(request_id text, credit_id text, owner_profile_id text,
  song_key text, song_title text, role text)
language sql stable security definer set search_path = '' as $$
  select distinct r.id::text, r.requester_credit_id, r.owner_profile_id::text,
    r.song_key, r.song_title, r.role
  from public.credit_requests r
  join public.profiles p on p.id = r.requester_profile_id
  join public.profiles owner on owner.id = r.owner_profile_id
  join public.profile_blocks b on b.profile_id = p.id
    and b.block_type = 'credits' and b.is_visible is true
  cross join lateral jsonb_array_elements(case
    when jsonb_typeof(b.content->'credits') = 'array' then b.content->'credits'
    else '[]'::jsonb end) c
  where p.id = p_profile_id and p.is_suspended is false
    and owner.is_suspended is false and r.status = 'accepted'
    and c->>'sourceType' = 'internal'
    and c->>'requestId' = r.id::text
    and c->>'id' = r.requester_credit_id
    and c->>'ownerProfileId' = r.owner_profile_id::text
    and c->>'songKey' = r.song_key and c->>'title' = r.song_title
    and c->>'role' = r.role;
$$;
revoke all on function public.public_credit_approvals(uuid) from public, anon, authenticated;
grant execute on function public.public_credit_approvals(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
