# Plan de ejecución — Blindaje y profesionalización de Vibe

Basado en [AUDITORIA.md](AUDITORIA.md). Este documento es el plan operativo: qué se toca,
en qué orden, qué corres tú en Supabase y cómo verificamos cada paso antes de avanzar.

## Convenciones de trabajo

- **Rama por fase**, no todo en `main`. Empezamos con `git checkout -b fase-0-seguridad`.
- Cada archivo `.sql` nuevo es **idempotente** (se puede correr dos veces) y va numerado en
  `supabase/migrations/`. Al final de cada fase te doy la lista exacta de archivos a pegar en el
  SQL Editor, en orden.
- **Yo hago todo el código; tú corres el SQL** y me confirmas el resultado del diagnóstico.
  No puedo tocar tu base de datos directamente.
- Después de cada bloque grande verifico con el navegador (dev server) que no rompí nada visible.
- No toco la UI ni el diseño salvo donde el plan lo diga explícitamente.

---

## FASE 0 — Seguridad crítica (antes de un solo usuario real)

Objetivo: cerrar los 6 agujeros explotables. Ninguno cambia la apariencia de la app.

### 0.1 — Diagnóstico de RLS (primero, lo corres tú)

Antes de escribir nada necesito saber el estado real de las tablas sin políticas versionadas.
Te voy a dar un `supabase/_diagnostico_rls.sql` con:

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname='public' order by tablename, cmd;
-- y las columnas reales de profiles, music_feed, orders, order_items, donations
```

Me pegas el resultado. Con eso confirmo qué tablas tienen `qual = true` abiertas y ajusto
los archivos de la §0.6 a tu esquema real (no a lo que supongo).

### 0.2 — `cleanup-orphaned-files`: auth + validación (código)

- `app/api/cleanup-orphaned-files/route.ts`: llamar de verdad a `getAuthenticatedUser`;
  exigir además que el usuario sea admin (una allowlist por `user.id` en variable de entorno
  `ADMIN_USER_IDS`, hasta que exista rol real). Validar `folder` contra la whitelist.
- Borrar la página `app/cleanup/page.tsx` del bundle público (o moverla detrás del check de admin).
- **Verificación:** `curl` sin token → 401; con token de no-admin → 403.

### 0.3 — `image-proxy`: origin check + límites (código)

- `app/api/image-proxy/route.ts`: cambiar `startsWith` por comparación de `origin` con `URL`.
- Añadir timeout (`AbortController`, 5 s), límite de tamaño de respuesta, y forzar que el
  `Content-Type` upstream empiece por `image/`.
- **Verificación:** `/api/image-proxy?url=https://pub-...r2.dev.evil.com/x` → 400.

### 0.4 — `safeHref()` central: matar el XSS de enlaces (código)

- Nuevo `lib/safe-url.ts` con `safeHref(raw): string` que solo deja pasar
  `https:`, `mailto:`, `tel:` (y `http:` opcional para dev); cualquier otra cosa → `"#"` o `""`.
- Aplicarlo al **renderizar** en: `hero-block.tsx` (contacto + socials), `merch-block.tsx`,
  `service-block.tsx`, `credits-block.tsx`, `publicaciones-block.tsx`, `legado-block.tsx`,
  `profile/hero-banner.tsx`, `app/[username]/tienda/page.tsx`.
- Aplicarlo también al **guardar** en el inspector (`block-inspector.tsx`, `contact-channel.ts`)
  para que ni siquiera se persista basura.
- **Verificación:** guardar `javascript:alert(1)` en contacto → el `href` renderizado es inerte.

### 0.5 — `media_assets`: autorización real de borrado + base para cuotas (SQL + código)

- Nuevo `supabase/migrations/0002_media_assets.sql`: tabla
  `media_assets (key text pk, owner_profile_id uuid, folder text, content_type text, bytes bigint, created_at)`,
  con RLS: insert/select/delete solo del dueño.
- `app/api/upload-url/route.ts`: al firmar una subida, insertar la fila en `media_assets`
  ligada al perfil del usuario. Validar que el `contentType` **siempre** venga y sea multimedia
  (hoy es opcional).
- `app/api/delete-file/route.ts`: reescribir para autorizar por `owner_profile_id = perfil del
  usuario`, en vez del `JSON.stringify` de toda la base (que se rompe pasadas 1000 filas).
- **Verificación:** usuario A no puede borrar un `key` de usuario B (403); el borrado propio sigue
  funcionando desde `handlePublish`.

> Nota: esto cambia el flujo de subida. Lo pruebo end-to-end con el editor antes de cerrar la fase.

### 0.6 — Cerrar RLS: `profiles`, vista pública, y tablas sin políticas (SQL)

- `supabase/migrations/0003_public_profiles_view.sql`:
  - Vista `public_profiles` con **solo** columnas públicas (id, display_name, accent_color,
    profile_type, unified_profile, bio, avatar…). Nunca `legal_settings`, `draft_content`, `user_id`.
  - Cambiar `profiles_select_public` de `using (true)` a lectura restringida
    (`user_id = auth.uid() or owner_user_id = auth.uid()`), y **apuntar todo el código de lectura
    pública a `public_profiles`** en vez de `profiles`.
  - Esto toca `app/[username]/page.tsx`, `lib/musicFeed.ts`, `lib/feed/*`, `lib/catalog.ts`
    joins, etc. Es el cambio de mayor superficie de la fase; lo hago con cuidado y verifico el feed
    y un perfil público completos.
- `supabase/migrations/0004_lock_remaining_rls.sql`: según lo que muestre §0.1, cerrar
  `music_feed` (insert/delete solo dueño), `orders`/`order_items`/`donations` (lectura y escritura
  solo del involucrado). SELECT público solo donde de verdad haga falta.
- `legal_settings`: moverlo a tabla propia `artist_legal (profile_id pk, data jsonb)` con RLS
  estricta solo-dueño. Actualizar `lib/legal-settings.ts` y `app/perfil/legal`.
- **Verificación (la que más importa):** con la anon key, `GET /rest/v1/profiles?select=*`
  ya no devuelve DNIs ni borradores; `GET /rest/v1/artist_legal` devuelve 0 filas para un anónimo.

**Al terminar la Fase 0 corres, en este orden:** `0002`, `0003`, `0004`.
Fin de fase: PR `fase-0-seguridad`, revisión, merge.

---

## FASE 1 — Integridad de datos

Objetivo: que el dato no se corrompa ni se pierda, y que la identidad sea sólida.

### 1.1 — Publicación transaccional (SQL + código)

- `supabase/migrations/0005_publish_profile_rpc.sql`: función `publish_profile(p_profile_id uuid,
  p_blocks jsonb)` con `security invoker`, que hace `delete` + `insert` de `profile_blocks` y
  limpia `draft_content` **dentro de una transacción**. Respeta RLS.
- `components/profile-editor.tsx` `handlePublish`: reemplazar el delete+insert manual por una
  llamada al RPC. Igual para `publishCatalog` en `lib/catalog.ts` (RPC gemelo o misma función).
- **Verificación:** forzar un error de insert (payload inválido) y confirmar que el perfil
  publicado anterior **sigue intacto** (rollback).

### 1.2 — `username` real y único (SQL + código)

- `supabase/migrations/0006_username.sql`: columna `username citext unique` con
  `check (username ~ '^[a-z0-9_]{3,30}')`, backfill desde `display_name` (resolviendo colisiones
  con sufijo numérico), y tabla `username_history (old_username, profile_id, changed_at)`.
- Lista de reservadas (`dashboard`, `login`, `perfil`, `api`, `legal`, `grupo`, `cleanup`…).
- `app/[username]/page.tsx`: buscar por `username` exacto (no `ilike` sobre `display_name`),
  con fallback a `username_history` → redirect 301.
- Registro (`app/login/page.tsx`): pedir y validar `username` al crear cuenta.
- Todos los generadores de slug (QR, tarjeta PDF, share dialog) pasan a usar `username`.
- **Verificación:** dos "Nova Reyes" resuelven a perfiles distintos; `/%25` da 404 limpio;
  registrarse como "login" se rechaza.

### 1.3 — Eliminar el fallback `PROFILE_ID` (código)

- Quitar `?? PROFILE_ID` de los ~10 sitios listados en la auditoría. Sin sesión → `/login`.
- Mantener `PROFILE_ID` solo si sigue haciendo falta para seeds de desarrollo, detrás de un
  guard de `NODE_ENV !== 'production'`.
- **Verificación:** anónimo en `/dashboard` → redirigido, sin tocar el perfil semilla.

### 1.4 — Feed determinista y paginado (código)

- `lib/feed/publicPosts.ts`, `lib/musicFeed.ts`, `lib/feed/discovery.ts`: `order('created_at',
  desc)` siempre; paginación keyset (`lt('created_at', cursor)`); mover la agregación de
  descubrimiento a un RPC/vista con `group by` en vez de traer 500 filas al cliente.
- **Verificación:** el contenido nuevo aparece arriba; scroll infinito trae páginas coherentes.

### 1.5 — Anti-suplantación en comentarios/preguntas (SQL + código)

- Dejar de aceptar `author_name`/`asker_display_name` del cliente; resolver por join a
  `public_profiles` al leer (o trigger que lo escriba server-side).
- **Verificación:** un comentario no puede firmarse con el nombre de otro artista.

### 1.6 — Concurrencia optimista en el editor (SQL + código)

- Columna `profiles.version int default 0`; el update del editor hace `.eq('version', known)`
  e incrementa; si afecta 0 filas → avisar "alguien más editó este perfil, recarga".
- **Verificación:** dos pestañas, la segunda en guardar recibe el aviso en vez de pisar.

### 1.7 — Encender TypeScript (código)

- Quitar `ignoreBuildErrors: true` de `next.config.mjs`, correr `tsc --noEmit`, arreglar lo que
  aparezca. (Puede ser un rato; lo hago incremental.)
- **Verificación:** `pnpm build` pasa sin ignorar errores.

Fin de fase: PR `fase-1-integridad`. SQL a correr: `0005`, `0006` (+ los de 1.5/1.6).

---

## FASE 2 — Plataforma

Objetivo: que Vibe se comporte como una plataforma, no como un SPA. Mayor retorno comercial arriba.

### 2.1 — Perfiles públicos como Server Components + SEO/OG  ← el de mayor impacto

- Convertir `app/[username]/page.tsx` y `app/[username]/tienda/page.tsx` a Server Components:
  carga de datos en el servidor, `generateMetadata` (título = nombre del artista, descripción =
  bio, `openGraph.images` = foto del artista), `revalidate`/`unstable_cache`,
  `generateStaticParams` para perfiles activos. La parte interactiva (tabs, reproductor) queda
  como islas cliente.
- `app/robots.ts` y `app/sitemap.ts` (sitemap dinámico de perfiles públicos).
- Ruta `app/[username]/opengraph-image.tsx` para la imagen social por perfil.
- **Verificación:** pegar un link de perfil en el validador de OG muestra foto+nombre; `view-source`
  del perfil ya trae el contenido (no un esqueleto); Lighthouse SEO sube.

### 2.2 — Middleware de auth en el borde (código)

- `middleware.ts`: proteger `/dashboard`, `/perfil/*`, `/grupo/*` verificando la sesión de
  Supabase antes de renderizar. Elimina el parpadeo de contenido protegido.
- **Verificación:** anónimo pидiendo `/perfil/config` recibe redirect en el borde, sin HTML del panel.

### 2.3 — Migraciones con Supabase CLI (infra)

- Adoptar `supabase/migrations/` como fuente única, `supabase db diff`, y consolidar los 23
  `.sql` sueltos en un baseline. Retirar los fallbacks en cascada de `lib/*` (los tres `select`
  de reintento) una vez que el esquema es conocido.

### 2.4 — CI + tests de RLS (infra)

- `.github/workflows/ci.yml`: `tsc --noEmit`, ESLint (instalar y configurar de verdad), y una
  suite Vitest que levante una base efímera y verifique las políticas clave:
  "A no escribe el perfil de B", "anónimo no lee `artist_legal`", "no se borra archivo ajeno".
- **Verificación:** el CI corre en cada PR y falla si se reabre un agujero de RLS.

### 2.5 — Observabilidad + rate limiting (infra)

- Sentry (cliente y server), logs estructurados en las API routes.
- Rate limit por IP+usuario en `/api/generate-image`, `/api/oembed`, comentarios, preguntas y
  registro (Upstash Redis o el de Vercel). Captcha invisible en el registro.
- Dejar de devolver `error.message` crudo al cliente.

### 2.6 — Endurecer CSP (código)

- Nonces por request vía middleware para quitar `'unsafe-inline'`/`'unsafe-eval'`.
- Añadir `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy`; acotar `img-src`.

Fin de fase: PR `fase-2-plataforma`.

---

## FASE 3 — Operación a escala (continuo, post-lanzamiento)

- **Moderación y cumplimiento (bloqueante legal):** reportar contenido, bloquear usuarios,
  flujo DMCA (notificación + contranotificación + suspensión), borrado y exportación de cuenta
  (Ley 29733 / GDPR — crítico porque guardas DNIs), registro de auditoría.
- **Panel de administración** propio (hoy moderas desde el SQL Editor).
- **Cuotas por plan** apoyadas en `media_assets` (§0.5); alertas de gasto de R2 y Together AI.
- **Caché en el borde** para las lecturas públicas (deriva de §2.1).
- **Backups verificados** de Supabase y R2, con restauración probada.

---

## Qué necesito de ti para arrancar

1. Confirmar que empezamos por **Fase 0** en una rama nueva.
2. Correr `supabase/_diagnostico_rls.sql` (te lo entrego primero) y pegarme el resultado —
   con eso calibro los archivos de la §0.6 a tu esquema real.
3. Decirme si ya tienes `ADMIN_USER_IDS` en mente (tu propio `user.id` de Supabase basta para empezar).

Con eso confirmado, mi primer entregable de código es 0.2 + 0.3 + 0.4 (los tres que son puro
código sin dependencia del SQL), en paralelo al diagnóstico que corres tú.
