-- Lectura explícita de decisiones/respuestas, sin correo ni proveedores nuevos.
begin;
create table private.moderation_notice_reads (
 user_id uuid not null references auth.users(id) on delete cascade,
 report_id uuid not null references public.content_reports(id) on delete cascade,
 decision_version bigint not null check(decision_version > 0),
 response_at timestamptz,
 read_at timestamptz not null default now(),
 primary key(user_id,report_id)
);
alter table private.moderation_notice_reads enable row level security;
revoke all on private.moderation_notice_reads from public,anon,authenticated;

create function public.my_moderation_notice_count()
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
 where p.user_id=auth.uid() and r.status in ('aceptado','rechazado')
  and (seen.decision_version is distinct from r.moderation_version
   or seen.response_at is distinct from response.resolved_at);
 return total;
end;
$$;
revoke all on function public.my_moderation_notice_count() from public,anon,authenticated;
grant execute on function public.my_moderation_notice_count() to authenticated;

create function public.ack_moderation_notice(p_report_id uuid,p_version bigint,p_response_at timestamptz)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r public.content_reports; v_owner uuid; v_response_at timestamptz;
begin
 if auth.uid() is null then raise exception 'sesion_requerida' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(9039,1);
 perform private.assert_account_writable(auth.uid());
 select * into r from public.content_reports where id=p_report_id for update;
 if not found then raise exception 'decision_no_disponible' using errcode='42501'; end if;
 select p.user_id into v_owner from public.profiles p where p.id=r.reported_profile_id for share;
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
commit;
