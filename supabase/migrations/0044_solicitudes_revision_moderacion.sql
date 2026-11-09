-- Preparada: no aplicar sin los gates de base y autenticación del bloque final.
-- Solicitud de revisión dentro de Vibe; no sustituye una contranotificación legal.
begin;
create table private.moderation_appeals (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null references public.content_reports(id) on delete cascade,
 requester_user_id uuid not null references auth.users(id) on delete cascade,
 decision_version bigint not null check(decision_version > 0),
 message text not null check(char_length(message) between 20 and 4000),
 created_at timestamptz not null default now(),
 unique(report_id, decision_version)
);
alter table private.moderation_appeals enable row level security;
revoke all on private.moderation_appeals from public,anon,authenticated;

-- Nunca entrega identidad del denunciante, su correo, pruebas o notas internas.
create function public.my_moderation_decisions(p_offset integer default 0)
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
 where p.user_id=auth.uid() and r.status in ('aceptado','rechazado')
 order by r.resolved_at desc nulls last,r.id limit 50 offset p_offset;
end;
$$;
revoke all on function public.my_moderation_decisions(integer) from public,anon,authenticated;
grant execute on function public.my_moderation_decisions(integer) to authenticated;

create function public.request_moderation_review(p_report_id uuid,p_version bigint,p_message text)
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
 select user_id into v_owner from public.profiles where id=r.reported_profile_id for share;
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

create function public.moderation_review_requests(p_report_id uuid)
returns table(id uuid,decision_version bigint,message text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_platform_permission('moderation') then
  raise exception 'operacion_no_permitida' using errcode='42501';
 end if;
 return query select a.id,a.decision_version,a.message,a.created_at
 from private.moderation_appeals a where a.report_id=p_report_id
 order by a.created_at desc,a.id limit 100;
end;
$$;
revoke all on function public.moderation_review_requests(uuid) from public,anon,authenticated;
grant execute on function public.moderation_review_requests(uuid) to authenticated;
commit;
