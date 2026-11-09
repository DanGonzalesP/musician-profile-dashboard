-- Consulta acotada y cambios condicionados al estado que revisó el operador.
begin;

create function public.platform_role_directory(p_user_id uuid default null, p_after uuid default null)
returns table(user_id uuid, role text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_platform_permission('roles') then
    raise exception 'operacion_no_permitida' using errcode='42501';
  end if;
  return query select r.user_id,r.role,r.updated_at from private.platform_roles r
    where (p_user_id is null or r.user_id=p_user_id)
      and (p_after is null or r.user_id>p_after)
    order by r.user_id limit 21;
end;
$$;
revoke all on function public.platform_role_directory(uuid,uuid) from public,anon;
grant execute on function public.platform_role_directory(uuid,uuid) to authenticated;

create function public.set_platform_role_if_current(p_user_id uuid,p_role text,p_expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare current_updated_at timestamptz;
begin
  -- El mismo bloqueo protege asignación, revocación y último owner desde0039.
  perform pg_advisory_xact_lock(9039,1);
  if auth.uid() is null or not public.has_platform_permission('roles') then
    raise exception 'operacion_no_permitida' using errcode='42501';
  end if;
  select r.updated_at into current_updated_at from private.platform_roles r where r.user_id=p_user_id;
  if current_updated_at is distinct from p_expected_updated_at then
    raise exception 'rol_modificado' using errcode='PT409';
  end if;
  perform public.set_platform_role(p_user_id,p_role);
end;
$$;
revoke all on function public.set_platform_role_if_current(uuid,text,timestamptz) from public,anon;
grant execute on function public.set_platform_role_if_current(uuid,text,timestamptz) to authenticated;
commit;
