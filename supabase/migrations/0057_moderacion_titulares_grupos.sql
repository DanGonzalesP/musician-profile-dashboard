-- Titularidad de grupos en avisos, revisiones y exportación de moderación.

-- Conserva contratos, versiones, bloqueos, auditoría y privilegios existentes.

-- Ningún miembro o administrador de grupo recibe permisos de titular por esta migración.

begin;

create or replace function public.moderate_report(p_report_id uuid,p_expected_version bigint,p_action text,p_note text)
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
 if p.user_id=auth.uid() or p.owner_user_id=auth.uid() or r.reporter_user_id=auth.uid() then
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

create or replace function public.my_moderation_decisions(p_offset integer default 0)
returns table(report_id uuid,profile_id uuid,profile_name text,reason text,
 status text,decision_version bigint,decided_at timestamptz,profile_suspended boolean,
 appeal_id uuid,appeal_message text,appeal_created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'sesion_requerida' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_offset>10000 then
  raise exception 'consulta_invalida' using errcode='22023';
 end if;
 return query select r.id,p.id,p.display_name::text,r.reason::text,r.status::text,
  r.moderation_version,r.resolved_at,coalesce(p.is_suspended,false),a.id,a.message,a.created_at
 from public.content_reports r join public.profiles p on p.id=r.reported_profile_id
 left join private.moderation_appeals a on a.report_id=r.id
  and a.decision_version=r.moderation_version and a.requester_user_id=auth.uid()
 where (p.user_id=auth.uid() or p.owner_user_id=auth.uid()) and r.status in ('aceptado','rechazado')
 order by r.resolved_at desc nulls last,r.id limit 50 offset p_offset;
end;
$$;
revoke all on function public.my_moderation_decisions(integer) from public,anon,authenticated;
grant execute on function public.my_moderation_decisions(integer) to authenticated;

create or replace function public.request_moderation_review(p_report_id uuid,p_version bigint,p_message text)
returns uuid language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r public.content_reports; v_owner uuid; existing private.moderation_appeals; v_id uuid;
begin
 if auth.uid() is null then raise exception 'sesion_requerida' using errcode='42501'; end if;
 if p_message is null or char_length(trim(p_message)) not between 20 and 4000 then
  raise exception 'solicitud_invalida' using errcode='22023';
 end if;
 -- Mismo orden global que decisiones/revocación, antes de bloquear cuenta/reporte.
 perform pg_advisory_xact_lock(9039,1);
 perform private.assert_account_writable(auth.uid());
 select * into r from public.content_reports where id=p_report_id for update;
 if not found then raise exception 'decision_no_disponible' using errcode='42501'; end if;
 select auth.uid() into v_owner from public.profiles where id=r.reported_profile_id
  and (user_id=auth.uid() or owner_user_id=auth.uid()) for share;
 if v_owner is distinct from auth.uid() then
  raise exception 'decision_no_disponible' using errcode='42501';
 end if;
 if r.status<>'aceptado' or p_version is distinct from r.moderation_version then
  raise exception 'decision_modificada' using errcode='PT409';
 end if;
 select * into existing from private.moderation_appeals
  where report_id=r.id and decision_version=p_version;
 if found then
  if existing.requester_user_id=auth.uid() and existing.message=trim(p_message) then
   return existing.id;
  end if;
  raise exception 'revision_ya_solicitada' using errcode='PT409';
 end if;
 insert into private.moderation_appeals(report_id,requester_user_id,decision_version,message)
 values(r.id,auth.uid(),p_version,trim(p_message)) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.request_moderation_review(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.request_moderation_review(uuid,bigint,text) to authenticated;

create or replace function public.resolve_moderation_review(p_appeal_id uuid,p_outcome text,p_response text)
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
 if a.requester_user_id=auth.uid() or r.reporter_user_id=auth.uid() or p.user_id=auth.uid() or p.owner_user_id=auth.uid()
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

create or replace function public.my_moderation_decisions_v2(p_offset integer default 0)
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
 where (p.user_id=auth.uid() or p.owner_user_id=auth.uid()) and r.status in ('aceptado','rechazado')
 order by r.resolved_at desc nulls last,r.id limit 50 offset p_offset;
end;
$$;
revoke all on function public.my_moderation_decisions_v2(integer) from public,anon,authenticated;
grant execute on function public.my_moderation_decisions_v2(integer) to authenticated;

create or replace function public.moderation_review_requests_v2(p_report_id uuid)
returns table(id uuid,decision_version bigint,message text,created_at timestamptz,
 outcome text,public_response text,resolved_at timestamptz,can_resolve boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_platform_permission('moderation') then
  raise exception 'operacion_no_permitida' using errcode='42501';
 end if;
 return query select a.id,a.decision_version,a.message,a.created_at,a.outcome,a.public_response,a.resolved_at,
  a.outcome is null and a.requester_user_id<>auth.uid()
   and r.reporter_user_id is distinct from auth.uid() and p.user_id is distinct from auth.uid() and p.owner_user_id is distinct from auth.uid()
   and not exists(select 1 from private.moderation_events e where e.report_id=r.id and e.actor_user_id=auth.uid())
 from private.moderation_appeals a join public.content_reports r on r.id=a.report_id
 join public.profiles p on p.id=r.reported_profile_id where a.report_id=p_report_id
 order by a.outcome is not null,
  case when a.outcome is null then a.created_at end asc,a.created_at desc,a.id limit 100;
end;
$$;
revoke all on function public.moderation_review_requests_v2(uuid) from public,anon,authenticated;
grant execute on function public.moderation_review_requests_v2(uuid) to authenticated;

create or replace function public.export_my_moderation_data()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
 if v_actor is null then raise exception 'sesion_requerida' using errcode='42501'; end if;
 select jsonb_build_object(
  'reportes_enviados', (select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'perfil_reportado',r.reported_profile_id,'tipo',r.target_type,'referencia',r.target_id,
   'motivo',r.reason,'detalle',r.details,'correo_aportado',r.reporter_email,
   'declaracion_titularidad',r.copyright_sworn_statement,'estado',r.status,
   'creado_en',r.created_at,'resuelto_en',r.resolved_at) order by r.created_at,r.id),'[]'::jsonb)
   from public.content_reports r where r.reporter_user_id=v_actor),
  'decisiones_perfiles_propios', (select coalesce(jsonb_agg(jsonb_build_object(
   'reporte',r.id,'perfil',p.id,'motivo',r.reason,'estado',r.status,
   'version',r.moderation_version,'resuelto_en',r.resolved_at) order by r.resolved_at,r.id),'[]'::jsonb)
   from public.content_reports r join public.profiles p on p.id=r.reported_profile_id
   where (p.user_id=v_actor or p.owner_user_id=v_actor) and r.status in ('aceptado','rechazado')),
  'solicitudes_revision', (select coalesce(jsonb_agg(jsonb_build_object(
   'id',a.id,'reporte',a.report_id,'version_decision',a.decision_version,
   'solicitud',a.message,'creada_en',a.created_at,'resultado',a.outcome,
   'respuesta',a.public_response,'respondida_en',a.resolved_at) order by a.created_at,a.id),'[]'::jsonb)
   from private.moderation_appeals a where a.requester_user_id=v_actor)
 ) into v_result;
 return v_result;
end;
$$;
revoke all on function public.export_my_moderation_data() from public,anon,authenticated;
grant execute on function public.export_my_moderation_data() to authenticated;

create or replace function public.my_moderation_notice_count()
returns bigint language plpgsql stable security definer set search_path='' as $$
declare total bigint;
begin
 if auth.uid() is null then raise exception 'sesion_requerida' using errcode='42501'; end if;
 select count(*) into total from public.content_reports r
 join public.profiles p on p.id=r.reported_profile_id
 left join private.moderation_notice_reads seen on seen.report_id=r.id and seen.user_id=auth.uid()
 left join lateral (select a.resolved_at from private.moderation_appeals a
  where a.report_id=r.id and a.requester_user_id=auth.uid()
  order by a.decision_version desc limit 1) response on true
 where (p.user_id=auth.uid() or p.owner_user_id=auth.uid()) and r.status in ('aceptado','rechazado')
  and (seen.decision_version is distinct from r.moderation_version
   or seen.response_at is distinct from response.resolved_at);
 return total;
end;
$$;
revoke all on function public.my_moderation_notice_count() from public,anon,authenticated;
grant execute on function public.my_moderation_notice_count() to authenticated;

create or replace function public.ack_moderation_notice(p_report_id uuid,p_version bigint,p_response_at timestamptz)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r public.content_reports; v_owner uuid; v_response_at timestamptz;
begin
 if auth.uid() is null then raise exception 'sesion_requerida' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(9039,1);
 perform private.assert_account_writable(auth.uid());
 select * into r from public.content_reports where id=p_report_id for update;
 if not found then raise exception 'decision_no_disponible' using errcode='42501'; end if;
 select auth.uid() into v_owner from public.profiles p where p.id=r.reported_profile_id
  and (p.user_id=auth.uid() or p.owner_user_id=auth.uid()) for share;
 if v_owner is distinct from auth.uid() then
  raise exception 'decision_no_disponible' using errcode='42501';
 end if;
 select a.resolved_at into v_response_at from private.moderation_appeals a
 where a.report_id=r.id and a.requester_user_id=auth.uid()
 order by a.decision_version desc limit 1;
 -- Nunca marcar como leída una respuesta que llegó después de abrir la pantalla.
 if r.status not in ('aceptado','rechazado') or p_version is distinct from r.moderation_version
  or p_response_at is distinct from v_response_at then
  raise exception 'decision_modificada' using errcode='PT409';
 end if;
 insert into private.moderation_notice_reads(user_id,report_id,decision_version,response_at)
 values(auth.uid(),r.id,p_version,p_response_at)
 on conflict(user_id,report_id) do update set decision_version=excluded.decision_version,
  response_at=excluded.response_at,read_at=clock_timestamp();
 return true;
end;
$$;
revoke all on function public.ack_moderation_notice(uuid,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.ack_moderation_notice(uuid,bigint,timestamptz) to authenticated;

notify pgrst, 'reload schema';

commit;
