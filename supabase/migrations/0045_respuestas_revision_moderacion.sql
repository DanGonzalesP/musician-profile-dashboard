-- Respuesta pública separada de notas internas. Preparada, sin aplicar.
begin;
alter table private.moderation_events drop constraint moderation_events_action_check;
alter table private.moderation_events add constraint moderation_events_action_check
 check(action in ('review','dismiss','accept','suspend','restore','revoke'));
alter table private.moderation_appeals
 add column outcome text check(outcome in ('mantenida','restituida','revocada','superada')),
 add column public_response text,
 add column resolved_at timestamptz,
 add column resolved_by uuid,
 add constraint appeal_resolution_complete check(
  (outcome is null and public_response is null and resolved_at is null and resolved_by is null)
  or (outcome is not null and public_response is not null
   and char_length(public_response) between 20 and 4000 and resolved_at is not null and resolved_by is not null));

create function public.resolve_moderation_review(p_appeal_id uuid,p_outcome text,p_response text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare a private.moderation_appeals; r public.content_reports; p public.profiles; restored jsonb;
begin
 perform pg_advisory_xact_lock(9039,1);
 if not public.has_platform_permission('moderation') then
  raise exception 'operacion_no_permitida' using errcode='42501';
 end if;
 if p_outcome is null or p_outcome not in ('mantenida','restituida','revocada','superada')
  or p_response is null or char_length(trim(p_response)) not between 20 and 4000 then
  raise exception 'respuesta_invalida' using errcode='22023';
 end if;
 select * into a from private.moderation_appeals where id=p_appeal_id for update;
 if not found then raise exception 'solicitud_no_disponible' using errcode='42501'; end if;
 select * into r from public.content_reports where id=a.report_id for update;
 if not found then raise exception 'solicitud_no_disponible' using errcode='42501'; end if;
 select * into p from public.profiles where id=r.reported_profile_id for update;
 if not found then raise exception 'solicitud_no_disponible' using errcode='42501'; end if;
 if a.outcome is not null then
  if a.resolved_by=auth.uid() and a.outcome=p_outcome and a.public_response=trim(p_response) then
   return jsonb_build_object('saved',true,'username',p.username,'outcome',a.outcome);
  end if;
  raise exception 'solicitud_resuelta' using errcode='PT409';
 end if;
 -- Revisor independiente: ni titular, denunciante ni participante previo.
 if a.requester_user_id=auth.uid() or r.reporter_user_id=auth.uid() or p.user_id=auth.uid()
  or exists(select 1 from private.moderation_events e where e.report_id=r.id and e.actor_user_id=auth.uid()) then
  raise exception 'revision_requiere_otro_moderador' using errcode='42501';
 end if;
 perform private.assert_account_writable(auth.uid());
 perform private.assert_account_writable(a.requester_user_id);
 if p_outcome='superada' then
  if r.moderation_version=a.decision_version and r.status='aceptado' then
   raise exception 'decision_aun_vigente' using errcode='PT409';
  end if;
 elsif r.moderation_version<>a.decision_version or r.status<>'aceptado' then
  raise exception 'decision_modificada' using errcode='PT409';
 elsif p_outcome='restituida' then
  -- Reutiliza la retirada atribuida al expediente: nunca levanta otra sanción.
  restored:=public.moderate_report(r.id,r.moderation_version,'restore',trim(p_response));
 elsif p_outcome='revocada' then
  if coalesce(p.is_suspended,false) and p.suspended_reason='report:'||r.id::text then
   raise exception 'restitucion_requerida' using errcode='PT409';
  end if;
  -- Corrige este expediente sin cambiar el perfil ni levantar sanciones ajenas.
  update public.content_reports set status='rechazado',moderator_notes=trim(p_response),
   resolved_at=clock_timestamp(),moderation_version=moderation_version+1 where id=r.id;
  insert into private.moderation_events(report_id,profile_id,actor_user_id,action,previous_status,new_status,note)
  values(r.id,p.id,auth.uid(),'revoke',r.status,'rechazado',trim(p_response));
 end if;
 update private.moderation_appeals set outcome=p_outcome,public_response=trim(p_response),
  resolved_at=clock_timestamp(),resolved_by=auth.uid() where id=a.id;
 return jsonb_build_object('saved',true,'username',p.username,'outcome',p_outcome);
end;
$$;
revoke all on function public.resolve_moderation_review(uuid,text,text) from public,anon,authenticated;
grant execute on function public.resolve_moderation_review(uuid,text,text) to authenticated;

create function public.my_moderation_decisions_v2(p_offset integer default 0)
returns table(report_id uuid,profile_id uuid,profile_name text,reason text,
 status text,decision_version bigint,decided_at timestamptz,profile_suspended boolean,
 appeal_id uuid,appeal_message text,appeal_created_at timestamptz,appeal_decision_version bigint,
 appeal_outcome text,appeal_response text,appeal_resolved_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'sesion_requerida' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_offset>10000 then
  raise exception 'consulta_invalida' using errcode='22023';
 end if;
 return query select r.id,p.id,p.display_name::text,r.reason::text,r.status::text,
  r.moderation_version,r.resolved_at,coalesce(p.is_suspended,false),a.id,a.message,a.created_at,
  a.decision_version,a.outcome,a.public_response,a.resolved_at
 from public.content_reports r join public.profiles p on p.id=r.reported_profile_id
 left join lateral (select x.* from private.moderation_appeals x
  where x.report_id=r.id and x.requester_user_id=auth.uid()
  order by x.decision_version desc limit 1) a on true
 where p.user_id=auth.uid() and r.status in ('aceptado','rechazado')
 order by r.resolved_at desc nulls last,r.id limit 50 offset p_offset;
end;
$$;
revoke all on function public.my_moderation_decisions_v2(integer) from public,anon,authenticated;
grant execute on function public.my_moderation_decisions_v2(integer) to authenticated;

create function public.moderation_review_requests_v2(p_report_id uuid)
returns table(id uuid,decision_version bigint,message text,created_at timestamptz,
 outcome text,public_response text,resolved_at timestamptz,can_resolve boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_platform_permission('moderation') then
  raise exception 'operacion_no_permitida' using errcode='42501';
 end if;
 return query select a.id,a.decision_version,a.message,a.created_at,a.outcome,a.public_response,a.resolved_at,
  a.outcome is null and a.requester_user_id<>auth.uid()
   and r.reporter_user_id is distinct from auth.uid() and p.user_id<>auth.uid()
   and not exists(select 1 from private.moderation_events e where e.report_id=r.id and e.actor_user_id=auth.uid())
 from private.moderation_appeals a join public.content_reports r on r.id=a.report_id
 join public.profiles p on p.id=r.reported_profile_id where a.report_id=p_report_id
 order by a.outcome is not null,
  case when a.outcome is null then a.created_at end asc,a.created_at desc,a.id limit 100;
end;
$$;
revoke all on function public.moderation_review_requests_v2(uuid) from public,anon,authenticated;
grant execute on function public.moderation_review_requests_v2(uuid) to authenticated;
commit;
