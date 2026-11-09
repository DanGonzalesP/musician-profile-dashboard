-- Rechazar keys históricas que no pueden inventariarse sin ambigüedad.
create or replace function public.claim_media_deletion(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_row private.media_lifecycle;
begin
  if auth.uid() is null then return false; end if;
  -- Una key histórica fuera de la gramática del extractor exige revisión.
  if p_key is null or p_key !~ '^(images|audio|video)/[A-Za-z0-9_.~-]+(/[A-Za-z0-9_.~-]+)*$'
     or p_key ~ '(^|/)\.{1,2}(/|$)' then return false; end if;
  select * into v_row from private.media_lifecycle where key = p_key for update;
  if not found or v_row.owner_user_id is distinct from auth.uid() then return false; end if;
  if v_row.state = 'deleting' then return true; end if;
  if exists(select 1 from private.media_references where key = p_key) then return false; end if;
  update private.media_lifecycle set state = 'deleting', deletion_requested_at = clock_timestamp() where key = p_key;
  return true;
end;
$$;
notify pgrst, 'reload schema';

