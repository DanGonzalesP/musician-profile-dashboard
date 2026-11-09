-- Aceptación de términos/privacidad y declaración de edad, con constancia propia.
--
-- Por qué: el alta sólo marcaba una casilla en el navegador. user_metadata lo
-- puede editar la propia cuenta, así que no prueba qué versión se aceptó.
-- Aquí la base copia la declaración UNA vez, al insertarse auth.users, en una
-- tabla privada que ninguna API puede modificar.
--
-- Política provisional y fail-closed: mientras el titular no defina edad mínima
-- y consentimientos para menores (docs/preparacion-legal-peru.md), sólo se
-- registra la declaración de mayoría de edad ('adult_self_declared'). Habilitar
-- menores exigirá una migración nueva con su propio valor y flujo verificable.
--
-- Segunda capa: una cuenta creada después de esta migración no puede crear
-- perfiles sin constancia válida. Las cuentas previas quedan exentas hasta que
-- exista un flujo de reaceptación; no se bloquea a nadie retroactivamente.
-- Retención de las constancias: pendiente de decisión del titular (sobreviven al
-- borrado de la cuenta como prueba del consentimiento; sólo guardan uuid,
-- versiones y fecha).
begin;

create table private.legal_policy (
  singleton boolean primary key default true check (singleton),
  enforced_from timestamptz not null
);
insert into private.legal_policy(enforced_from) values (now());

create table private.legal_acceptances (
  user_id uuid not null,
  terms_version text not null check (terms_version ~ '^\d{4}-\d{2}-\d{2}$'),
  privacy_version text not null check (privacy_version ~ '^\d{4}-\d{2}-\d{2}$'),
  age_assurance text not null check (age_assurance = 'adult_self_declared'),
  accepted_at timestamptz not null default now(),
  primary key (user_id, terms_version, privacy_version)
);
revoke all on private.legal_policy, private.legal_acceptances from public, anon, authenticated;

-- Nunca rechaza el alta: una declaración ausente o malformada simplemente no
-- deja constancia y la segunda capa impide crear el perfil.
create function private.register_legal_acceptance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_legal jsonb := new.raw_user_meta_data -> 'vibe_legal';
begin
  if jsonb_typeof(v_legal) = 'object'
    and v_legal ->> 'age_assurance' = 'adult_self_declared'
    and coalesce(v_legal ->> 'terms_version', '') ~ '^\d{4}-\d{2}-\d{2}$'
    and coalesce(v_legal ->> 'privacy_version', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    insert into private.legal_acceptances(user_id, terms_version, privacy_version, age_assurance)
      values (new.id, v_legal ->> 'terms_version', v_legal ->> 'privacy_version', 'adult_self_declared')
      on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.register_legal_acceptance() from public, anon, authenticated;
create trigger legal_acceptance_register after insert on auth.users
  for each row execute function private.register_legal_acceptance();

create function private.assert_legal_acceptance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  -- Sin JWT de usuario (migraciones, procesos internos) no aplica.
  if v_actor is null then return new; end if;
  if exists (
    select 1 from auth.users u, private.legal_policy p
    where u.id = v_actor and u.created_at >= p.enforced_from
  ) and not exists (select 1 from private.legal_acceptances a where a.user_id = v_actor) then
    raise exception using errcode = '42501', message = 'aceptacion_legal_requerida';
  end if;
  return new;
end;
$$;
revoke all on function private.assert_legal_acceptance() from public, anon, authenticated;
create trigger profiles_require_legal_acceptance before insert on public.profiles
  for each row execute function private.assert_legal_acceptance();

-- Lectura propia, para la exportación de datos y la configuración de la cuenta.
create function public.read_my_legal_acceptances()
returns table (terms_version text, privacy_version text, age_assurance text, accepted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.terms_version, a.privacy_version, a.age_assurance, a.accepted_at
  from private.legal_acceptances a
  where a.user_id = auth.uid()
  order by a.accepted_at;
$$;
revoke all on function public.read_my_legal_acceptances() from public, anon;
grant execute on function public.read_my_legal_acceptances() to authenticated;

commit;
