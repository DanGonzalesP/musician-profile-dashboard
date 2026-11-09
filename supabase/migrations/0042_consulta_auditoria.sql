-- Consulta acotada sin exponer las tablas privadas ni metadatos históricos.
begin;
create function public.platform_audit_feed(
 p_source text default 'moderation', p_before bigint default null,
 p_report_id uuid default null
)
returns table(id text, actor_user_id uuid, action text, target_table text,
 target_id text, note text, created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_source is null or p_source not in ('moderation','activity')
   or (p_before is not null and p_before < 1)
   or (p_source='activity' and p_report_id is not null) then
  raise exception 'consulta_invalida' using errcode='22023';
 end if;
 if not public.has_platform_permission(
   case when p_source='moderation' then 'moderation' else 'roles' end
 ) then
  raise exception 'operacion_no_permitida' using errcode='42501';
 end if;
 if p_source='moderation' then
  return query select e.id::text,e.actor_user_id,e.action,'content_reports'::text,
   e.report_id::text,e.note,e.created_at from private.moderation_events e
   where (p_before is null or e.id<p_before)
    and (p_report_id is null or e.report_id=p_report_id)
   order by e.id desc limit 51;
 else
  -- No devolver metadata: puede contener datos personales del histórico.
  return query select a.id::text,a.actor_user_id,a.action,a.target_table,
   a.target_id,null::text,a.created_at from public.audit_log a
   where p_before is null or a.id<p_before order by a.id desc limit 51;
 end if;
end;
$$;
revoke all on function public.platform_audit_feed(text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.platform_audit_feed(text,bigint,uuid) to authenticated;

-- Sólo señales necesarias para las acciones de la cola; no motivos privados
-- de otras sanciones, correos, borradores ni inventarios de medios.
create function public.moderation_report_context(p_report_ids uuid[])
returns table(report_id uuid, username text, can_suspend boolean, can_restore boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_platform_permission('moderation') then
  raise exception 'operacion_no_permitida' using errcode='42501';
 end if;
 if p_report_ids is null or cardinality(p_report_ids)>50 then
  raise exception 'consulta_invalida' using errcode='22023';
 end if;
 return query select r.id,p.username::text,
  r.status='en_revision' and not coalesce(p.is_suspended,false),
  r.status='aceptado' and coalesce(p.is_suspended,false)
   and coalesce(p.suspended_reason='report:'||r.id::text,false)
 from public.content_reports r join public.profiles p on p.id=r.reported_profile_id
 where r.id=any(p_report_ids);
end;
$$;
revoke all on function public.moderation_report_context(uuid[]) from public,anon,authenticated;
grant execute on function public.moderation_report_context(uuid[]) to authenticated;
commit;
