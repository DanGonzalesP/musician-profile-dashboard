-- Comentarios de las publicaciones del feed (fotos/videos del bloque
-- "publicaciones" de cada perfil) — hermana de `feed_comments` (canciones),
-- pero en tabla aparte porque una publicación NO es una fila propia: su id
-- es compuesto ("<profile_blocks.id>:<item.id>", ver lib/feed/publicPosts.ts)
-- y no hay una tabla de publicaciones contra la cual poner una FK real.
-- Correr una sola vez: node no hace falta, se pega en el SQL Editor de Supabase.

create table if not exists feed_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists feed_post_comments_post_idx on feed_post_comments (post_id, created_at desc);

alter table feed_post_comments enable row level security;

drop policy if exists "feed_post_comments_select_public" on feed_post_comments;
create policy "feed_post_comments_select_public"
on feed_post_comments for select
to anon, authenticated
using (true);

drop policy if exists "feed_post_comments_insert_own" on feed_post_comments;
create policy "feed_post_comments_insert_own"
on feed_post_comments for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "feed_post_comments_delete_own" on feed_post_comments;
create policy "feed_post_comments_delete_own"
on feed_post_comments for delete
to authenticated
using (user_id = auth.uid());
