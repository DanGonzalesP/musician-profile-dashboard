-- Sólo lectura: mismo universo contable que reserve_media_upload (0031).
-- Reservas vencidas cuentan hasta su retirada verificada; no liberar por reloj.
begin;
create function public.read_own_storage_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_result jsonb;
begin
  if v_owner is null then raise exception 'autenticacion_requerida' using errcode = '42501'; end if;
  with intents as (
    select coalesce(sum(i.bytes),0) as used,
      coalesce(sum(i.bytes) filter(where i.state = 'pending'),0) as pending
    from private.media_upload_intents i
    where i.owner_user_id = v_owner and i.state <> 'retired'
  ), historical as (
    select coalesce(sum(a.bytes),0) as used,
      count(*) filter(where a.bytes is null) as unknown
    from public.media_assets a
    where a.owner_user_id = v_owner
      and not exists(select 1 from private.media_upload_intents i where i.key = a.key)
  )
  select jsonb_build_object('usedBytes',i.used+h.used,'pendingBytes',i.pending,
    'unknownFiles',h.unknown) into v_result from intents i cross join historical h;
  return v_result;
end;
$$;
revoke all on function public.read_own_storage_summary() from public, anon;
grant execute on function public.read_own_storage_summary() to authenticated;
comment on function public.read_own_storage_summary() is
  'Resumen agregado propio, sin keys ni identidades ajenas. Incluye reservas no retiradas y legado sin doble conteo.';
commit;
