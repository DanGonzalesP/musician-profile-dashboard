-- La entrega privada consulta esta autorización en CADA GET/HEAD/rango.
-- No configura R2 ni desactiva sus orígenes públicos: ese corte se verifica aparte.
begin;

create function private.media_reference_profiles(p_key text)
returns table(profile_id uuid, is_public boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, true from private.media_references r
    join public.profiles p on r.source_table = 'profiles' and r.source_id = p.id::text
    where r.key = p_key
  union all
  select b.profile_id, b.is_visible is true from private.media_references r
    join public.profile_blocks b on r.source_table = 'profile_blocks' and r.source_id = b.id::text
    where r.key = p_key
  union all
  select d.profile_id, false from private.media_references r
    join public.profile_private d on r.source_table = 'profile_private' and r.source_id = d.profile_id::text
    where r.key = p_key
  union all
  select p.seller_id, p.is_active from private.media_references r
    join public.products p on r.source_table = 'products' and r.source_id = p.id::text
    where r.key = p_key
  union all
  select s.profile_id, s.is_active from private.media_references r
    join public.services s on r.source_table = 'services' and r.source_id = s.id::text
    where r.key = p_key
  union all
  select m.profile_id, true from private.media_references r
    join public.music_feed m on r.source_table = 'music_feed' and r.source_id = m.id::text
    where r.key = p_key;
$$;
revoke all on function private.media_reference_profiles(text) from public, anon, authenticated;

create function public.resolve_media_read(p_key text)
returns table(content_type text, bytes bigint)
language plpgsql stable security definer set search_path = '' as $$
declare a public.media_assets; v_uid uuid := auth.uid(); v_profiles uuid[]; v_public boolean;
begin
  if p_key is null or length(p_key) > 1024 then return; end if;
  select m.* into a from public.media_assets m
    join private.media_lifecycle l on l.key = m.key and l.state = 'active'
    where m.key = p_key;
  if not found or a.bytes is null or a.bytes <= 0 then return; end if;
  if exists(select 1 from private.media_account_state s
    where s.owner_user_id = a.owner_user_id and s.state <> 'active') then return; end if;
  if exists(select 1 from private.media_upload_intents i
    where i.key = p_key and i.state <> 'ready') then return; end if;

  -- Sólo una asociación de reserva validada o un perfil DEL dueño puede
  -- autorizar la difusión. Copiar la URL ajena en otro perfil no concede acceso.
  select coalesce(array_agg(distinct p.id), '{}'::uuid[]), coalesce(bool_or(r.is_public), false)
    into v_profiles, v_public
    from private.media_reference_profiles(p_key) r join public.profiles p on p.id = r.profile_id
    where (a.profile_id is not null and p.id = a.profile_id)
      or (a.profile_id is null and (p.user_id = a.owner_user_id or p.owner_user_id = a.owner_user_id));

  -- La gestión privada se conserva durante suspensión, pero nunca después
  -- de congelar/cerrar la cuenta. El JWT real determina auth.uid().
  if v_uid is not null and exists(select 1 from auth.users u where u.id = v_uid) and (
    a.owner_user_id = v_uid
    or (a.profile_id is not null and public.get_profile_role(a.profile_id) in ('owner','admin'))
    or exists(select 1 from unnest(v_profiles) p(id) where public.get_profile_role(p.id) in ('owner','admin'))
  ) then
    return query select a.content_type, a.bytes; return;
  end if;

  -- Cualquier perfil autorizado suspendido revoca la difusión del mismo
  -- archivo, incluso si otro perfil intenta conservar una referencia pública.
  if not v_public or exists(select 1 from public.profiles p
    where (p.id = any(v_profiles) or p.id = a.profile_id) and p.is_suspended) then return; end if;
  return query select a.content_type, a.bytes;
end;
$$;
revoke all on function public.resolve_media_read(text) from public, anon, authenticated;
grant execute on function public.resolve_media_read(text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
