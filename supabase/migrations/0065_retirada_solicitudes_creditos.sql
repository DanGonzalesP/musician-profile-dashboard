begin;
alter table public.credit_requests add column withdrawn_at timestamptz;
create or replace function private.guard_credit_request() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.resolved_at is not null or new.withdrawn_at is not null then
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
  if new.withdrawn_at is distinct from old.withdrawn_at then
    if old.withdrawn_at is not null or new.withdrawn_at is null or old.status <> 'pending'
      or new.status is distinct from old.status or not exists (
        select 1 from public.profiles p where p.id = old.requester_profile_id
          and p.user_id = auth.uid()) then
      raise exception using errcode = '42501', message = 'No se puede retirar esta solicitud';
    end if;
    new.withdrawn_at := now();
  end if;
  if old.withdrawn_at is not null and new.status is distinct from old.status then
    raise exception using errcode = '23514', message = 'La solicitud fue retirada';
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

create function public.withdraw_credit_request(p_request_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_profile uuid;
begin
  select r.requester_profile_id into v_profile from public.credit_requests r
    join public.profiles p on p.id = r.requester_profile_id
    where r.id = p_request_id and p.user_id = auth.uid();
  if v_profile is null then
    raise exception using errcode = '42501', message = 'Solicitud no disponible';
  end if;
  update public.credit_requests set withdrawn_at = now()
    where id = p_request_id and status = 'pending' and withdrawn_at is null;
  return exists(select 1 from public.credit_requests
    where id = p_request_id and withdrawn_at is not null);
end;
$$;
revoke all on function public.withdraw_credit_request(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_credit_request(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
