-- Retirada común de reservas y archivos históricos atribuidos. Nunca pierde
-- el inventario del marcador ni libera cuota antes de atestiguar cero bytes.
begin;
create or replace function public.retire_media_upload(p_payload text, p_signature text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_owner uuid; v_state text;
begin
  v := private.verify_media_receipt(p_payload,p_signature,'retire');
  perform private.lock_media_account();
  select state, owner_user_id into v_state, v_owner
    from private.media_lifecycle where key = v->>'key' for update;
  if v_state is distinct from 'deleting' or v_owner is distinct from auth.uid()
    or v->>'bytes' is distinct from '0'
    or not coalesce(length(v->>'etag') between 1 and 200,false)
    or not exists(select 1 from public.media_assets where key = v->>'key' and owner_user_id = auth.uid()) then
    raise exception 'retirada_invalida' using errcode = 'PT409';
  end if;
  update private.media_upload_intents set state = 'retired' where key = v->>'key' and owner_user_id = auth.uid();
  update public.media_assets set bytes = 0 where key = v->>'key' and owner_user_id = auth.uid();
  if not found then raise exception 'inventario_ausente' using errcode = 'PT409'; end if;
  return true;
end;
$$;

-- Finalizar no debe consumir una segunda plaza del límite de 120 subidas/h.
-- Contador separado y acotado para HEAD/reintentos, siempre por auth.uid().
create or replace function private.consume_authenticated_rate_limit(p_bucket text)
returns table (is_allowed boolean, retry_after integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_limit integer; v_window_seconds integer := 3600;
  now_at timestamptz := pg_catalog.now(); v_started_at timestamptz; v_count integer;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  case p_bucket
    when 'upload' then v_limit := 120;
    when 'upload-finalize' then v_limit := 360;
    when 'image-generation' then v_limit := 10;
    else raise exception 'unknown rate limit bucket';
  end case;
  insert into public.rate_limit_windows as w (bucket,user_id,started_at,request_count)
  values(p_bucket,v_uid,now_at,1)
  on conflict (bucket,user_id) do update
    set started_at = case when w.started_at <= now_at - pg_catalog.make_interval(secs => v_window_seconds) then now_at else w.started_at end,
    request_count = case when w.started_at <= now_at - pg_catalog.make_interval(secs => v_window_seconds) then 1 else w.request_count + 1 end
  returning w.started_at,w.request_count into v_started_at,v_count;
  if v_count <= v_limit then return query select true,0;
  else return query select false,greatest(1,pg_catalog.ceil(extract(epoch from
    (v_started_at + pg_catalog.make_interval(secs => v_window_seconds) - now_at)))::integer);
  end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
