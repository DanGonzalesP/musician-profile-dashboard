-- Cola y decisiones de moderación con roles reales y registro inmutable.
begin;
alter table public.content_reports add column moderation_version bigint not null default 0;
drop policy content_reports_insert_authenticated on public.content_reports;
create policy content_reports_insert_authenticated on public.content_reports for insert to authenticated
with check ((reason<>'derechos_de_autor' or copyright_sworn_statement)
 and (reporter_user_id is null or reporter_user_id=auth.uid())
 and status='pendiente' and moderator_notes is null and resolved_at is null and moderation_version=0);
create table private.moderation_events (
 id bigint generated always as identity primary key,
 report_id uuid not null,
 profile_id uuid not null,
 actor_user_id uuid not null,
 action text not null check(action in ('review','dismiss','accept','suspend','restore')),
 previous_status text not null,
 new_status text not null,
 note text not null check(char_length(note) between 10 and 4000),
 created_at timestamptz not null default now()
);
alter table private.moderation_events enable row level security;
revoke all on private.moderation_events from public,anon,authenticated;
revoke all on sequence private.moderation_events_id_seq from public,anon,authenticated;
create index moderation_events_report on private.moderation_events(report_id,id);

create function public.moderation_queue(p_status text default 'pendiente',p_offset integer default 0)
returns setof public.content_reports language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_platform_permission('moderation') then
  raise exception 'operacion_no_permitida' using errcode='42501';
 end if;
 if p_status is null or p_status not in ('pendiente','en_revision','aceptado','rechazado')
  or p_offset is null or p_offset<0 or p_offset>10000 then
  raise exception 'consulta_invalida' using errcode='22023';
 end if;
 return query select r.* from public.content_reports r where r.status=p_status
  order by r.created_at,r.id limit 50 offset p_offset;
end;
$$;
revoke all on function public.moderation_queue(text,integer) from public,anon,authenticated;
grant execute on function public.moderation_queue(text,integer) to authenticated;

create function public.moderate_report(p_report_id uuid,p_expected_version bigint,p_action text,p_note text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r public.content_reports; p public.profiles; next_status text; marker text;
begin
 -- La revocación de0039 y las decisiones se serializan sobre el mismo cerrojo.
 perform pg_advisory_xact_lock(9039,1);
 if not public.has_platform_permission('moderation') then
  raise exception 'operacion_no_permitida' using errcode='42501';
 end if;
 if p_action is null or p_action not in ('review','dismiss','accept','suspend','restore')
  or p_note is null or char_length(trim(p_note)) not between 10 and 4000 then
  raise exception 'decision_invalida' using errcode='22023';
 end if;
 select * into r from public.content_reports where id=p_report_id for update;
 if not found then raise exception 'reporte_no_disponible' using errcode='PT404'; end if;
 if p_expected_version is distinct from r.moderation_version then
  raise exception 'reporte_modificado' using errcode='PT409';
 end if;
 select * into p from public.profiles where id=r.reported_profile_id for update;
 if not found then raise exception 'perfil_no_disponible' using errcode='PT404'; end if;
 if p.user_id=auth.uid() or r.reporter_user_id=auth.uid() then
  raise exception 'revision_requiere_otro_moderador' using errcode='42501';
 end if;
 marker:='report:'||r.id::text;
 if p_action='review' then
  if r.status<>'pendiente' then raise exception 'transicion_invalida' using errcode='PT409'; end if;
  next_status:='en_revision';
 elsif p_action in ('dismiss','accept','suspend') then
  if r.status<>'en_revision' then raise exception 'revisar_antes_de_resolver' using errcode='PT409'; end if;
  next_status:=case when p_action='dismiss' then 'rechazado' else 'aceptado' end;
  if p_action='suspend' then
   if p.is_suspended then raise exception 'perfil_ya_suspendido' using errcode='PT409'; end if;
   update public.profiles set is_suspended=true,suspended_reason=marker,suspended_at=now() where id=p.id;
  end if;
 else
  -- Sólo revierte la suspensión de ESTE expediente; no levanta otra sanción.
  if r.status<>'aceptado' or not p.is_suspended or p.suspended_reason is distinct from marker then
   raise exception 'restauracion_no_permitida' using errcode='PT409';
  end if;
  next_status:='rechazado';
  update public.profiles set is_suspended=false,suspended_reason=null,suspended_at=null where id=p.id;
 end if;
 update public.content_reports set status=next_status,moderator_notes=trim(p_note),
  resolved_at=case when next_status in ('aceptado','rechazado') then now() else null end,
  moderation_version=moderation_version+1 where id=r.id;
 insert into private.moderation_events(report_id,profile_id,actor_user_id,action,previous_status,new_status,note)
 values(r.id,p.id,auth.uid(),p_action,r.status,next_status,trim(p_note));
 return jsonb_build_object('status',next_status,'version',r.moderation_version+1,'profileId',p.id,'username',p.username);
end;
$$;
revoke all on function public.moderate_report(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.moderate_report(uuid,bigint,text,text) to authenticated;

create function public.moderation_history(p_report_id uuid)
returns table(id bigint,actor_user_id uuid,action text,previous_status text,new_status text,note text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_platform_permission('moderation') then
  raise exception 'operacion_no_permitida' using errcode='42501';
 end if;
 return query select e.id,e.actor_user_id,e.action,e.previous_status,e.new_status,e.note,e.created_at
 from private.moderation_events e where e.report_id=p_report_id order by e.id desc limit 100;
end;
$$;
revoke all on function public.moderation_history(uuid) from public,anon,authenticated;
grant execute on function public.moderation_history(uuid) to authenticated;
commit;
