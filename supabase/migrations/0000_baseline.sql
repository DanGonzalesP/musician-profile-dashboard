-- 0000_baseline.sql
--
-- Esquema de producción de Vibe capturado el 2026-08-16, después de 0009 y
-- antes de 0010. Generado con `supabase db dump --linked`; no contiene datos.
-- Es la base reproducible para el entorno local. NO ejecutar en producción.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."actualizar_total_donaciones"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE artist
  SET total_donations = COALESCE(total_donations, 0) + NEW.amount
  WHERE id = NEW.artist_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."actualizar_total_donaciones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_username_not_reserved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.username is not null
     and exists (select 1 from reserved_usernames r where r.name = new.username) then
    raise exception 'El nombre de usuario "%" está reservado', new.username
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."check_username_not_reserved"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_authenticated_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS TABLE("is_allowed" boolean, "retry_after" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_uid uuid := auth.uid();
  now_at timestamptz := now();
  v_started_at timestamptz;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_bucket !~ '^[a-z0-9_-]{1,64}$' or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.rate_limit_windows as w (bucket, user_id, started_at, request_count)
  values (p_bucket, v_uid, now_at, 1)
  on conflict (bucket, user_id) do update
    set started_at = case
          when w.started_at <= now_at - make_interval(secs => p_window_seconds) then now_at
          else w.started_at
        end,
        request_count = case
          when w.started_at <= now_at - make_interval(secs => p_window_seconds) then 1
          else w.request_count + 1
        end
  returning w.started_at, w.request_count into v_started_at, v_count;

  if v_count <= p_limit then
    return query select true, 0;
  else
    return query select false, greatest(1, ceil(extract(epoch from (v_started_at + make_interval(secs => p_window_seconds) - now_at)))::integer);
  end if;
end;
$_$;


ALTER FUNCTION "public"."consume_authenticated_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."eliminar_mi_cuenta"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Se necesita una sesion activa';
  end if;

  insert into audit_log (actor_user_id, action, target_table, target_id, metadata)
  values (v_uid, 'cuenta_eliminada', 'auth.users', v_uid::text,
          jsonb_build_object('solicitado_en', now()));

  delete from auth.users where id = v_uid;
end;
$$;


ALTER FUNCTION "public"."eliminar_mi_cuenta"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exportar_mis_datos"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null then
    raise exception 'Se necesita una sesion activa';
  end if;

  select jsonb_build_object(
    'exportado_en', now(),
    'perfiles', (
      select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
      from profiles p
      where p.user_id = auth.uid() or p.owner_user_id = auth.uid()
    ),
    'datos_privados', (
      select coalesce(jsonb_agg(to_jsonb(pp)), '[]'::jsonb)
      from profile_private pp
      where pp.profile_id in (
        select id from profiles where user_id = auth.uid() or owner_user_id = auth.uid()
      )
    ),
    'bloques', (
      select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
      from profile_blocks b
      where b.profile_id in (
        select id from profiles where user_id = auth.uid() or owner_user_id = auth.uid()
      )
    ),
    'archivos', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      from media_assets m
      where m.owner_user_id = auth.uid()
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;


ALTER FUNCTION "public"."exportar_mis_datos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_profile_role"("target_profile_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select case
    when exists (
      select 1 from profiles p
      where p.id = target_profile_id
        and (p.user_id = auth.uid() or p.owner_user_id = auth.uid())
    ) then 'owner'
    else (
      select bm.role from band_members bm
      where bm.band_profile_id = target_profile_id
        and bm.member_user_id = auth.uid()
        and bm.status = 'accepted'
      limit 1
    )
  end
$$;


ALTER FUNCTION "public"."get_profile_role"("target_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (user_id, profile_type, display_name)
  values (new.id, 'artist', split_part(coalesce(new.email, 'artista'), '@', 1))
  on conflict do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_profile"("p_profile_id" "uuid", "p_blocks" "jsonb", "p_expected_version" integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_actual integer;
  v_nueva integer;
begin
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'p_blocks debe ser un arreglo JSON';
  end if;

  select content_version into v_actual
  from profiles where id = p_profile_id
  for update;

  if v_actual is null then
    raise exception 'El perfil % no existe', p_profile_id;
  end if;

  if p_expected_version is not null and p_expected_version <> v_actual then
    raise exception 'conflicto_de_version: el perfil fue editado desde otra sesion (version % vs %)',
      p_expected_version, v_actual
      using errcode = 'serialization_failure';
  end if;

  delete from profile_blocks where profile_id = p_profile_id;

  insert into profile_blocks (profile_id, block_type, position_index, content, is_visible)
  select
    p_profile_id,
    bloque ->> 'block_type',
    (bloque ->> 'position_index')::int,
    bloque -> 'content',
    true
  from jsonb_array_elements(p_blocks) as bloque;

  update profile_private
  set draft_content = null,
      updated_at = now()
  where profile_id = p_profile_id;

  v_nueva := v_actual + 1;
  update profiles set content_version = v_nueva where id = p_profile_id;

  return v_nueva;
end;
$$;


ALTER FUNCTION "public"."publish_profile"("p_profile_id" "uuid", "p_blocks" "jsonb", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_username_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if old.username is distinct from new.username and old.username is not null then
    delete from username_history where old_username = new.username;

    insert into username_history (old_username, profile_id)
    values (old.username, new.id)
    on conflict (old_username) do update
      set profile_id = excluded.profile_id, changed_at = now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."record_username_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_auditoria"("p_action" "text", "p_target_table" "text" DEFAULT NULL::"text", "p_target_id" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into audit_log (actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), p_action, p_target_table, p_target_id, p_metadata);
end;
$$;


ALTER FUNCTION "public"."registrar_auditoria"("p_action" "text", "p_target_table" "text", "p_target_id" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_comment_author_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.author_name := (
    select p.display_name from profiles p
    where p.user_id = auth.uid() and p.profile_type = 'artist'
    limit 1
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."set_comment_author_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_question_asker_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.asker_display_name := (
    select p.display_name from profiles p
    where p.user_id = auth.uid() and p.profile_type = 'artist'
    limit 1
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."set_question_asker_name"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."_backup_profiles_20260805" (
    "id" "uuid",
    "user_id" "uuid",
    "display_name" "text",
    "bio" "text",
    "avatar_url" "text",
    "theme_config" "jsonb",
    "created_at" timestamp with time zone,
    "draft_content" "jsonb",
    "legal_settings" "jsonb",
    "unified_profile" boolean,
    "profile_type" "text",
    "owner_user_id" "uuid",
    "musician_category" "text",
    "musician_roles" "text"[],
    "accent_color" "text"
);


ALTER TABLE "public"."_backup_profiles_20260805" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "tagline" "text",
    "bio" "text",
    "username" "text",
    "avatar_url" "text",
    "total_donations" double precision DEFAULT '0'::double precision,
    "has_merch" boolean DEFAULT false,
    "has_services" boolean DEFAULT false,
    "blocks" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."artist" OWNER TO "postgres";


ALTER TABLE "public"."artist" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."artist_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "target_table" "text",
    "target_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


ALTER TABLE "public"."audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."author_certificates" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "song_title" "text" NOT NULL,
    "file_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."author_certificates" OWNER TO "postgres";


ALTER TABLE "public"."author_certificates" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."author_certificates_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."band_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "band_profile_id" "uuid" NOT NULL,
    "member_user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invited_username" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "band_members_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'editor'::"text"]))),
    CONSTRAINT "band_members_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."band_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_user_id" "uuid",
    "reporter_email" "text",
    "reported_profile_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "text",
    "reason" "text" NOT NULL,
    "details" "text" NOT NULL,
    "copyright_sworn_statement" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "moderator_notes" "text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "content_reports_details_check" CHECK ((("char_length"("details") >= 10) AND ("char_length"("details") <= 2000))),
    CONSTRAINT "content_reports_reason_check" CHECK (("reason" = ANY (ARRAY['derechos_de_autor'::"text", 'suplantacion'::"text", 'contenido_sexual'::"text", 'violencia_o_odio'::"text", 'spam_o_estafa'::"text", 'acoso'::"text", 'otro'::"text"]))),
    CONSTRAINT "content_reports_status_check" CHECK (("status" = ANY (ARRAY['pendiente'::"text", 'en_revision'::"text", 'aceptado'::"text", 'rechazado'::"text"]))),
    CONSTRAINT "content_reports_target_type_check" CHECK (("target_type" = ANY (ARRAY['perfil'::"text", 'bloque'::"text", 'pista'::"text", 'publicacion'::"text", 'comentario'::"text", 'producto'::"text", 'servicio'::"text"])))
);


ALTER TABLE "public"."content_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_profile_id" "uuid" NOT NULL,
    "requester_credit_id" "text" NOT NULL,
    "owner_profile_id" "uuid" NOT NULL,
    "song_title" "text" NOT NULL,
    "song_key" "text" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "credit_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."credit_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."donations" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "donor_name" "text",
    "amount" numeric,
    "platform_fee" numeric,
    "artist_net" numeric,
    "artist_id" bigint,
    "message" "text"
);


ALTER TABLE "public"."donations" OWNER TO "postgres";


COMMENT ON TABLE "public"."donations" IS 'Registro de donaciones de oyentes a artistas y comisiones de la plataforma';



ALTER TABLE "public"."donations" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."donations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."feed_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "author_name" "text",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feed_comments_content_check" CHECK ((("char_length"("content") >= 1) AND ("char_length"("content") <= 500)))
);


ALTER TABLE "public"."feed_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feed_post_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "author_name" "text",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feed_post_comments_content_check" CHECK ((("char_length"("content") >= 1) AND ("char_length"("content") <= 500)))
);


ALTER TABLE "public"."feed_post_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."licenses" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "artist_name" "text" NOT NULL,
    "artist_legal_name" "text",
    "artist_dni" "text",
    "organizer_name" "text" NOT NULL,
    "event_date" "date" NOT NULL,
    "event_end_date" "date",
    "songs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."licenses" OWNER TO "postgres";


ALTER TABLE "public"."licenses" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."licenses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."media_assets" (
    "key" "text" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "folder" "text" NOT NULL,
    "content_type" "text",
    "bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "media_assets_folder_check" CHECK (("folder" = ANY (ARRAY['images'::"text", 'audio'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."media_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."merch" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text",
    "description" "text",
    "price" numeric,
    "stock" bigint DEFAULT '0'::bigint,
    "image_url" "text",
    "artist_id" bigint,
    "currency" "text"
);


ALTER TABLE "public"."merch" OWNER TO "postgres";


COMMENT ON TABLE "public"."merch" IS 'Productos físicos y mercancía oficial del artista';



ALTER TABLE "public"."merch" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."merch_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."music_feed" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "audio_url" "text" NOT NULL,
    "cover_image_url" "text",
    "duration_seconds" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."music_feed" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "price" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'PEN'::"text",
    "stock_quantity" integer,
    "images_urls" "text"[] DEFAULT ARRAY[]::"text"[],
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "position_index" integer DEFAULT 0 NOT NULL,
    "category" "text" DEFAULT 'otro'::"text" NOT NULL,
    "product_kind" "text" DEFAULT 'fisico'::"text" NOT NULL,
    "variants" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "purchase_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    CONSTRAINT "products_kind_check" CHECK (("product_kind" = ANY (ARRAY['fisico'::"text", 'digital'::"text"])))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_blocks" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" DEFAULT "gen_random_uuid"(),
    "block_type" "text",
    "position_index" integer,
    "content" "jsonb",
    "is_visible" boolean DEFAULT true
);


ALTER TABLE "public"."profile_blocks" OWNER TO "postgres";


ALTER TABLE "public"."profile_blocks" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."profile_blocks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profile_private" (
    "profile_id" "uuid" NOT NULL,
    "draft_content" "jsonb",
    "legal_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_private" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "asker_user_id" "uuid" NOT NULL,
    "asker_display_name" "text",
    "block_type" "text" NOT NULL,
    "block_label" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'unread'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_questions_message_check" CHECK ((("char_length"("message") >= 1) AND ("char_length"("message") <= 500))),
    CONSTRAINT "profile_questions_status_check" CHECK (("status" = ANY (ARRAY['unread'::"text", 'read'::"text"])))
);


ALTER TABLE "public"."profile_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "display_name" "text",
    "bio" "text",
    "avatar_url" "text",
    "theme_config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "unified_profile" boolean DEFAULT false NOT NULL,
    "profile_type" "text" DEFAULT 'artist'::"text" NOT NULL,
    "owner_user_id" "uuid",
    "musician_category" "text",
    "musician_roles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "accent_color" "text" DEFAULT 'rojo'::"text" NOT NULL,
    "username" "public"."citext" NOT NULL,
    "content_version" integer DEFAULT 0 NOT NULL,
    "is_suspended" boolean DEFAULT false NOT NULL,
    "suspended_reason" "text",
    "suspended_at" timestamp with time zone,
    CONSTRAINT "profiles_accent_color_check" CHECK (("accent_color" = ANY (ARRAY['rojo'::"text", 'morado'::"text", 'azul'::"text", 'verde'::"text"]))),
    CONSTRAINT "profiles_musician_category_check" CHECK ((("musician_category" IS NULL) OR ("musician_category" = ANY (ARRAY['autores'::"text", 'productores'::"text", 'directores'::"text", 'interpretes'::"text", 'tecnicos'::"text"])))),
    CONSTRAINT "profiles_musician_roles_check" CHECK (("musician_roles" <@ ARRAY['autores'::"text", 'compositores'::"text", 'arreglistas'::"text", 'directores'::"text", 'productores'::"text", 'mezclas'::"text", 'masters'::"text", 'musicos'::"text"])),
    CONSTRAINT "profiles_profile_type_check" CHECK (("profile_type" = ANY (ARRAY['artist'::"text", 'band'::"text"]))),
    CONSTRAINT "profiles_username_format" CHECK ((("username" IS NULL) OR ("username" OPERATOR("public".~) '^[a-z0-9_]{3,30}$'::"public"."citext")))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limit_windows" (
    "bucket" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "rate_limit_windows_request_count_check" CHECK (("request_count" >= 0))
);


ALTER TABLE "public"."rate_limit_windows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reserved_usernames" (
    "name" "public"."citext" NOT NULL
);


ALTER TABLE "public"."reserved_usernames" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text",
    "description" "text",
    "price" numeric,
    "delivery_time" "text",
    "image_url" "text",
    "artist_id" bigint,
    "currency" "text",
    "profile_id" "uuid",
    "position_index" integer DEFAULT 0 NOT NULL,
    "category" "text" DEFAULT 'otro'::"text" NOT NULL,
    "price_unit" "text" DEFAULT 'proyecto'::"text" NOT NULL,
    "modality" "text" DEFAULT 'ambas'::"text" NOT NULL,
    "duration" "text",
    "features" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "booking_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "duration_unit" "text",
    CONSTRAINT "services_modality_check" CHECK (("modality" = ANY (ARRAY['presencial'::"text", 'online'::"text", 'ambas'::"text"])))
);


ALTER TABLE "public"."services" OWNER TO "postgres";


COMMENT ON TABLE "public"."services" IS 'Servicios profesionales ofrecidos por los artistas';



ALTER TABLE "public"."services" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."services_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_blocks" (
    "blocker_user_id" "uuid" NOT NULL,
    "blocked_profile_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."username_history" (
    "old_username" "public"."citext" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."username_history" OWNER TO "postgres";


ALTER TABLE ONLY "public"."artist"
    ADD CONSTRAINT "artist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."author_certificates"
    ADD CONSTRAINT "author_certificates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."author_certificates"
    ADD CONSTRAINT "author_certificates_profile_id_file_hash_key" UNIQUE ("profile_id", "file_hash");



ALTER TABLE ONLY "public"."band_members"
    ADD CONSTRAINT "band_members_band_profile_id_member_user_id_key" UNIQUE ("band_profile_id", "member_user_id");



ALTER TABLE ONLY "public"."band_members"
    ADD CONSTRAINT "band_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_reports"
    ADD CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_requests"
    ADD CONSTRAINT "credit_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feed_comments"
    ADD CONSTRAINT "feed_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feed_post_comments"
    ADD CONSTRAINT "feed_post_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."licenses"
    ADD CONSTRAINT "licenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."merch"
    ADD CONSTRAINT "merch_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."music_feed"
    ADD CONSTRAINT "music_feed_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_blocks"
    ADD CONSTRAINT "profile_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_private"
    ADD CONSTRAINT "profile_private_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."profile_questions"
    ADD CONSTRAINT "profile_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."rate_limit_windows"
    ADD CONSTRAINT "rate_limit_windows_pkey" PRIMARY KEY ("bucket", "user_id");



ALTER TABLE ONLY "public"."reserved_usernames"
    ADD CONSTRAINT "reserved_usernames_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_user_id", "blocked_profile_id");



ALTER TABLE ONLY "public"."username_history"
    ADD CONSTRAINT "username_history_pkey" PRIMARY KEY ("old_username");



CREATE INDEX "audit_log_action_idx" ON "public"."audit_log" USING "btree" ("action", "created_at" DESC);



CREATE INDEX "audit_log_actor_idx" ON "public"."audit_log" USING "btree" ("actor_user_id", "created_at" DESC);



CREATE INDEX "author_certificates_profile_id_idx" ON "public"."author_certificates" USING "btree" ("profile_id");



CREATE INDEX "band_members_band_idx" ON "public"."band_members" USING "btree" ("band_profile_id");



CREATE INDEX "band_members_member_idx" ON "public"."band_members" USING "btree" ("member_user_id");



CREATE INDEX "content_reports_profile_idx" ON "public"."content_reports" USING "btree" ("reported_profile_id");



CREATE INDEX "content_reports_status_idx" ON "public"."content_reports" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "credit_requests_owner_idx" ON "public"."credit_requests" USING "btree" ("owner_profile_id");



CREATE INDEX "credit_requests_requester_idx" ON "public"."credit_requests" USING "btree" ("requester_profile_id");



CREATE INDEX "feed_comments_track_idx" ON "public"."feed_comments" USING "btree" ("track_id", "created_at" DESC);



CREATE INDEX "feed_post_comments_post_idx" ON "public"."feed_post_comments" USING "btree" ("post_id", "created_at" DESC);



CREATE INDEX "idx_music_feed_created_at" ON "public"."music_feed" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_music_feed_profile_id_created_at" ON "public"."music_feed" USING "btree" ("profile_id", "created_at" DESC);



CREATE INDEX "licenses_profile_id_idx" ON "public"."licenses" USING "btree" ("profile_id");



CREATE INDEX "media_assets_owner_idx" ON "public"."media_assets" USING "btree" ("owner_user_id", "created_at" DESC);



CREATE INDEX "media_assets_profile_idx" ON "public"."media_assets" USING "btree" ("profile_id");



CREATE INDEX "profile_questions_owner_idx" ON "public"."profile_questions" USING "btree" ("profile_id", "created_at" DESC);



CREATE UNIQUE INDEX "profiles_user_artist_unique" ON "public"."profiles" USING "btree" ("user_id") WHERE (("user_id" IS NOT NULL) AND ("profile_type" = 'artist'::"text"));



CREATE UNIQUE INDEX "profiles_username_unique" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "username_history_profile_idx" ON "public"."username_history" USING "btree" ("profile_id");



CREATE OR REPLACE TRIGGER "tras_insertar_donacion" AFTER INSERT ON "public"."donations" FOR EACH ROW EXECUTE FUNCTION "public"."actualizar_total_donaciones"();



CREATE OR REPLACE TRIGGER "trg_feed_comments_author" BEFORE INSERT OR UPDATE ON "public"."feed_comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_comment_author_name"();



CREATE OR REPLACE TRIGGER "trg_feed_post_comments_author" BEFORE INSERT OR UPDATE ON "public"."feed_post_comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_comment_author_name"();



CREATE OR REPLACE TRIGGER "trg_profile_questions_asker" BEFORE INSERT OR UPDATE ON "public"."profile_questions" FOR EACH ROW EXECUTE FUNCTION "public"."set_question_asker_name"();



CREATE OR REPLACE TRIGGER "trg_record_username_change" AFTER UPDATE OF "username" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."record_username_change"();



CREATE OR REPLACE TRIGGER "trg_username_not_reserved" BEFORE INSERT OR UPDATE OF "username" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."check_username_not_reserved"();



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."author_certificates"
    ADD CONSTRAINT "author_certificates_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."band_members"
    ADD CONSTRAINT "band_members_band_profile_id_fkey" FOREIGN KEY ("band_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."band_members"
    ADD CONSTRAINT "band_members_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_reports"
    ADD CONSTRAINT "content_reports_reported_profile_id_fkey" FOREIGN KEY ("reported_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_reports"
    ADD CONSTRAINT "content_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_requests"
    ADD CONSTRAINT "credit_requests_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_requests"
    ADD CONSTRAINT "credit_requests_requester_profile_id_fkey" FOREIGN KEY ("requester_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id");



ALTER TABLE ONLY "public"."feed_comments"
    ADD CONSTRAINT "feed_comments_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."music_feed"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_comments"
    ADD CONSTRAINT "feed_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_post_comments"
    ADD CONSTRAINT "feed_post_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."licenses"
    ADD CONSTRAINT "licenses_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."merch"
    ADD CONSTRAINT "merch_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id");



ALTER TABLE ONLY "public"."music_feed"
    ADD CONSTRAINT "music_feed_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_private"
    ADD CONSTRAINT "profile_private_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_questions"
    ADD CONSTRAINT "profile_questions_asker_user_id_fkey" FOREIGN KEY ("asker_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_questions"
    ADD CONSTRAINT "profile_questions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_limit_windows"
    ADD CONSTRAINT "rate_limit_windows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocked_profile_id_fkey" FOREIGN KEY ("blocked_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_user_id_fkey" FOREIGN KEY ("blocker_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."username_history"
    ADD CONSTRAINT "username_history_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Permitir lectura publica de artistas" ON "public"."artist" FOR SELECT USING (true);



CREATE POLICY "Permitir lectura publica de merch" ON "public"."merch" FOR SELECT USING (true);



CREATE POLICY "Permitir lectura publica de servicios" ON "public"."services" FOR SELECT USING (true);



ALTER TABLE "public"."_backup_profiles_20260805" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."author_certificates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "author_certificates_insert_owner" ON "public"."author_certificates" FOR INSERT TO "authenticated" WITH CHECK (("profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "author_certificates_select_owner" ON "public"."author_certificates" FOR SELECT TO "authenticated" USING (("profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."band_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "band_members_delete_owner" ON "public"."band_members" FOR DELETE TO "authenticated" USING ((("member_user_id" = "auth"."uid"()) OR ("band_profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "band_members_insert_owner" ON "public"."band_members" FOR INSERT TO "authenticated" WITH CHECK (("band_profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."owner_user_id" = "auth"."uid"()))));



CREATE POLICY "band_members_select_involved" ON "public"."band_members" FOR SELECT TO "authenticated" USING ((("member_user_id" = "auth"."uid"()) OR ("band_profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "band_members_update_involved" ON "public"."band_members" FOR UPDATE TO "authenticated" USING ((("member_user_id" = "auth"."uid"()) OR ("band_profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."owner_user_id" = "auth"."uid"()))))) WITH CHECK ((("member_user_id" = "auth"."uid"()) OR ("band_profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."owner_user_id" = "auth"."uid"())))));



ALTER TABLE "public"."content_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "content_reports_insert_any" ON "public"."content_reports" FOR INSERT TO "authenticated", "anon" WITH CHECK (((("reason" <> 'derechos_de_autor'::"text") OR ("copyright_sworn_statement" = true)) AND (("reporter_user_id" IS NULL) OR ("reporter_user_id" = "auth"."uid"()))));



CREATE POLICY "content_reports_select_own" ON "public"."content_reports" FOR SELECT TO "authenticated" USING (("reporter_user_id" = "auth"."uid"()));



ALTER TABLE "public"."credit_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_requests_insert_requester" ON "public"."credit_requests" FOR INSERT TO "authenticated" WITH CHECK (("requester_profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "credit_requests_select_involved" ON "public"."credit_requests" FOR SELECT TO "authenticated" USING ((("owner_profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))) OR ("requester_profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"())))));



CREATE POLICY "credit_requests_update_owner" ON "public"."credit_requests" FOR UPDATE TO "authenticated" USING (("owner_profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"())))) WITH CHECK (("owner_profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."donations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feed_comments_delete_own" ON "public"."feed_comments" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "feed_comments_insert_own" ON "public"."feed_comments" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "feed_comments_select_public" ON "public"."feed_comments" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."feed_post_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feed_post_comments_delete_own" ON "public"."feed_post_comments" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "feed_post_comments_insert_own" ON "public"."feed_post_comments" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "feed_post_comments_select_public" ON "public"."feed_post_comments" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."licenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "licenses_insert_owner" ON "public"."licenses" FOR INSERT TO "authenticated" WITH CHECK (("profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "licenses_select_owner" ON "public"."licenses" FOR SELECT TO "authenticated" USING (("profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."media_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "media_assets_delete_own" ON "public"."media_assets" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "media_assets_insert_own" ON "public"."media_assets" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "media_assets_select_own" ON "public"."media_assets" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



ALTER TABLE "public"."merch" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."music_feed" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "music_feed_delete_by_role" ON "public"."music_feed" FOR DELETE TO "authenticated" USING (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "music_feed_insert_by_role" ON "public"."music_feed" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "music_feed_select_public" ON "public"."music_feed" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "music_feed_update_by_role" ON "public"."music_feed" FOR UPDATE TO "authenticated" USING (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_delete_by_role" ON "public"."products" FOR DELETE TO "authenticated" USING (("public"."get_profile_role"("seller_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "products_insert_by_role" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_profile_role"("seller_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "products_select_public" ON "public"."products" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "products_update_by_role" ON "public"."products" FOR UPDATE TO "authenticated" USING (("public"."get_profile_role"("seller_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK (("public"."get_profile_role"("seller_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



ALTER TABLE "public"."profile_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_blocks_delete_by_role" ON "public"."profile_blocks" FOR DELETE TO "authenticated" USING (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "profile_blocks_insert_by_role" ON "public"."profile_blocks" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (("public"."get_profile_role"("profile_id") = 'editor'::"text") AND ("block_type" = 'hero'::"text"))));



CREATE POLICY "profile_blocks_select_public" ON "public"."profile_blocks" FOR SELECT TO "authenticated", "anon" USING ((NOT (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "profile_blocks"."profile_id") AND ("p"."is_suspended" = true))))));



CREATE POLICY "profile_blocks_update_by_role" ON "public"."profile_blocks" FOR UPDATE TO "authenticated" USING ((("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (("public"."get_profile_role"("profile_id") = 'editor'::"text") AND ("block_type" = 'hero'::"text")))) WITH CHECK ((("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (("public"."get_profile_role"("profile_id") = 'editor'::"text") AND ("block_type" = 'hero'::"text"))));



ALTER TABLE "public"."profile_private" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_private_delete_own" ON "public"."profile_private" FOR DELETE TO "authenticated" USING (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "profile_private_insert_own" ON "public"."profile_private" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "profile_private_select_own" ON "public"."profile_private" FOR SELECT TO "authenticated" USING (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "profile_private_update_own" ON "public"."profile_private" FOR UPDATE TO "authenticated" USING (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



ALTER TABLE "public"."profile_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_questions_insert_asker" ON "public"."profile_questions" FOR INSERT TO "authenticated" WITH CHECK (("asker_user_id" = "auth"."uid"()));



CREATE POLICY "profile_questions_select_owner" ON "public"."profile_questions" FOR SELECT TO "authenticated" USING (("profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "profile_questions_update_owner" ON "public"."profile_questions" FOR UPDATE TO "authenticated" USING (("profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"())))) WITH CHECK (("profile_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete_band_owner" ON "public"."profiles" FOR DELETE TO "authenticated" USING ((("profile_type" = 'band'::"text") AND ("owner_user_id" = "auth"."uid"())));



CREATE POLICY "profiles_delete_owner" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "profiles_insert_band_owner" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("profile_type" = 'band'::"text") AND ("owner_user_id" = "auth"."uid"())));



CREATE POLICY "profiles_insert_owner" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "profiles_select_public" ON "public"."profiles" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "profiles_update_band_managers" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("profile_type" = 'band'::"text") AND (("owner_user_id" = "auth"."uid"()) OR ("id" IN ( SELECT "band_members"."band_profile_id"
   FROM "public"."band_members"
  WHERE (("band_members"."member_user_id" = "auth"."uid"()) AND ("band_members"."status" = 'accepted'::"text") AND ("band_members"."role" = 'admin'::"text"))))))) WITH CHECK ((("profile_type" = 'band'::"text") AND (("owner_user_id" = "auth"."uid"()) OR ("id" IN ( SELECT "band_members"."band_profile_id"
   FROM "public"."band_members"
  WHERE (("band_members"."member_user_id" = "auth"."uid"()) AND ("band_members"."status" = 'accepted'::"text") AND ("band_members"."role" = 'admin'::"text")))))));



CREATE POLICY "profiles_update_owner" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."rate_limit_windows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reserved_usernames" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services_delete_by_role" ON "public"."services" FOR DELETE TO "authenticated" USING (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "services_insert_by_role" ON "public"."services" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "services_update_by_role" ON "public"."services" FOR UPDATE TO "authenticated" USING (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK (("public"."get_profile_role"("profile_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



ALTER TABLE "public"."user_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_blocks_delete_own" ON "public"."user_blocks" FOR DELETE TO "authenticated" USING (("blocker_user_id" = "auth"."uid"()));



CREATE POLICY "user_blocks_insert_own" ON "public"."user_blocks" FOR INSERT TO "authenticated" WITH CHECK (("blocker_user_id" = "auth"."uid"()));



CREATE POLICY "user_blocks_select_own" ON "public"."user_blocks" FOR SELECT TO "authenticated" USING (("blocker_user_id" = "auth"."uid"()));



ALTER TABLE "public"."username_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "username_history_select_public" ON "public"."username_history" FOR SELECT TO "authenticated", "anon" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"(character) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "anon";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"("inet") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "anon";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."actualizar_total_donaciones"() TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_total_donaciones"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_total_donaciones"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_username_not_reserved"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_username_not_reserved"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_username_not_reserved"() TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_authenticated_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_authenticated_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_authenticated_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."eliminar_mi_cuenta"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."eliminar_mi_cuenta"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."eliminar_mi_cuenta"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."exportar_mis_datos"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."exportar_mis_datos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."exportar_mis_datos"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_profile_role"("target_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_profile_role"("target_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_profile_role"("target_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_profile"("p_profile_id" "uuid", "p_blocks" "jsonb", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_profile"("p_profile_id" "uuid", "p_blocks" "jsonb", "p_expected_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_profile"("p_profile_id" "uuid", "p_blocks" "jsonb", "p_expected_version" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_username_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_username_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_auditoria"("p_action" "text", "p_target_table" "text", "p_target_id" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_auditoria"("p_action" "text", "p_target_table" "text", "p_target_id" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_auditoria"("p_action" "text", "p_target_table" "text", "p_target_id" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_comment_author_name"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_comment_author_name"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_question_asker_name"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_question_asker_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "service_role";












GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "service_role";









GRANT ALL ON TABLE "public"."_backup_profiles_20260805" TO "anon";
GRANT ALL ON TABLE "public"."_backup_profiles_20260805" TO "authenticated";
GRANT ALL ON TABLE "public"."_backup_profiles_20260805" TO "service_role";



GRANT ALL ON TABLE "public"."artist" TO "anon";
GRANT ALL ON TABLE "public"."artist" TO "authenticated";
GRANT ALL ON TABLE "public"."artist" TO "service_role";



GRANT ALL ON SEQUENCE "public"."artist_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."artist_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."artist_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."author_certificates" TO "anon";
GRANT ALL ON TABLE "public"."author_certificates" TO "authenticated";
GRANT ALL ON TABLE "public"."author_certificates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."author_certificates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."author_certificates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."author_certificates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."band_members" TO "anon";
GRANT ALL ON TABLE "public"."band_members" TO "authenticated";
GRANT ALL ON TABLE "public"."band_members" TO "service_role";



GRANT ALL ON TABLE "public"."content_reports" TO "anon";
GRANT ALL ON TABLE "public"."content_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."content_reports" TO "service_role";



GRANT ALL ON TABLE "public"."credit_requests" TO "anon";
GRANT ALL ON TABLE "public"."credit_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_requests" TO "service_role";



GRANT ALL ON TABLE "public"."donations" TO "anon";
GRANT ALL ON TABLE "public"."donations" TO "authenticated";
GRANT ALL ON TABLE "public"."donations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."donations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."donations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."donations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."feed_comments" TO "anon";
GRANT ALL ON TABLE "public"."feed_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_comments" TO "service_role";



GRANT ALL ON TABLE "public"."feed_post_comments" TO "anon";
GRANT ALL ON TABLE "public"."feed_post_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_post_comments" TO "service_role";



GRANT ALL ON TABLE "public"."licenses" TO "anon";
GRANT ALL ON TABLE "public"."licenses" TO "authenticated";
GRANT ALL ON TABLE "public"."licenses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."licenses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."licenses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."licenses_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."media_assets" TO "anon";
GRANT ALL ON TABLE "public"."media_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."media_assets" TO "service_role";



GRANT ALL ON TABLE "public"."merch" TO "anon";
GRANT ALL ON TABLE "public"."merch" TO "authenticated";
GRANT ALL ON TABLE "public"."merch" TO "service_role";



GRANT ALL ON SEQUENCE "public"."merch_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."merch_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."merch_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."music_feed" TO "anon";
GRANT ALL ON TABLE "public"."music_feed" TO "authenticated";
GRANT ALL ON TABLE "public"."music_feed" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profile_blocks" TO "anon";
GRANT ALL ON TABLE "public"."profile_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_blocks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."profile_blocks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."profile_blocks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."profile_blocks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profile_private" TO "anon";
GRANT ALL ON TABLE "public"."profile_private" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_private" TO "service_role";



GRANT ALL ON TABLE "public"."profile_questions" TO "anon";
GRANT ALL ON TABLE "public"."profile_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_questions" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("display_name") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("bio") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("created_at") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("unified_profile") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("profile_type") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("musician_category") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("musician_roles") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("accent_color") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("username") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("is_suspended") ON TABLE "public"."profiles" TO "anon";



GRANT ALL ON TABLE "public"."rate_limit_windows" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_windows" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_windows" TO "service_role";



GRANT ALL ON TABLE "public"."reserved_usernames" TO "anon";
GRANT ALL ON TABLE "public"."reserved_usernames" TO "authenticated";
GRANT ALL ON TABLE "public"."reserved_usernames" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON SEQUENCE "public"."services_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."services_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."services_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_blocks" TO "anon";
GRANT ALL ON TABLE "public"."user_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."username_history" TO "anon";
GRANT ALL ON TABLE "public"."username_history" TO "authenticated";
GRANT ALL ON TABLE "public"."username_history" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
