-- ═══════════════════════════════════════════════════════════════════════════
-- 0004_lock_remaining_rls.sql — Cierra las tablas que nunca tuvieron políticas
-- versionadas, y quita el "buzón compartido" de las tablas legales.
--
-- CONTEXTO
-- products y services venían del andamiaje inicial con políticas
-- "*_all_anon" (ALL, using true, para anon) y se cerraron a mano en su
-- momento. Pero music_feed, orders, order_items y donations NO aparecen en
-- ningún archivo del repo: si nacieron del mismo andamiaje, siguen abiertas.
-- Esta migración las cierra de forma idempotente, exista lo que exista.
--
-- Es segura de correr aunque alguna tabla no exista: cada bloque comprueba
-- primero.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) music_feed — las pistas del feed principal ────────────────────────
-- lib/musicFeed.ts:deleteTrackFromFeed borra por id SIN comprobar dueño: la
-- única defensa posible es RLS. Sin ella, cualquiera borra la música de
-- cualquiera.
do $$
declare
  pol record;
begin
  if to_regclass('public.music_feed') is null then
    raise notice 'music_feed no existe, se omite';
    return;
  end if;

  execute 'alter table music_feed enable row level security';

  -- Fuera cualquier política vieja permisiva, sin importar su nombre.
  for pol in select policyname from pg_policies where schemaname='public' and tablename='music_feed' loop
    execute format('drop policy if exists %I on music_feed', pol.policyname);
  end loop;

  -- Lectura pública: el feed lo ve cualquiera, con o sin sesión.
  execute $p$
    create policy "music_feed_select_public" on music_feed for select
    to anon, authenticated using (true)
  $p$;

  -- Escritura: solo quien manda sobre el perfil dueño de la pista.
  execute $p$
    create policy "music_feed_insert_by_role" on music_feed for insert
    to authenticated with check (get_profile_role(profile_id) in ('owner', 'admin'))
  $p$;
  execute $p$
    create policy "music_feed_update_by_role" on music_feed for update
    to authenticated using (get_profile_role(profile_id) in ('owner', 'admin'))
    with check (get_profile_role(profile_id) in ('owner', 'admin'))
  $p$;
  execute $p$
    create policy "music_feed_delete_by_role" on music_feed for delete
    to authenticated using (get_profile_role(profile_id) in ('owner', 'admin'))
  $p$;
end $$;


-- ─── 2) orders / order_items — datos de compra ────────────────────────────
-- No son públicos bajo ninguna circunstancia. El vendedor ve lo suyo; el
-- comprador, lo suyo.
do $$
declare pol record;
begin
  if to_regclass('public.orders') is not null then
    execute 'alter table orders enable row level security';
    for pol in select policyname from pg_policies where schemaname='public' and tablename='orders' loop
      execute format('drop policy if exists %I on orders', pol.policyname);
    end loop;

    -- Sin políticas de lectura pública a propósito. Si tu tabla orders tiene
    -- una columna de comprador (buyer_user_id / user_id), descomenta la
    -- política que corresponda a tu esquema — el diagnóstico
    -- (_diagnostico_rls.sql, consulta 3) te dice cuál es.
    --
    -- execute $p$
    --   create policy "orders_select_buyer" on orders for select
    --   to authenticated using (buyer_user_id = auth.uid())
    -- $p$;
    raise notice 'orders: RLS activado y politicas viejas eliminadas. Queda CERRADA hasta que definas la politica de comprador/vendedor segun tu esquema.';
  end if;

  if to_regclass('public.order_items') is not null then
    execute 'alter table order_items enable row level security';
    for pol in select policyname from pg_policies where schemaname='public' and tablename='order_items' loop
      execute format('drop policy if exists %I on order_items', pol.policyname);
    end loop;

    -- El vendedor ve los ítems de sus propios productos. Es exactamente lo
    -- que consulta app/perfil/pedidos.
    execute $p$
      create policy "order_items_select_seller" on order_items for select
      to authenticated using (
        product_id in (
          select id from products
          where get_profile_role(seller_id) in ('owner', 'admin')
        )
      )
    $p$;
  end if;
end $$;


-- ─── 3) donations ─────────────────────────────────────────────────────────
do $$
declare pol record;
begin
  if to_regclass('public.donations') is null then
    raise notice 'donations no existe, se omite';
    return;
  end if;

  execute 'alter table donations enable row level security';
  for pol in select policyname from pg_policies where schemaname='public' and tablename='donations' loop
    execute format('drop policy if exists %I on donations', pol.policyname);
  end loop;

  -- Sin política de lectura a propósito: la tabla queda CERRADA (deny-by-
  -- default). donations es de un esquema viejo que referencia al artista por
  -- artist_id (bigint), no por profile_id, así que no encaja con
  -- get_profile_role(profile_id). El código actual ya no lee esta tabla desde
  -- el cliente; solo el service role (backoffice) la consulta. Si más adelante
  -- se reactivan las donaciones, definir aquí la política según el esquema real
  -- (p. ej. mapear artist_id → perfil) antes de volver a exponerla.
  raise notice 'donations: RLS activado y politicas viejas eliminadas. Queda CERRADA (sin politica de lectura).';
end $$;


-- ─── 4) licenses / author_certificates: quitar el perfil semilla ──────────
-- Las políticas permitían a CUALQUIER autenticado insertar y leer filas con
-- profile_id = '00000000-...'. Eso convertía a ese UUID en un buzón
-- compartido de datos legales entre cuentas. El código ya no lo usa (se
-- eliminó PROFILE_ID), así que las políticas tampoco deben permitirlo.

do $$
begin
  if to_regclass('public.licenses') is not null then
    drop policy if exists "licenses_insert_owner" on licenses;
    create policy "licenses_insert_owner"
    on licenses for insert
    to authenticated
    with check (profile_id in (select id from profiles where user_id = auth.uid()));

    drop policy if exists "licenses_select_owner" on licenses;
    create policy "licenses_select_owner"
    on licenses for select
    to authenticated
    using (profile_id in (select id from profiles where user_id = auth.uid()));
  end if;

  if to_regclass('public.author_certificates') is not null then
    drop policy if exists "author_certificates_insert_owner" on author_certificates;
    create policy "author_certificates_insert_owner"
    on author_certificates for insert
    to authenticated
    with check (profile_id in (select id from profiles where user_id = auth.uid()));

    drop policy if exists "author_certificates_select_owner" on author_certificates;
    create policy "author_certificates_select_owner"
    on author_certificates for select
    to authenticated
    using (profile_id in (select id from profiles where user_id = auth.uid()));
  end if;
end $$;


-- ─── 5) Anti-suplantación en comentarios y preguntas ──────────────────────
-- author_name / asker_display_name los mandaba el cliente y RLS solo
-- validaba user_id = auth.uid(): nada impedía firmar un comentario con el
-- nombre de otro artista. Ahora el nombre lo escribe un trigger a partir del
-- perfil real de quien comenta, y se ignora lo que mande el cliente.

create or replace function public.set_comment_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author_name := (
    select p.display_name from profiles p
    where p.user_id = auth.uid() and p.profile_type = 'artist'
    limit 1
  );
  return new;
end;
$$;

revoke execute on function public.set_comment_author_name() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.feed_comments') is not null then
    drop trigger if exists trg_feed_comments_author on feed_comments;
    create trigger trg_feed_comments_author
      before insert or update on feed_comments
      for each row execute function public.set_comment_author_name();
  end if;

  if to_regclass('public.feed_post_comments') is not null then
    drop trigger if exists trg_feed_post_comments_author on feed_post_comments;
    create trigger trg_feed_post_comments_author
      before insert or update on feed_post_comments
      for each row execute function public.set_comment_author_name();
  end if;
end $$;

-- Mismo criterio para el nombre de quien hace una pregunta.
create or replace function public.set_question_asker_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.asker_display_name := (
    select p.display_name from profiles p
    where p.user_id = auth.uid() and p.profile_type = 'artist'
    limit 1
  );
  return new;
end;
$$;

revoke execute on function public.set_question_asker_name() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.profile_questions') is not null then
    drop trigger if exists trg_profile_questions_asker on profile_questions;
    create trigger trg_profile_questions_asker
      before insert or update on profile_questions
      for each row execute function public.set_question_asker_name();
  end if;
end $$;


-- ─── 6) Verificación final ────────────────────────────────────────────────
-- No debería quedar NINGUNA fila con qual='true' fuera de los SELECT
-- públicos que sí queremos (profiles, profile_blocks, products, services,
-- music_feed y los comentarios).
select tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or with_check = 'true')
order by tablename, cmd;
