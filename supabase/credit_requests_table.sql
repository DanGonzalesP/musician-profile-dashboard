-- Tabla de solicitudes de crédito del Bloque 4 ("Créditos y Colaboraciones").
-- Cuando un artista etiqueta a otro como colaborador en una canción de la
-- plataforma (crédito "interno"), se crea una fila "pending" acá. El dueño
-- de la canción la ve en su panel de notificaciones y decide aceptar o
-- rechazar — el crédito solo aparece en el perfil público del solicitante
-- si queda "accepted". Los créditos "externos" (YouTube) no pasan por esta
-- tabla: se publican de inmediato.

create table if not exists credit_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references profiles(id) on delete cascade,
  -- id del CreditItem dentro del content JSONB del bloque "credits" del
  -- solicitante — permite que el inspector reconcilie el estado guardado.
  requester_credit_id text not null,
  owner_profile_id uuid not null references profiles(id) on delete cascade,
  song_title text not null,
  -- referencia informativa a la canción de origen ("<block_id>:<album_id>:<track_index>").
  song_key text not null,
  role text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists credit_requests_owner_idx on credit_requests (owner_profile_id);
create index if not exists credit_requests_requester_idx on credit_requests (requester_profile_id);

alter table credit_requests enable row level security;

drop policy if exists "credit_requests_select_involved" on credit_requests;
drop policy if exists "credit_requests_insert_requester" on credit_requests;
drop policy if exists "credit_requests_update_owner" on credit_requests;

-- Solo el solicitante y el dueño de la canción pueden ver una solicitud —
-- a diferencia de profiles/profile_blocks, esto NO es público.
create policy "credit_requests_select_involved"
on credit_requests for select
to authenticated
using (
  owner_profile_id in (select id from profiles where user_id = auth.uid())
  or requester_profile_id in (select id from profiles where user_id = auth.uid())
);

create policy "credit_requests_insert_requester"
on credit_requests for insert
to authenticated
with check (requester_profile_id in (select id from profiles where user_id = auth.uid()));

-- Solo el dueño de la canción puede aceptar/rechazar — el solicitante no
-- puede tocar el status de su propia solicitud.
create policy "credit_requests_update_owner"
on credit_requests for update
to authenticated
using (owner_profile_id in (select id from profiles where user_id = auth.uid()))
with check (owner_profile_id in (select id from profiles where user_id = auth.uid()));
