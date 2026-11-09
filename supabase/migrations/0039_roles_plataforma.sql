-- Roles de plataforma evaluados con auth.uid() real, nunca con una lista del
-- runtime ni metadatos editables del usuario. Primer owner: provisión SQL por
-- el operador de la base, fuera de la aplicación y con identidad confirmada.
begin;
create table private.platform_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','moderator','maintenance')),
  updated_at timestamptz not null default now()
);
create table private.platform_role_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  target_user_id uuid not null,
  old_role text,
  new_role text,
  created_at timestamptz not null default now()
);
alter table private.platform_roles enable row level security;
alter table private.platform_role_audit enable row level security;
revoke all on private.platform_roles,private.platform_role_audit from public,anon,authenticated;
revoke all on sequence private.platform_role_audit_id_seq from public,anon,authenticated;

create function public.has_platform_permission(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.platform_roles r where r.user_id=auth.uid()
    and (p_permission='roles' and r.role='owner'
      or p_permission='moderation' and r.role in ('owner','moderator')
      or p_permission='maintenance' and r.role in ('owner','maintenance'))
  );
$$;
revoke all on function public.has_platform_permission(text) from public,anon,authenticated;
grant execute on function public.has_platform_permission(text) to authenticated;

create function private.audit_platform_role_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Mismo bloqueo que la asignación: incluye eliminaciones por cierre de cuenta.
  perform pg_advisory_xact_lock(9039,1);
  if TG_OP in ('UPDATE','DELETE') and OLD.role='owner'
    and (TG_OP='DELETE' or NEW.role<>'owner') and auth.uid() is not null
    and not exists(select 1 from private.platform_roles where role='owner' and user_id<>OLD.user_id) then
    raise exception 'ultimo_administrador' using errcode='PT409';
  end if;
  insert into private.platform_role_audit(actor_user_id,target_user_id,old_role,new_role)
    values(auth.uid(),case when TG_OP='DELETE' then OLD.user_id else NEW.user_id end,
      case when TG_OP='INSERT' then null else OLD.role end,
      case when TG_OP='DELETE' then null else NEW.role end);
  if TG_OP='DELETE' then return OLD; end if;
  NEW.updated_at := clock_timestamp();
  return NEW;
end;
$$;
revoke all on function private.audit_platform_role_change() from public,anon,authenticated;
create trigger platform_role_audited before insert or update or delete on private.platform_roles
for each row execute function private.audit_platform_role_change();

-- NULL revoca. El bloqueo se toma ANTES de comprobar el rol: una sesión que
-- esperaba no conserva permisos retirados por otra transacción.
create function public.set_platform_role(p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
begin
  perform pg_advisory_xact_lock(9039,1);
  if not public.has_platform_permission('roles') then
    raise exception 'operacion_no_permitida' using errcode='42501';
  end if;
  if p_user_id is null or (p_role is not null and p_role not in ('owner','moderator','maintenance')) then
    raise exception 'rol_invalido' using errcode='22023';
  end if;
  if p_role is null then
    delete from private.platform_roles where user_id=p_user_id;
  else
    if not exists(select 1 from auth.users where id=p_user_id) then
      raise exception 'usuario_invalido' using errcode='22023';
    end if;
    insert into private.platform_roles(user_id,role) values(p_user_id,p_role)
      on conflict(user_id) do update set role=excluded.role
      where platform_roles.role is distinct from excluded.role;
  end if;
end;
$$;
revoke all on function public.set_platform_role(uuid,text) from public,anon;
grant execute on function public.set_platform_role(uuid,text) to authenticated;

create function public.platform_role_history(p_before bigint default null,p_limit integer default 50)
returns table(id bigint,actor_user_id uuid,target_user_id uuid,old_role text,new_role text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_platform_permission('roles') then
    raise exception 'operacion_no_permitida' using errcode='42501';
  end if;
  return query select a.id,a.actor_user_id,a.target_user_id,a.old_role,a.new_role,a.created_at
    from private.platform_role_audit a where p_before is null or a.id<p_before
    order by a.id desc limit greatest(1,least(coalesce(p_limit,50),100));
end;
$$;
revoke all on function public.platform_role_history(bigint,integer) from public,anon;
grant execute on function public.platform_role_history(bigint,integer) to authenticated;
commit;
