-- Preguntas que un visitante hace sobre un elemento puntual del perfil
-- público (ej. "¿en qué estudio grabaste este single?") — aparecen en la
-- barra de notificaciones del dueño del perfil (app/perfil/notificaciones),
-- junto a las solicitudes de crédito (ver credit_requests_table.sql).

create table if not exists profile_questions (
  id uuid primary key default gen_random_uuid(),
  -- Perfil dueño del contenido sobre el que se pregunta.
  profile_id uuid not null references profiles(id) on delete cascade,
  asker_user_id uuid not null references auth.users(id) on delete cascade,
  asker_display_name text,
  -- Tipo y etiqueta del bloque señalado (ej. "single" / "Lanzamiento Actual")
  -- — informativo, no hay FK real porque el bloque puede borrarse o moverse.
  block_type text not null,
  block_label text not null,
  message text not null check (char_length(message) between 1 and 500),
  status text not null default 'unread' check (status in ('unread', 'read')),
  created_at timestamptz not null default now()
);

create index if not exists profile_questions_owner_idx on profile_questions (profile_id, created_at desc);

alter table profile_questions enable row level security;

drop policy if exists "profile_questions_select_owner" on profile_questions;
drop policy if exists "profile_questions_insert_asker" on profile_questions;
drop policy if exists "profile_questions_update_owner" on profile_questions;

-- Solo el dueño del perfil ve las preguntas que le hacen — no son públicas
-- ni visibles para quien las escribió (evita exponer nombre real / apuro).
create policy "profile_questions_select_owner"
on profile_questions for select
to authenticated
using (profile_id in (select id from profiles where user_id = auth.uid()));

create policy "profile_questions_insert_asker"
on profile_questions for insert
to authenticated
with check (asker_user_id = auth.uid());

-- Solo el dueño puede marcarlas como leídas.
create policy "profile_questions_update_owner"
on profile_questions for update
to authenticated
using (profile_id in (select id from profiles where user_id = auth.uid()))
with check (profile_id in (select id from profiles where user_id = auth.uid()));
