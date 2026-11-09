-- Conserva solicitudes históricas; restringe únicamente escrituras nuevas.
begin;
create function private.guard_credit_request() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.resolved_at is not null then
      raise exception using errcode = '23514', message = 'La solicitud debe comenzar pendiente';
    end if;
    new.created_at := now();
    return new;
  end if;

  if row(new.id, new.requester_profile_id, new.requester_credit_id,
         new.owner_profile_id, new.song_title, new.song_key, new.role, new.created_at)
     is distinct from
     row(old.id, old.requester_profile_id, old.requester_credit_id,
         old.owner_profile_id, old.song_title, old.song_key, old.role, old.created_at) then
    raise exception using errcode = '23514', message = 'Los datos de la solicitud son inmutables';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'pending' or new.status not in ('accepted', 'rejected') then
      raise exception using errcode = '23514', message = 'La solicitud ya fue resuelta';
    end if;
    new.resolved_at := now();
  else
    new.resolved_at := old.resolved_at;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_credit_request() from public, anon, authenticated;
create trigger guard_credit_request before insert or update on public.credit_requests
  for each row execute function private.guard_credit_request();
notify pgrst, 'reload schema';
commit;
