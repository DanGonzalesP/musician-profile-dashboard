-- Contador compartido para operaciones anónimas atestiguadas por el Worker.
-- La anon key no basta para elegir sujeto, bucket, cupo ni ventana.
-- Sin clave provisionada fuera de Git, la ruta queda cerrada.
begin;
create table private.anonymous_gateway_keys (
  key_id text primary key check (key_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  secret_hex text not null check (secret_hex ~ '^[0-9a-fA-F]{64}$')
);
create table private.anonymous_rate_windows (
  bucket text not null check (bucket in ('oembed','health')),
  subject text not null check (subject = 'global' or subject ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key(bucket, subject)
);
create index anonymous_rate_windows_expiry on private.anonymous_rate_windows(started_at);
alter table private.anonymous_gateway_keys enable row level security;
alter table private.anonymous_rate_windows enable row level security;
revoke all on private.anonymous_gateway_keys, private.anonymous_rate_windows from public, anon, authenticated;

create function public.consume_anonymous_rate_limit(p_payload text, p_signature text)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '2s' as $$
declare
  v jsonb; v_key text; v_expected bytea; v_given bytea; v_diff integer := 0;
  v_bucket text; v_subject text; v_limit integer; v_global_limit integer;
  v_count integer; v_started timestamptz; v_now timestamptz := clock_timestamp();
  v_window private.anonymous_rate_windows;
begin
  if p_payload is null or octet_length(p_payload) > 1024 or p_signature is null
    or p_signature !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'comprobante_anonimo_invalido' using errcode = '42501';
  end if;
  begin v := p_payload::jsonb;
  exception when invalid_text_representation then
    raise exception 'comprobante_anonimo_invalido' using errcode = '42501';
  end;
  select secret_hex into v_key from private.anonymous_gateway_keys where key_id = v->>'keyId';
  if v_key is null then raise exception 'limite_anonimo_no_configurado' using errcode = 'PT503'; end if;
  v_expected := extensions.hmac(convert_to(E'vibe-anonymous-rate-limit\n' || p_payload, 'UTF8'), decode(v_key, 'hex'), 'sha256');
  v_given := decode(p_signature, 'hex');
  for i in 0..31 loop v_diff := v_diff | (get_byte(v_expected,i) # get_byte(v_given,i)); end loop;
  if v_diff <> 0 or v->>'version' is distinct from '1'
    or not coalesce(v->>'issuedAt' ~ '^[0-9]{1,12}$', false) then
    raise exception 'comprobante_anonimo_invalido' using errcode = '42501';
  end if;
  if abs(extract(epoch from v_now) - (v->>'issuedAt')::numeric) > 30 then
    raise exception 'comprobante_anonimo_vencido' using errcode = '42501';
  end if;
  v_bucket := v->>'bucket'; v_subject := v->>'subject';
  if not coalesce(v_bucket in ('health','oembed'),false) or not coalesce(v_subject ~ '^[0-9a-f]{64}$',false) then
    raise exception 'comprobante_anonimo_invalido' using errcode = '42501';
  end if;
  v_limit := case v_bucket when 'oembed' then 30 else 60 end;
  v_global_limit := case v_bucket when 'oembed' then 600 else 3000 end;

  -- Techo global previo: limita coste y creación de filas aun con muchas redes.
  insert into private.anonymous_rate_windows as w(bucket,subject,started_at,request_count)
    values(v_bucket,'global',v_now,1)
  on conflict(bucket,subject) do update set
    started_at = case when w.started_at <= v_now - interval '60 seconds' then v_now else w.started_at end,
    request_count = case when w.started_at <= v_now - interval '60 seconds' then 1 else least(w.request_count+1,v_global_limit+1) end
  returning * into v_window;
  if v_window.request_count > v_global_limit then
    return jsonb_build_object('is_allowed',false,'remaining',0,'retry_after',greatest(1,ceil(extract(epoch from v_window.started_at + interval '60 seconds' - v_now))::integer));
  end if;

  insert into private.anonymous_rate_windows as w(bucket,subject,started_at,request_count)
    values(v_bucket,v_subject,v_now,1)
  on conflict(bucket,subject) do update set
    started_at = case when w.started_at <= v_now - interval '60 seconds' then v_now else w.started_at end,
    request_count = case when w.started_at <= v_now - interval '60 seconds' then 1 else least(w.request_count+1,v_limit+1) end
  returning request_count,started_at into v_count,v_started;

  -- Poda acotada, sin trabajos externos: sólo ventanas vencidas hace dos días.
  delete from private.anonymous_rate_windows where (bucket,subject) in (
    select bucket,subject from private.anonymous_rate_windows
    where started_at < v_now - interval '2 days' order by started_at limit 32 for update skip locked
  );
  return jsonb_build_object('is_allowed',v_count <= v_limit,'remaining',greatest(0,v_limit-v_count),
    'retry_after',case when v_count <= v_limit then 0 else greatest(1,ceil(extract(epoch from v_started + interval '60 seconds' - v_now))::integer) end);
end;
$$;
revoke all on function public.consume_anonymous_rate_limit(text,text) from public;
grant execute on function public.consume_anonymous_rate_limit(text,text) to anon,authenticated;
comment on function public.consume_anonymous_rate_limit(text,text) is
  'Sólo comprobantes HMAC del runtime. Cupos fijos; sujeto pseudonimizado, sin permisos sobre datos de usuarios.';
commit;
