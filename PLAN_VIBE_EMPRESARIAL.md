# Plan de calidad empresarial y defensa en profundidad — Vibe

Fecha: 15 de agosto de 2026 · Rama `main` @ `6ffa555` · Árbol limpio salvo `next-env.d.ts` (regenerado por Next).

Este documento continúa [AUDITORIA.md](AUDITORIA.md) y [PLAN.md](PLAN.md). Aquellos describían
el problema y la primera tanda de arreglos; **este parte del código que hoy existe**, separa lo
implementado de lo pendiente, y define el camino ejecutable hasta una plataforma que se pueda
operar con usuarios reales, dinero real y contenido de terceros.

---

## 0. Principios innegociables

Estos gobiernan cada fase. Si una tarea los contradice, la tarea está mal planteada.

1. **La lógica, la UX y las funciones existentes se preservan tal cual.** Ninguna fase de este
   plan tiene permiso para cambiar cómo se ve o cómo se comporta Vibe para el usuario. Cuando un
   cambio interno (por ejemplo, mover el render del perfil al servidor) roce la UI, la prueba de
   aceptación es *"la captura antes y después son idénticas"*, no *"se ve bien"*.
2. **No se cambia de proveedor ni se inventan integraciones.** Vibe corre sobre Supabase
   (Postgres + Auth + RLS), Cloudflare R2, Vercel, Together AI para imágenes y los oEmbed
   públicos de YouTube/Spotify/SoundCloud/TikTok/Meta. El plan se ejecuta con eso. Toda pieza
   nueva se justifica explícitamente y aparece en la §16 (intervención humana).
   En particular: **el rate limit distribuido se hace en Postgres**, que ya está pagado y ya
   tiene la migración `0009` escrita, no en Redis/Upstash.
3. **Fail-closed.** Ante configuración ausente o ambigua, la funcionalidad sensible queda
   apagada, no abierta. Ya es el criterio de `lib/admin.ts` (sin `ADMIN_USER_IDS` nadie es admin)
   y de `0004` (sin saber quién es el comprador, `orders` queda cerrada). Se mantiene.
4. **Defensa en profundidad, no una sola pared.** Cada regla vive en dos capas: en la base
   (RLS/constraints/RPC) y en el código (validación al guardar y al renderizar). Si una falla,
   la otra sostiene. `safeHref()` ya sigue este patrón; se generaliza.
5. **Migraciones forward-only.** Nunca se edita una migración ya aplicada. Los arreglos van en
   una migración nueva. Todo cambio destructivo se separa en dos despliegues (expandir → contraer).
6. **Fases pequeñas, con una sola preocupación cada una.** Una fase = una rama = un PR que se
   pueda revisar en una sentada y revertir sin arrastrar nada más.
7. **Nada se declara listo sin evidencia reproducible.** Un comando que corre, una prueba que
   pasa, una captura, una respuesta HTTP. No "debería funcionar".

---

## 1. Estado real hoy — inventario verificado

Leído directamente del árbol de trabajo. Las marcas de "aplicado en producción" son las únicas
que **no** pude verificar, porque requieren tu base de datos.

### 1.1 Superficie del producto

| Área | Tamaño real |
|---|---|
| Código propio (`app`, `components`, `lib`, `hooks`) | ~20 600 líneas TS/TSX |
| Rutas de API | 7 (`upload-url`, `delete-file`, `cleanup-orphaned-files`, `image-proxy`, `oembed`, `generate-image`, `eliminar-cuenta`) |
| Páginas | 39 archivos de ruta, incluidas `/[username]`, `/[username]/tienda`, `/dashboard`, `/perfil/*`, `/grupo/*`, `/legal/*` |
| Componentes | 60+ (`block-inspector.tsx` 2 657 líneas y `profile-editor.tsx` 1 111 son los dos centros de gravedad) |
| Migraciones versionadas | 9 (`0001`…`0009`) |
| SQL histórico suelto | 23 archivos en `supabase/` sin numerar |
| Pruebas | 7 archivos Vitest, todos unitarios y puros |

### 1.2 Lo que YA está implementado (no rehacer)

Verificado en el código, commiteado en `main`:

**Seguridad de aplicación**
- `lib/safe-url.ts` con pruebas: mata el XSS de `javascript:` al guardar y al renderizar.
- `app/api/image-proxy`: comparación de **origen exacto** (no `startsWith`), sólo `https:`,
  `redirect: "error"`, timeout de 5 s, `Content-Type` forzado a `image/*`, techo de 10 MB,
  `X-Content-Type-Options: nosniff` en la respuesta.
- `app/api/cleanup-orphaned-files`: exige sesión **y** allowlist `ADMIN_USER_IDS`, valida
  `folder` contra `{images, audio, video}`, y **pagina** las lecturas de Postgres (el bug de las
  1000 filas de PostgREST que hacía borrar archivos en uso).
- `app/api/delete-file`: autoriza por propiedad real vía `media_assets` + RLS con el JWT del
  usuario, con tope de 100 URLs por llamada.
- `app/api/upload-url`: sesión obligatoria, rate limit, validación pura y probada en
  `lib/upload-validation.ts` (carpeta, extensión↔MIME, tamaño por carpeta), y registro de
  propiedad en `media_assets` **antes** de firmar.
- `lib/server-auth.ts`: `getAuthenticatedContext()` devuelve un cliente que actúa con el JWT del
  usuario — RLS sigue siendo la última palabra. La service role key no aparece en ningún lado.
- Ninguna ruta salvo una devuelve `error.message` crudo (ver §1.3, punto 4).

**Datos e integridad**
- `0002_media_assets` — propiedad de archivos.
- `0003_profile_private` — saca `legal_settings` (DNI) y `draft_content` de la tabla pública.
- `0004_lock_remaining_rls` — ya alineada con el esquema real (commit `24c0b7a`).
- `0005` + `0007` — `publish_profile(uuid, jsonb, integer)`: publicación **atómica**,
  `security invoker`, con `SELECT … FOR UPDATE` y versión optimista (`content_version`).
- `0006_username` — identidad real, única, con historial y redirección.
- `0008_moderacion_y_cumplimiento` — `content_reports`, `user_blocks`, `exportar_mis_datos()`,
  `eliminar_mi_cuenta()`, auditoría.
- `0009_shared_rate_limits` — contador compartido en Postgres, `security definer`, atado a
  `auth.uid()`, con UPSERT atómico (sin la condición de carrera del `FOR UPDATE`).

**Plataforma**
- `proxy.ts` (el middleware de Next 16) protege las rutas de `lib/protected-routes.ts` en el
  borde, con `@supabase/ssr` y cookies.
- `app/[username]/page.tsx` es Server Component con `generateMetadata` real (título, descripción,
  OG, Twitter card, canonical) y `revalidate = 300`.
- `app/robots.ts` y `app/sitemap.ts` dinámico.
- `app/error.tsx` y `app/not-found.tsx`.
- `next.config.mjs`: CSP calibrada, HSTS 2 años con preload, `nosniff`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `poweredByHeader: false`, y **TypeScript encendido**
  (`ignoreBuildErrors` eliminado).
- `eslint.config.mjs` con el flat config nativo de `eslint-config-next` 16.
- `.github/workflows/ci.yml`: `tsc --noEmit` → `eslint .` → `vitest run` → `next build`.
- `lib/audio-engine.ts`: un único `<audio>` de módulo con token de generación — resuelve de raíz
  la doble reproducción, los audios zombie y la latencia. `lib/audio-bus.ts` desacopla el fondo
  audio-reactivo de Web Audio para no depender de CORS.
- Rate limit en `upload-url` (120/h), `generate-image` (10/h), `oembed` (30/min por IP) y
  `eliminar-cuenta` (3/h), con caída elegante al contador local si `0009` no está aplicada.

**Cumplimiento**
- `lib/moderation.ts`: reportar (con o sin cuenta, con declaración jurada para copyright),
  bloquear/desbloquear, exportar datos, eliminar cuenta.
- `app/api/eliminar-cuenta`: borra R2 **antes** que la base, en el orden correcto.

### 1.3 Lo que está PENDIENTE — hallazgos concretos

Numerados; cada fase de abajo referencia estos números.

**Bloqueantes de operación**

- **P-01 — Las migraciones `0002`…`0009` se aplicaron el 2026-08-05, pero los 5 controles de
  verificación de `DESPLIEGUE.md` (paso 4) nunca se ejecutaron.** El diagnóstico se cerró
  entonces con buen resultado: las 16 tablas de `public` tienen RLS activo, `orders` y
  `order_items` **no existen**, y `0004` no necesitaba cambios. Lo que falta es la comprobación
  externa e independiente: que la anon key ya no devuelva DNIs, que el `cleanup` responda 401,
  que el `image-proxy` responda 400, que un `javascript:` guardado quede inerte y que la tarjeta
  social muestre al artista. Sin eso, "está arreglado" sigue siendo una afirmación, no un hecho.
- **P-02 — Falta `TOGETHER_API_KEY`.** `ADMIN_USER_IDS` y `NEXT_PUBLIC_SITE_URL` ya están
  configuradas en Vercel. La de Together AI quedó pospuesta a un plan Pro por decisión propia:
  mientras tanto `/api/generate-image` manda `Bearer undefined` y devuelve 500. No afecta a nada
  más, pero conviene que la ruta lo diga con un mensaje claro en vez de fallar contra el tercero.
- **P-03 — Dos páginas del panel consultan tablas que no existen y hoy están rotas.**
  `app/perfil/pedidos/page.tsx:63` y `app/perfil/dashboard/page.tsx:58` consultan `order_items`,
  que el diagnóstico confirmó **inexistente**; `app/perfil/dashboard/page.tsx:75` consulta
  `donations`, que existe con el esquema viejo (`artist_id bigint` → tabla `artist`) y quedó
  cerrada sin política de lectura por `0004`. Ambas pantallas muestran hoy el error crudo de
  Postgres al usuario. Están enlazadas desde `LayoutAdmin.tsx`, así que son alcanzables. Hay que
  decidir: implementar el modelo de pedidos de verdad, o retirar las pantallas. No pueden quedar
  como están.
- **P-03b — Deuda del prototipo anterior todavía en la base:** las tablas `artist`, `merch` y
  `donations` conservan lectura pública (`qual = true`) y no las cubre ninguna migración. Baja
  severidad hoy (2 perfiles de prueba), pero es superficie de ataque sin dueño. Los componentes
  que las usaban ya se borraron (commit `6ffa555`). Queda además la tabla de respaldo
  `_backup_profiles_20260805` viva en producción.

**Seguridad residual**

- **P-04 — `cleanup-orphaned-files` devuelve `error.message` crudo** en su `catch` final
  (`{ error: error.message ?? "Error en la limpieza" }`). Es la única ruta que todavía filtra
  detalles internos.
- **P-05 — El "haystack" de `cleanup-orphaned-files` está incompleto por diseño posterior a
  `0003`.** Construye el conjunto de URLs en uso con un cliente **anónimo** leyendo
  `profile_blocks`, `products` y `services`. Tras `0003`, los borradores viven en
  `profile_private`, que anon no puede leer. Un archivo subido y referenciado **sólo desde un
  borrador** se ve como huérfano y se borra. Es el mismo tipo de pérdida de datos que ya
  perseguiste con el bug de "archivo no encontrado".
- **P-06 — `image-proxy` sólo comprueba el `Content-Length` declarado.** Un upstream que no lo
  mande (o mienta) puede exceder los 10 MB, porque el cuerpo se reenvía como stream sin contar
  bytes. Riesgo bajo (el origen es tu propio bucket), pero es una comprobación que no cumple lo
  que promete.
- **P-07 — `identificarSolicitante()` confía en el primer valor de `x-forwarded-for`.** En Vercel
  la cabecera es confiable; fuera de Vercel es falsificable y el rate limit por IP se evade
  con un header. Falta atarlo explícitamente al proxy de confianza.
- **P-08 — El JSONB de contenido no tiene validación de esquema en ninguna frontera.**
  `lib/blocks.ts` (977 líneas) define las formas en TypeScript, pero TypeScript se borra en
  runtime: el navegador puede mandar cualquier objeto a `profile_blocks.content` y a
  `publish_profile`, que sólo verifica que el arreglo sea un arreglo. `block_type` y
  `position_index` entran sin validar. Es la superficie sin protección más grande que queda.
- **P-09 — Las escrituras que van directas del navegador a Supabase no tienen límite.**
  El rate limit sólo cubre 4 rutas de API. Comentarios (`lib/post-comments.ts`,
  `lib/track-comments.ts`), preguntas (`lib/profile-questions.ts`), reportes
  (`lib/moderation.ts`) y el registro (`app/login`) hacen `insert` directo contra PostgREST:
  no pasan por ninguna función serverless, así que ningún contador los ve. Spam trivial.
  No hay captcha en el registro.
- **P-10 — La CSP conserva `'unsafe-inline'` y `'unsafe-eval'` en `script-src`**, y
  `img-src https:` / `connect-src https: wss:` son genéricos. Faltan
  `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy`.
- **P-11 — No hay escaneo de secretos ni auditoría de dependencias en CI.** Bancary y Canodent
  ya corren gitleaks y `npm audit --audit-level=high`; Vibe no corre ninguno de los dos.
- **P-12 — No hay rotación ni inventario documentado de credenciales** (R2 access key, anon key,
  tokens). `.env.local` contiene además un `VERCEL_OIDC_TOKEN` (no versionado, correcto, pero
  vivo en disco).
- **P-13 — No existe panel de administración.** Los reportes llegan a `content_reports` y se
  revisan desde el SQL Editor. Un SLA de DMCA no es operable así.

**Datos y esquema**

- **P-14 — Las migraciones no se aplican con herramienta.** No hay `supabase/config.toml`, no hay
  Supabase CLI en `devDependencies`, no hay registro de qué se aplicó. Conviven 23 `.sql`
  históricos sueltos con `migrations/` numeradas: ambigüedad permanente sobre cuál manda.
- **P-15 — Los fallbacks en cascada siguen ahí.** `lib/feed/publicPosts.ts`,
  `lib/feed/discovery.ts`, `lib/musicFeed.ts` y `lib/catalog.ts` intentan tres `select`
  distintos "por si falta una columna". Es el síntoma de P-14: la app no sabe qué esquema tiene.
- **P-16 — La agregación de descubrimiento sigue en el cliente**, sobre una muestra de 500 filas.
  Determinista ya (tiene `.order()`), pero sigue mintiendo con volumen y descargando megas al
  celular.
- **P-17 — La paginación del feed no es keyset.** Se ordena y se limita, pero no hay cursor
  `created_at < X`: con scroll infinito y contenido nuevo entrando, hay saltos y repeticiones.

**Plataforma, rendimiento y SEO**

- **P-18 — El perfil público sigue renderizándose en el cliente.** `app/[username]/page.tsx` es
  Server Component sólo para los metadatos; devuelve `<PerfilPublicoClient />`, que carga perfil,
  bloques y catálogo con `useEffect`. Google indexa un esqueleto, cada visita son varios
  roundtrips secuenciales, y `revalidate = 300` no cachea nada porque no hay datos en el HTML.
  **La mitad del arreglo comercial de §15 de la auditoría está sin hacer.**
- **P-19 — No hay `opengraph-image` por perfil.** La tarjeta social usa la foto de R2 tal cual;
  si el artista no tiene foto, no hay imagen.
- **P-20 — `images.unoptimized: true`** y sin presupuesto de rendimiento definido ni medido.
- **P-21 — Sin caché en el borde para las lecturas públicas.** Deriva directa de P-18.

**Operación**

- **P-22 — Cero observabilidad.** Todo termina en `console.error`, que en Vercel se pierde. Sin
  agregador de errores, sin logs estructurados, sin alertas, sin métricas.
- **P-23 — Sin endpoint de salud.** No hay forma automática de saber si la app puede hablar con
  Supabase y con R2.
- **P-24 — Sin staging.** Un solo proyecto de Vercel y un solo Supabase. Cualquier prueba de
  migración se hace contra producción.
- **P-25 — Sin backups verificados ni restore probado.** El backup de Supabase existe si está
  activado en tu plan, pero nunca se restauró. R2 no tiene versioning ni lifecycle documentados,
  y `/api/eliminar-cuenta` + `/api/cleanup-orphaned-files` borran objetos sin red de seguridad.
- **P-26 — Sin runbooks.** Cuando algo falle a las 2 a. m., no hay documento que diga qué mirar.
- **P-27 — El CI no es una puerta de calidad todavía.** No corre con `--max-warnings=0`
  (hay ~23 warnings del React Compiler aceptados a propósito), no tiene E2E, ni pruebas de RLS,
  ni accesibilidad, ni regresión visual, ni auditoría, ni escaneo de secretos, ni `concurrency`,
  ni `permissions: contents: read`, ni `timeout-minutes`.
- **P-28 — Las pruebas sólo cubren `*.test.ts`**, no `.tsx`: cero pruebas de componente. Y son
  todas puras: ninguna toca la base, que es donde vive la seguridad.
- **P-29 — Sin CODEOWNERS, sin plantilla de PR, sin protección de rama documentada.**

**Producto y legal**

- **P-30 — `LEGAL_CONTACT_EMAIL` es tu correo personal** (`lib/site.ts` lo marca con ⚠️).
  Es la dirección donde por ley deben llegar las notificaciones de derechos de autor.
- **P-31 — No hay banner ni control de consentimiento de cookies**, aunque existe
  `/legal/cookies` y `@vercel/analytics` está activo.
- **P-32 — Sin política de retención** de datos, de logs ni de contenido de cuentas eliminadas.
- **P-33 — Accesibilidad sin auditar.** El editor es intensamente interactivo (arrastrar y
  soltar, pestañas, modales, reproductor); nada garantiza que funcione con teclado ni con lector
  de pantalla.
- **P-34 — La suspensión (`is_suspended`) existe en la base** pero no está verificado que el
  feed, el sitemap y el perfil público la respeten en todas las rutas de lectura.

> **Nota de honestidad:** no pude ejecutar `pnpm test`, `tsc --noEmit` ni `pnpm build` en esta
> sesión (los comandos requerían una aprobación que no se otorgó). El estado del CI descrito
> arriba viene de leer la configuración, no de una corrida. La fase F1 empieza precisamente por
> establecer esa línea base con evidencia.

---

## 2. Arquitectura objetivo

No cambia de forma. Se explicita y se refuerza.

```
                 ┌──────────────────────────────────────────────┐
   Visitante ───▶│ Vercel Edge — proxy.ts                       │
                 │ · rutas protegidas → sesión Supabase (SSR)   │
                 │ · cabeceras de seguridad + CSP con nonce (F4)│
                 └───────────────┬──────────────────────────────┘
                                 │
     ┌───────────────────────────┼────────────────────────────────┐
     ▼                           ▼                                ▼
┌──────────────┐        ┌──────────────────┐          ┌────────────────────┐
│ Server       │        │ API Routes       │          │ Islas cliente      │
│ Components   │        │ (7 rutas)        │          │ editor, reproductor│
│ perfil, feed │        │ auth + rate      │          │ pestañas, modales  │
│ tienda (F10) │        │ limit + valida   │          │                    │
└──────┬───────┘        └────────┬─────────┘          └─────────┬──────────┘
       │ anon key                │ JWT del usuario              │ anon key
       │ (sólo público)          │ (nunca service role)         │ + JWT
       ▼                         ▼                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Supabase Postgres                                                        │
│ · RLS en TODA tabla — la frontera de seguridad real                      │
│ · RPC security invoker: publish_profile (atómico + versión optimista)    │
│ · RPC security definer acotadas: rate limit, exportar/eliminar cuenta    │
│ · Constraints y validación de forma del JSONB (F3)                       │
│ · Auditoría: audit_log (0008)                                            │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │ media_assets = inventario de propiedad
                           ▼
                 ┌──────────────────────┐
                 │ Cloudflare R2        │  PUT firmado directo desde el
                 │ images/ audio/ video │  navegador · GET público
                 └──────────────────────┘
```

**Las cuatro invariantes que ninguna fase puede romper:**

1. La *service role key* no existe en el código ni en el runtime de la app. Si alguna vez hace
   falta, vive en un proceso administrativo aparte, jamás en una ruta de Next.
2. Todo acceso a datos de usuario pasa por RLS evaluada con `auth.uid()` real.
3. Todo objeto en R2 tiene una fila de propiedad en `media_assets`. Sin fila, no se borra
   automáticamente (política actual, correcta: preferir un huérfano a un borrado ajeno).
4. La publicación del perfil es atómica y versionada.

---

## 3. Mapa de fases

Cinco bloques, quince fases. Cada fase = una rama = un PR. El orden importa: los bloques A y B
son prerrequisito de todo lo demás, y **el bloque C (pruebas) debe cerrarse antes del bloque D**,
porque D toca el render y sin red de pruebas no se puede demostrar que la UX no cambió.

| Bloque | Fases | Qué logra | Depende de |
|---|---|---|---|
| **A · Cerrar el estado real** | F0, F1 | Saber qué está desplegado y tener línea base medida | — |
| **B · Seguridad** | F2, F3, F4, F5 | Cerrar los residuos y añadir capas | A |
| **C · Datos y pruebas** | F6, F7, F8, F9 | Esquema gobernado + red de pruebas que congela la UX | A, B |
| **D · Rendimiento y producto** | F10, F11, F12 | SEO real, feed a escala, observabilidad | C (obligatorio) |
| **E · Operación** | F13, F14 | Staging, backups, runbooks, moderación operable | D |

```
F0 ─▶ F1 ─┬─▶ F2 ─▶ F3 ─▶ F4 ─▶ F5 ─┬─▶ F6 ─▶ F7 ─┬─▶ F9 ─┬─▶ F10 ─▶ F11 ─┬─▶ F13 ─▶ F14
          │                          └─▶ F8 ───────┘       └─▶ F12 ─────────┘
          └─(F8 puede empezar en paralelo apenas F1 cierre)
```

---

# BLOQUE A — Cerrar el estado real

## F0 · Verificación del estado desplegado

**Objetivo:** dejar de trabajar sobre supuestos. Saber exactamente qué migraciones corrieron, qué
políticas existen y qué variables están puestas.

**Depende de:** nada. Es la primera.

**Archivos probables:**
- `supabase/_diagnostico_parte2.sql` (ya escrito — se ejecuta, no se modifica)
- `supabase/_diagnostico_estado.sql` *(nuevo, sólo lectura)*: además de lo anterior, verifica la
  existencia de `media_assets`, `profile_private`, `username`, `content_version`,
  `rate_limit_windows`, `content_reports`, `user_blocks`, y de las funciones
  `publish_profile/3`, `consume_authenticated_rate_limit/3`, `exportar_mis_datos`,
  `eliminar_mi_cuenta`.
- `docs/estado-desplegado.md` *(nuevo)*: la respuesta, fechada y firmada.

**Pruebas / evidencia:**
- Salida de las consultas de diagnóstico pegada en `docs/estado-desplegado.md`.
- Con la anon key:
  `curl "$SUPABASE_URL/rest/v1/profiles?select=*" -H "apikey: $ANON"` → **no** debe aparecer
  `legal_settings`, `draft_content`, `user_id` ni `owner_user_id`.
  `curl "$SUPABASE_URL/rest/v1/profile_private?select=*" -H "apikey: $ANON"` → 0 filas o 401.
- `curl -X POST https://<dominio>/api/cleanup-orphaned-files -d '{"folder":"audio"}'` → **401**.
- `curl "https://<dominio>/api/image-proxy?url=https://pub-XXX.r2.dev.ejemplo.com/x"` → **400**.

**Criterios de aceptación:**
- [ ] Ninguna tabla de `public` con `relrowsecurity = false`.
- [ ] Ninguna política con `qual = true` fuera de los SELECT públicos intencionales.
- [ ] Las 9 migraciones confirmadas como aplicadas, o listadas las que faltan con fecha de
      aplicación planificada.
- [ ] `orders`/`order_items`/`donations`: o no existen, o tienen política de comprador/vendedor
      escrita en una migración nueva (**cierra P-03**).
- [ ] Inventario de variables de entorno por entorno, con las ausentes marcadas (**P-02**).

**Riesgos:** que el diagnóstico revele una tabla abierta con datos reales dentro. Mitigación: si
aparece, se cierra en el mismo día con una migración `0010`, antes de seguir con F1.

**Intervención humana:** **sí, y es bloqueante.** Sólo tú puedes correr SQL en tu proyecto y leer
las variables de Vercel. Sin F0 cerrada, todas las fases siguientes se construyen sobre una
suposición.

---

## F1 · Línea base de calidad e higiene del repositorio

**Objetivo:** medir dónde estamos (cuántos warnings, cuánto tarda el build, qué tamaño tiene el
bundle) y poner los andamios de repositorio que no tocan una sola línea de lógica.

**Depende de:** F0 (para no documentar un estado falso).

**Archivos probables:**
- `AGENTS.md` *(nuevo, raíz)* — reglas del repo, siguiendo el patrón de Canodent: alcance,
  precedencia, gates obligatorios, qué nunca se commitea. Vibe es el único de los cuatro
  proyectos que no tiene uno.
- `.env.example` *(nuevo)* — nombres canónicos de **todas** las variables, sin valores:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_R2_PUBLIC_URL`,
  `NEXT_PUBLIC_SITE_URL`, `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `ADMIN_USER_IDS`, `TOGETHER_API_KEY`,
  `META_APP_ACCESS_TOKEN`.
- `.github/CODEOWNERS`, `.github/pull_request_template.md` *(nuevos)*.
- `docs/linea-base.md` *(nuevo)* — la medición inicial.
- `package.json` — se añade `"qa": "pnpm typecheck && pnpm lint && pnpm test"`. Nada más.

**Decisión deliberada: no se introduce Prettier.** Canodent lo usa y funciona, pero ahí nació con
el proyecto. Meterlo hoy en Vibe significa reformatear ~20 600 líneas en un commit, lo que
destruye `git blame`, convierte cualquier revisión posterior en ruido y multiplica el riesgo de
un cambio accidental de comportamiento en JSX. En su lugar: `git diff --check` en CI (patrón de
Bancary) para espacios en blanco, y ESLint como única autoridad de estilo.

**Pruebas / evidencia:**
```powershell
pnpm install --frozen-lockfile
pnpm typecheck            # se registra: ¿0 errores?
pnpm lint                 # se registra el número EXACTO de warnings
pnpm test                 # se registra: N archivos, M pruebas
pnpm build                # se registra duración y tamaño del primer JS
pnpm audit --audit-level=high   # se registra el número de vulnerabilidades
```

**Criterios de aceptación:**
- [ ] `docs/linea-base.md` contiene las cinco cifras, con fecha y versión de Node/pnpm.
- [ ] `pnpm typecheck` da **0 errores** (si no, F1 no cierra hasta arreglarlos: TypeScript ya
      está encendido en el build, así que un error aquí es un despliegue roto esperando).
- [ ] `.env.example` cubre las 12 variables y `AGENTS.md` está escrito.
- [ ] Cero cambios en `app/`, `components/`, `lib/`, `hooks/`.

**Riesgos:** que `pnpm typecheck` o `pnpm build` fallen hoy y F1 se convierta en una fase de
arreglos. Es información valiosa, no un problema: mejor descubrirlo aquí que en un deploy.

**Intervención humana:** decidir los dueños de `CODEOWNERS`. Nada más.

---

# BLOQUE B — Seguridad de defensa en profundidad

## F2 · Cierre de los residuos de seguridad

**Objetivo:** los cuatro hallazgos concretos que quedaron sueltos. Cambios quirúrgicos, sin
impacto visible.

**Depende de:** F1.

**Archivos probables:**
- `app/api/cleanup-orphaned-files/route.ts`
  - **P-04:** el `catch` deja de devolver `error.message`; mensaje genérico + `console.error`.
  - **P-05:** el haystack pasa a construirse con el **cliente autenticado del administrador**
    (`getAuthenticatedContext`) e incluye `profile_private.draft_content`. Además —y esto es lo
    importante— el conjunto de "en uso" se cruza contra `media_assets`: **una key con fila de
    propiedad reciente (< 7 días) nunca se considera huérfana**, aunque no aparezca en ningún
    contenido. Un archivo recién subido que el usuario todavía no publicó deja de ser candidato
    a borrado. Si el administrador no puede leer los borradores por RLS, la limpieza **aborta**
    en vez de borrar con datos parciales.
- `app/api/image-proxy/route.ts` — **P-06:** contar bytes reales del stream con un
  `TransformStream` y cortar al superar `MAX_BYTES`, en vez de confiar en `Content-Length`.
- `lib/rate-limit.ts` — **P-07:** `identificarSolicitante()` sólo lee `x-forwarded-for` cuando
  `process.env.VERCEL === "1"` (o una variable explícita `TRUSTED_PROXY=true`); fuera de eso usa
  un identificador que no se pueda falsificar por cabecera. Documentado en el propio módulo.
- `lib/rate-limit.test.ts` — casos nuevos para P-07.

**Pruebas:**
- Unitarias: `identificarSolicitante` ignora `x-forwarded-for` sin proxy de confianza; lo respeta
  con él.
- Unitaria del contador de bytes del proxy (función pura extraída, testeable sin red).
- Manual, en staging (o local con un bucket de pruebas): subir un archivo, **no** publicarlo,
  correr la limpieza como admin → el archivo **sigue ahí**. Este es el criterio que importa.

**Criterios de aceptación:**
- [ ] Ninguna ruta de API devuelve `error.message` de origen externo o interno.
- [ ] La limpieza no borra archivos referenciados sólo en borradores ni subidos hace < 7 días.
- [ ] La limpieza aborta con error explícito si no pudo leer alguna fuente del haystack.
- [ ] `image-proxy` responde 413 al superar 10 MB reales.

**Riesgos:** endurecer la limpieza puede dejar más huérfanos acumulándose en R2. Es el
intercambio correcto (espacio barato vs. pérdida de datos irreversible) y se compensa con las
cuotas de F11 y las alertas de F12.

**Intervención humana:** ninguna, salvo tener `ADMIN_USER_IDS` puesta para probar la limpieza.

---

## F3 · Validación de esquema del contenido (la capa que falta)

**Objetivo:** cerrar P-08. Hoy TypeScript describe la forma de los bloques pero no la impone en
runtime; el navegador puede escribir cualquier cosa en `profile_blocks.content`. Se añade la
validación en **dos** capas, sin cambiar ni un campo del modelo actual.

**Depende de:** F2.

**Archivos probables:**
- `lib/blocks-schema.ts` *(nuevo)* — validadores por tipo de bloque, **derivados de los tipos que
  ya existen en `lib/blocks.ts`**. Sin librería nueva si se puede resolver con validadores
  escritos a mano y probados (el proyecto no tiene zod y añadirlo suma peso al bundle); si el
  volumen lo justifica, se evalúa `zod` como dependencia **de servidor únicamente**, y esa
  decisión se toma con datos en la revisión de F3, no de antemano.
- `lib/blocks.ts` — se le añade el `export` de la lista canónica de `block_type`. No se toca
  ninguna lógica.
- `components/profile-editor.tsx` — `handlePublish` valida antes de llamar al RPC y muestra el
  error con el mecanismo de toast **que ya existe**. Si valida, el flujo es idéntico al de hoy.
- `supabase/migrations/0010_validar_bloques.sql` *(nuevo)*
  - `check` sobre `profile_blocks.block_type` contra la lista canónica.
  - `check (jsonb_typeof(content) = 'object')`.
  - `check (position_index >= 0)`.
  - `publish_profile` v3: valida `block_type` y `position_index` de cada elemento **dentro** de la
    transacción, y rechaza el lote entero si alguno no cumple.
  - Índice `profile_blocks (profile_id, position_index)` si no existe.

**Pruebas:**
- Unitarias del validador: un bloque válido de cada tipo pasa; `block_type` desconocido,
  `content` no-objeto y `position_index` negativo se rechazan.
- Prueba de RLS/DB (llega completa en F7, se escribe aquí): un `insert` directo por PostgREST con
  `block_type = 'lo-que-sea'` es rechazado por la base.
- **Prueba de no regresión imprescindible:** publicar un perfil con **cada** tipo de bloque
  existente (hero, single, tracks, credits, crowdfunding, publicaciones, legado, embeds, merch,
  service, ask-about) y verificar que ninguno es rechazado. Si uno lo es, el validador está mal,
  no el contenido.

**Criterios de aceptación:**
- [ ] Un `insert` malicioso directo a PostgREST con un `block_type` inventado falla en la base.
- [ ] Los perfiles existentes se publican y se re-publican sin un solo rechazo.
- [ ] El editor muestra un mensaje claro cuando algo no valida, con el toast actual.
- [ ] Cero cambios visuales.

**Riesgos:** **el más alto del plan.** Un validador demasiado estricto rompe la publicación de
perfiles reales. Mitigación en tres pasos: (1) primero desplegar el validador en modo
*observación* (registra lo que habría rechazado, no rechaza), (2) revisar los registros contra los
perfiles reales durante una semana, (3) recién entonces activar el rechazo y la migración `0010`.

**Intervención humana:** correr `0010`. Revisar los registros del modo observación antes de
activar.

---

## F4 · CSP con nonce y cabeceras de aislamiento

**Objetivo:** cerrar P-10 sin romper ffmpeg.wasm, los iframes de embeds ni los scripts inline de
Next. La auditoría lo dejó fuera a propósito porque tiene riesgo real de rotura; con la red de
pruebas de F8 disponible, deja de tenerlo.

**Depende de:** F2. **Recomendación fuerte:** ejecutar después de F8, para tener E2E que pruebe
que los embeds y el transcodificador siguen funcionando.

**Archivos probables:**
- `proxy.ts` — genera un nonce por request y lo inyecta en la cabecera CSP y en la request.
- `next.config.mjs` — la CSP estática pasa a ser la base; el nonce la reemplaza en las rutas que
  pasan por el proxy. Se acota `img-src` y `connect-src` a los orígenes reales (R2, Supabase,
  miniaturas de YouTube) en vez de `https:` genérico. Se añaden
  `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Resource-Policy: same-site`.
- `app/layout.tsx` — pasa el nonce a los scripts que lo necesiten.

**Cuidado explícito con lo que hoy funciona y no puede romperse:**
`blob:` en `script-src` y `worker-src` (ffmpeg.wasm carga su core como blob), `wasm-unsafe-eval`,
`media-src blob:`, y los seis dominios de `frame-src` (YouTube, Spotify, SoundCloud, Facebook,
Instagram). Cada uno tiene un comentario en `next.config.mjs` explicando por qué está: ninguno se
toca sin una prueba que demuestre que ya no hace falta.

**Pruebas:**
- E2E (de F8): reproducir un embed de cada proveedor; transcodificar un audio con ffmpeg.wasm;
  subir una imagen con `browser-image-compression`; abrir el editor completo.
- La consola del navegador debe quedar **sin un solo error de CSP** en el flujo completo.
- `COOP: same-origin` puede romper ventanas emergentes: verificar el diálogo de compartir y el
  login con proveedor externo si existe.

**Criterios de aceptación:**
- [ ] `script-src` sin `'unsafe-inline'` (o, si Next lo exige para un caso concreto, documentado
      con el hash exacto y el motivo).
- [ ] `img-src` y `connect-src` acotados a orígenes nombrados.
- [ ] COOP y CORP presentes.
- [ ] Cero errores de CSP en consola durante el recorrido E2E completo.

**Riesgos:** alto sin F8; bajo con F8. Si `'unsafe-eval'` resulta imprescindible para
ffmpeg.wasm, se documenta y se deja **sólo** en las rutas que lo usan, no globalmente.

**Intervención humana:** ninguna, pero conviene que verifiques en tu navegador habitual y en
móvil antes del merge.

---

## F5 · Anti-abuso distribuido en las escrituras del navegador

**Objetivo:** cerrar P-09. Hoy el rate limit cubre 4 rutas de API, pero comentarios, preguntas,
reportes y registro escriben **directo** contra PostgREST sin pasar por ninguna función. El
contador de `0009` ya vive en Postgres; se extiende a esas escrituras desde la propia base.

**Depende de:** F0 (`0009` aplicada), F2.

**Enfoque: en Postgres, no en Redis.** `0009` ya resolvió el problema difícil (contador atómico,
`security definer`, atado a `auth.uid()`, sin condición de carrera). Extenderlo a triggers es
barato y no añade proveedor ni costo. Redis/Upstash queda descartado salvo que la medición de
F12 demuestre que el contador en Postgres es un cuello de botella real.

**Archivos probables:**
- `supabase/migrations/0011_limites_de_escritura.sql` *(nuevo)*
  - Función `check_write_rate_limit(bucket, limit, window)` reutilizando la lógica de `0009`.
  - Triggers `before insert` en `feed_post_comments`, `feed_comments`, `profile_questions`,
    `content_reports` y `user_blocks` que consumen su cupo y levantan excepción al superarlo.
  - Límites propuestos (ajustables): comentarios 30/h, preguntas 10/h, reportes 5/h,
    bloqueos 50/h. Para `content_reports` sin sesión, el cupo va por `reporter_email`
    normalizado, con un tope global diario para que un anónimo no sature la cola de moderación.
  - `check` de longitud máxima en cada campo de texto libre que no lo tenga.
- `lib/post-comments.ts`, `lib/track-comments.ts`, `lib/profile-questions.ts`,
  `lib/moderation.ts` — traducen el error del trigger al mensaje amable que ya usan hoy. La UI
  no cambia: el mismo toast, distinto texto.
- **Registro:** captcha invisible. Requiere decisión tuya (§16) porque implica un proveedor. La
  alternativa sin proveedor —confirmación de correo obligatoria antes de poder publicar, que
  Supabase Auth ya soporta— probablemente sea suficiente para el volumen de Vibe y es la
  recomendación por defecto.

**Pruebas:**
- Pruebas de base (F7): el comentario 31 de la misma hora es rechazado; el 30 pasa; al vencer la
  ventana vuelve a pasar.
- Un usuario no puede consumir la cuota de otro.
- Manual: comentar normalmente en el feed nunca topa el límite.

**Criterios de aceptación:**
- [ ] Toda escritura pública desde el navegador tiene un límite aplicado **en la base**.
- [ ] El límite es global entre instancias (vive en Postgres, no en memoria).
- [ ] Ningún usuario puede afectar la cuota de otro.
- [ ] El uso normal jamás toca el límite (validado con el flujo real, no con el número teórico).

**Riesgos:** un límite mal calibrado frustra a un usuario legítimo. Mitigación: desplegar primero
con límites generosos (3× el propuesto) y ajustar con las métricas de F12.

**Intervención humana:** correr `0011`. Decidir captcha vs. confirmación de correo.

---

# BLOQUE C — Datos gobernados y red de pruebas

## F6 · Supabase CLI y migraciones forward-only

**Objetivo:** cerrar P-14 y P-15. Que el esquema deje de ser folclore y pase a ser un artefacto
versionado, aplicable y reproducible. Es el patrón que Bancary ya tiene funcionando (34
migraciones con marca de tiempo, `db:verify`, `db:start`).

**Depende de:** F0 (saber qué está aplicado), F3 y F5 (que sus migraciones ya existan).

**Archivos probables:**
- `supabase/config.toml` *(nuevo)* — proyecto local, versión de Postgres **igual a la de tu
  proyecto de producción** (dato de F0).
- `package.json` — `supabase` en `devDependencies`; scripts `db:start`, `db:reset`, `db:verify`,
  `db:stop`, `db:lint`.
- `scripts/verify-db.mjs` *(nuevo)* — arranca Supabase local, `db reset --local --no-seed`,
  `db lint --level warning --fail-on error`. Copia adaptada del de Bancary.
- `supabase/migrations/0000_baseline.sql` *(nuevo)* — el esquema completo tal como quedó tras
  `0009`, generado con `supabase db diff` contra tu base real. Es lo que permite que
  `db reset` reconstruya todo desde cero.
- `supabase/legacy/` *(mover, no borrar)* — los 23 `.sql` históricos, con un `README.md` que diga
  claramente: *"histórico, ya incorporado al baseline; no ejecutar"*.
- `docs/migraciones.md` *(nuevo)* — la política forward-only, en detalle (ver §14).
- `lib/musicFeed.ts`, `lib/catalog.ts`, `lib/feed/discovery.ts`, `lib/feed/publicPosts.ts` —
  **retirar los fallbacks en cascada de tres `select`** (P-15). Sólo después de que
  `db:verify` demuestre que el esquema es conocido. Cada retiro es un commit propio y reversible.

**Pruebas:**
- `pnpm db:verify` reconstruye la base desde cero, sin error, en un runner limpio.
- `supabase db diff --linked` contra producción → **sin diferencias** (tras F0 y las migraciones
  pendientes aplicadas). Esta es la prueba de que el baseline es fiel.
- Las pruebas de F7 corren contra la base reconstruida.

**Criterios de aceptación:**
- [ ] `supabase/migrations/` es la única fuente del esquema.
- [ ] `pnpm db:verify` pasa en CI desde cero.
- [ ] `db diff` contra producción no reporta diferencias.
- [ ] Los fallbacks de "por si falta la columna" están eliminados y las pantallas que los usaban
      (feed, catálogo, descubrimiento, publicaciones) se comportan idénticamente.

**Riesgos:** el baseline puede no capturar algo que se hizo a mano en el SQL Editor y nadie
recuerda. Por eso el `db diff` contra producción es criterio de aceptación, no un opcional.
Retirar los fallbacks es el punto donde más fácil se rompe una pantalla: se hace uno a uno, con
verificación visual de cada pantalla afectada.

**Intervención humana:** instalar Docker Desktop (Supabase CLI local lo requiere). Correr
`supabase link` con tu proyecto. Confirmar la versión de Postgres.

---

## F7 · Pruebas de RLS y de base de datos

**Objetivo:** la pieza de mayor valor de todo el plan. Con RLS como única frontera de seguridad
real, no tener una prueba que verifique *"A no puede escribir el perfil de B"* es el riesgo más
silencioso del proyecto (§18 de la auditoría). Bancary tiene 14 archivos de este tipo; Vibe, cero.

**Depende de:** F6.

**Archivos probables:**
- `vitest.db.config.mjs` *(nuevo)* — `include: ['test/database/**/*.test.ts']`,
  `fileParallelism: false`, timeouts de 30 s. Patrón de Bancary.
- `package.json` — `"test:db": "vitest run --config vitest.db.config.mjs"`.
- `test/database/helpers.ts` *(nuevo)* — crea usuarios efímeros contra el Supabase local y
  devuelve clientes con su JWT. Nunca usa service role para lo que se está probando.
- `test/database/rls-perfiles.test.ts` — A no lee `profile_private` de B; A no escribe
  `profiles` de B; anon no lee `legal_settings` ni `draft_content` (ya no existen en `profiles`);
  anon lee sólo columnas públicas.
- `test/database/rls-media.test.ts` — A no ve ni borra `media_assets` de B; el insert exige
  `owner_user_id = auth.uid()`.
- `test/database/rls-feed-y-comentarios.test.ts` — A no borra la música de B
  (`deleteTrackFromFeed`); un comentario no puede firmarse con el nombre de otro artista;
  un bloqueo filtra el contenido correspondiente.
- `test/database/rls-moderacion.test.ts` — nadie ve los reportes ajenos; el reporte de copyright
  sin declaración jurada es rechazado; `exportar_mis_datos` devuelve sólo lo propio;
  `eliminar_mi_cuenta` no puede invocarse sobre otro.
- `test/database/publicacion.test.ts` — `publish_profile` es atómico (un lote con un bloque
  inválido no deja el perfil vacío); la versión optimista rechaza la segunda publicación
  concurrente; `draft_content` se limpia en la misma transacción.
- `test/database/limites.test.ts` — `consume_authenticated_rate_limit` es correcto bajo
  concurrencia; anon no puede ejecutarlo; nadie consume la cuota de otro; los triggers de F5
  cortan donde deben.
- `test/database/orders.test.ts` — sólo si F0 confirma que esas tablas existen.

**Pruebas:** son las pruebas. Cada `.test.ts` de arriba.

**Criterios de aceptación:**
- [ ] `pnpm test:db` pasa contra una base reconstruida desde cero.
- [ ] Cada uno de los 6 P0 originales de `AUDITORIA.md` tiene al menos una prueba que **falla si
      se reabre el agujero**. Esta es la verificación real: comentar la política y ver la prueba
      en rojo.
- [ ] Las pruebas no dependen de datos preexistentes ni del orden de ejecución.

**Riesgos:** las pruebas de base son lentas y frágiles si comparten estado. Mitigación:
`fileParallelism: false`, usuarios efímeros por archivo, limpieza en `afterAll`.

**Intervención humana:** ninguna, una vez que F6 dejó el entorno local funcionando.

---

## F8 · E2E, accesibilidad y regresión visual

**Objetivo:** congelar la UX **antes** de tocar el render (bloque D). Esta fase es el contrato de
no regresión de todo el plan: si F10 cambia un píxel o un comportamiento, esta suite lo detecta.

**Depende de:** F1. Puede correr en paralelo con F2–F7.

**Archivos probables:**
- `playwright.config.ts` *(nuevo)* — `testDir: ./tests/e2e`, proyectos `chromium-desktop` y
  `chromium-mobile` (Pixel 5), `webServer` con `next dev` en puerto fijo, `retries: 2` en CI.
  Patrón de Canodent.
- `playwright.visual.config.ts` *(nuevo)* — capturas por ancho: **390, 768, 1024, 1440**.
  Referencias **por plataforma** (`-win32.png`, `-linux.png`), porque las métricas de fuente
  difieren entre Windows y Linux; si no existe la referencia de la plataforma actual, la prueba
  se omite en vez de fallar. Exactamente el enfoque de `Canodent/tests/visual/capture.spec.ts`,
  que ya resolvió este problema.
- `tests/e2e/perfil-publico.spec.ts` — cargar un perfil sembrado; ver hero, pestañas, single,
  discografía; reproducir una pista y comprobar que **sólo una suena a la vez** (incluido el
  vídeo); navegar a `/tienda`; compartir.
- `tests/e2e/editor.spec.ts` — entrar al panel; añadir un bloque; reordenar arrastrando; subir
  imagen y audio; guardar borrador; **publicar**; ver el perfil público reflejando el cambio.
  Es el flujo que más veces se ha roto históricamente.
- `tests/e2e/feed.spec.ts` — scroll vertical, carril izquierdo de categorías, comentarios,
  compartir, menú de perfil.
- `tests/e2e/auth.spec.ts` — anónimo en `/dashboard` → redirigido **en el borde**, sin HTML del
  panel en la respuesta (prueba de `proxy.ts`).
- `tests/e2e/accesibilidad.spec.ts` — `@axe-core/playwright` sobre perfil público, feed, tienda,
  legal y editor. **Sin violaciones críticas ni serias.** Además: recorrido completo con teclado
  del editor y del reproductor (P-33).
- `tests/visual/capture.spec.ts` — instantánea ARIA (determinista, siempre comparada) + captura
  de píxeles (por plataforma) de perfil público, feed, tienda y editor, en los 4 anchos.
- `tests/e2e/fixtures/seed.ts` *(nuevo)* — siembra un perfil de prueba completo contra el
  Supabase local de F6, para que las pruebas no dependan de datos reales.
- `package.json` — `test:e2e`, `test:visual`, `test:visual:update`; `@playwright/test` y
  `@axe-core/playwright` en `devDependencies`.

**Criterios de aceptación:**
- [ ] Las capturas de referencia de los 4 anchos se generan **antes** de empezar F10 y se
      commitean. Son el "antes" contra el que se mide todo el bloque D.
- [ ] `pnpm test:e2e` pasa localmente y en CI.
- [ ] Cero violaciones críticas/serias de axe en las 5 páginas.
- [ ] El editor completo es operable con teclado.
- [ ] Cero errores de consola durante los recorridos.

**Riesgos:** las pruebas visuales generan falsos positivos si hay animaciones o fuentes remotas.
Mitigación (ya resuelta en Canodent): desactivar animaciones con `addStyleTag`, esperar a que
todas las imágenes tengan `naturalWidth > 0`, y separar la capa ARIA (determinista) de la capa de
píxeles (por plataforma). La suite del editor será la más frágil: se acepta `retries: 2` en CI.

**Intervención humana:** revisar y **aprobar** las capturas de referencia iniciales. Son la
definición oficial de "así se ve Vibe"; si alguna no te gusta, se arregla ahora, no después.

---

## F9 · CI de nivel empresarial, sin warnings

**Objetivo:** cerrar P-11, P-27, P-28, P-29. Que el CI sea una puerta real y no una formalidad.

**Depende de:** F7 y F8 (para tener qué correr).

**Archivos probables:**
- `.github/workflows/ci.yml` — reescrito:
  - `permissions: contents: read`, `concurrency` con `cancel-in-progress`, `timeout-minutes`.
  - Job **`secretos`**: gitleaks sobre todo el historial (`fetch-depth: 0`), imagen **fijada por
    digest** como en Canodent.
  - Job **`calidad`**: `pnpm install --frozen-lockfile` → `pnpm audit --audit-level=high` →
    `pnpm typecheck` → `pnpm lint` (con el tope de warnings, ver abajo) → `pnpm test` →
    `pnpm build` → `git diff --check`.
  - Job **`base-de-datos`**: `pnpm db:verify` → `pnpm test:db`.
  - Job **`e2e`**: `playwright install --with-deps chromium` → `pnpm test:e2e`.
  - Job **`visual`**: `pnpm test:visual` (sólo la capa ARIA en CI Linux si no hay referencias de
    Linux; la capa de píxeles se valida localmente en Windows).
- `.github/dependabot.yml` *(nuevo)* — actualizaciones semanales de npm y de GitHub Actions,
  agrupadas, para que el `audit` no se vuelva ruido de fondo.
- `eslint.config.mjs` — **trinquete de warnings**, no un `--max-warnings=0` de golpe.
- `docs/deuda-react-compiler.md` *(nuevo)* — el inventario de las ~23 advertencias con su plan de
  retiro.

**Sobre "CI sin warnings" — cómo llegar sin romper nada:**
El repo tiene hoy ~23 advertencias legítimas del React Compiler
(`set-state-in-effect`, `refs`, `immutability`, `static-components`) que la auditoría dejó como
`warn` a propósito, con una razón buena: un CI en rojo que nadie puede arreglar se aprende a
ignorar, y con él se ignoran los errores que sí importan. Poner `--max-warnings=0` hoy exige ~23
refactors de hooks en el editor, que es justo el código más frágil del proyecto.
El camino es un **trinquete**:
1. Se registra el número exacto de warnings de hoy (F1) y se fija como techo:
   `eslint . --max-warnings=<N>`. El CI falla si alguien **añade** uno nuevo.
2. Cada vez que se toca un componente por otro motivo, se arreglan sus warnings y se baja N.
3. Al llegar a 0, el flag pasa a `--max-warnings=0` de forma permanente.
Así el CI está verde y limpio desde el primer día, la deuda no crece nunca, y los refactors del
editor se hacen cuando hay pruebas E2E que los respalden (que llegan en F8).

**Criterios de aceptación:**
- [ ] Los 5 jobs pasan en verde en un PR de prueba.
- [ ] Un PR que añade un warning de ESLint **falla**.
- [ ] Un PR que reabre una política de RLS **falla** (job de base de datos).
- [ ] Un PR que cambia un píxel del perfil público **falla** (job visual).
- [ ] Un PR con un secreto en el diff **falla**.
- [ ] Documentado en `AGENTS.md` qué se exige antes de un merge.

**Riesgos:** un CI de 5 jobs es lento. Mitigación: paralelizar, cachear pnpm y los navegadores de
Playwright, y ejecutar el job visual sólo en PR (no en cada push a ramas de trabajo).

**Intervención humana:** activar la protección de rama en GitHub (`main` protegida, los 5 jobs
como checks obligatorios, sin push directo). No se puede hacer desde el repo.

---

# BLOQUE D — Rendimiento, producto y observabilidad

> **Puerta obligatoria:** ninguna fase de este bloque empieza sin F8 cerrada y las capturas de
> referencia aprobadas. El bloque D toca el render; sin el contrato de no regresión, no hay forma
> de demostrar que la UX se preservó.

## F10 · Perfil público renderizado en el servidor (con UX idéntica)

**Objetivo:** cerrar P-18, P-19, P-21. Es el punto de mayor retorno comercial de todo el plan
(§15 de la auditoría) y el único que cambia cuánta gente llega a Vibe. Hoy los metadatos ya se
generan en el servidor, pero el **contenido** sigue cargándose con `useEffect`: Google indexa un
esqueleto y `revalidate = 300` no cachea nada útil.

**Depende de:** F6 (esquema conocido, sin fallbacks), F8 (capturas aprobadas).

**Estrategia — islas, no reescritura.** `profile-client.tsx` **no se reescribe**. Se le pasan los
datos ya resueltos como props iniciales, en vez de que los busque él. Todo el estado interactivo
(pestañas, reproductor, sesión del visitante, bloqueos, reportes) se queda exactamente donde
está. Es el cambio más pequeño que consigue el objetivo.

**Archivos probables:**
- `lib/supabase-server.ts` — se le añade `fetchPublicProfilePage(username)`: perfil, bloques
  visibles y catálogo, en **una sola** ida al servidor, con `unstable_cache` y una etiqueta por
  perfil.
- `app/[username]/page.tsx` — carga los datos en el servidor y se los pasa a
  `<PerfilPublicoClient datosIniciales={...} />`.
- `app/[username]/profile-client.tsx` — acepta `datosIniciales` opcional; si viene, **no** hace
  el `useEffect` de carga; si no viene, se comporta como hoy. Cambio aditivo, reversible.
- `app/[username]/tienda/page.tsx` + `tienda-client.tsx` — mismo patrón.
- `app/[username]/opengraph-image.tsx` *(nuevo)* — imagen social generada con la foto del artista
  y, si no la hay, una composición con su nombre y el color de acento del perfil. Nunca queda sin
  imagen (P-19).
- `lib/revalidate.ts` *(nuevo)* — invalidación por etiqueta al publicar, para que el cambio se
  vea al instante y no en 5 minutos.
- `components/profile-editor.tsx` — tras `publish_profile`, invalida la etiqueta del perfil. Una
  línea; el flujo del usuario es idéntico.

**Pruebas:**
- `curl https://<dominio>/<username>` → el HTML **contiene** el nombre del artista, su bio y los
  títulos de sus canciones. Hoy no los contiene: esa es la prueba de que el arreglo es real.
- E2E de F8 **sin un solo cambio** — si hay que tocarlas, la UX cambió y el PR se rechaza.
- Visual de F8: 0 diferencias en los 4 anchos.
- Publicar un cambio y verlo reflejado en < 5 s.
- Validador de Open Graph: nombre + foto del artista, para un perfil con foto y para uno sin foto.

**Criterios de aceptación:**
- [ ] `view-source` de un perfil trae el contenido, no un esqueleto.
- [ ] La primera pintura no depende de ninguna consulta del navegador.
- [ ] Cero diferencias visuales y cero cambios en las pruebas E2E.
- [ ] La invalidación al publicar funciona.
- [ ] Un perfil sin foto igual produce tarjeta social.

**Riesgos:** **alto**, es el cambio de mayor superficie del plan. Los tres puntos de rotura
concretos: (1) hidratación desfasada si los datos del servidor y del cliente no coinciden —
mitigado porque el cliente deja de pedirlos; (2) contenido dependiente del visitante (bloqueos,
"este es tu perfil") que no debe cachearse — se queda en el cliente, explícitamente; (3) perfiles
suspendidos servidos desde caché — hay que invalidar al suspender (ver P-34, se cubre aquí).

**Intervención humana:** verificar en tu móvil real. Comprobar la tarjeta social pegando un
enlace en WhatsApp e Instagram, que es el caso de uso que motiva la fase.

---

## F11 · Feed a escala, multimedia y cuotas

**Objetivo:** cerrar P-16, P-17, P-20 y la deuda de cuotas (§21 de la auditoría).

**Depende de:** F10.

**Archivos probables:**
- `supabase/migrations/0012_descubrimiento_y_feed.sql` *(nuevo)*
  - Vista o RPC `descubrimiento_perfiles(tipo, limite, cursor)` con el `group by` **en Postgres**,
    reemplazando la agregación en el cliente sobre 500 filas (P-16).
  - Índices para keyset: `(created_at desc, id)` en las tablas del feed.
  - Vista materializada sólo si la medición lo justifica; empezar con la vista normal.
- `lib/feed/discovery.ts` — consume el RPC. La forma de `DiscoveryProfile` **no cambia**, así que
  `DiscoveryGrid.tsx` no se toca.
- `lib/feed/publicPosts.ts`, `lib/musicFeed.ts` — paginación keyset real con cursor `created_at`
  (P-17).
- `supabase/migrations/0013_cuotas.sql` *(nuevo)* — cuota de almacenamiento por perfil apoyada en
  `media_assets` (que ya guarda `bytes`): función `verificar_cuota(profile_id, bytes_nuevos)`.
- `app/api/upload-url/route.ts` — consulta la cuota antes de firmar; si se excede, 413 con
  mensaje claro. Sin cuota configurada → sin límite (compatibilidad hacia atrás).
- `lib/audio-engine.ts`, `components/feed/PlaybackControls.tsx` — **sólo verificación, no
  cambios**: el motor único ya garantiza una reproducción a la vez. Se añaden pruebas E2E que lo
  fijen como contrato (audio↔audio, audio↔vídeo, cambio rápido de pista).
- `docs/presupuesto-rendimiento.md` *(nuevo)* — LCP ≤ 2.5 s, CLS ≤ 0.10, INP ≤ 200 ms, JS inicial
  propio ≤ 200 kB comprimido (Vibe es una app, no una landing como Canodent), imagen de perfil
  ≤ 500 kB. Con las cifras medidas al lado de los objetivos.

**Sobre `images.unoptimized: true` (P-20):** se **mantiene**. Las imágenes vienen de R2 con
dimensiones variables y el editor ya las comprime en el navegador con
`browser-image-compression`. Activar el optimizador de Next añade costo por transformación en
Vercel y riesgo de cambio visual, a cambio de un beneficio que la compresión previa ya captura en
buena parte. Se revisa si el presupuesto de rendimiento lo pide, con datos.

**Pruebas:**
- Sembrar 5 000 productos y 5 000 pistas: el feed sigue respondiendo, la memoria del navegador no
  se dispara, y el descubrimiento muestra el conjunto real, no una muestra.
- Scroll infinito con contenido entrando: sin saltos ni repeticiones (keyset).
- E2E de reproducción única, en las tres combinaciones.
- Subida que excede la cuota → 413 con mensaje claro; dentro de cuota → funciona igual que hoy.

**Criterios de aceptación:**
- [ ] Cero agregaciones de más de 100 filas en el cliente.
- [ ] Paginación keyset en todas las listas infinitas.
- [ ] Nunca suenan dos fuentes a la vez, verificado por prueba automática.
- [ ] Presupuesto de rendimiento documentado y medido.
- [ ] Cero diferencias visuales.

**Riesgos:** cambiar la consulta del feed altera qué se ve primero. Mitigación: las pruebas E2E
de F8 fijan el contenido esperado con datos sembrados, así que un cambio de orden se detecta.

**Intervención humana:** decidir la cuota por perfil (sugerencia inicial: 2 GB, que en R2 cuesta
centavos y cubre de sobra a un artista real). Configurar alertas de gasto en Cloudflare y
Together AI.

---

## F12 · Observabilidad, salud y alertas

**Objetivo:** cerrar P-22 y P-23. Cuando un usuario diga "se borraron mis fotos", poder
reconstruir qué pasó.

**Depende de:** F9.

**Archivos probables:**
- `lib/log.ts` *(nuevo)* — logger estructurado (JSON: nivel, ruta, `request_id`, `user_id`,
  duración, resultado). **Nunca** registra PII, contenido de bloques, tokens ni claves. Reemplaza
  los `console.error` sueltos de las 7 rutas de API.
- Las 7 rutas de `app/api/*` — adoptan el logger. Sin cambio de comportamiento.
- `app/api/health/route.ts` *(nuevo)* — verifica que puede leer una fila trivial de Supabase y
  hacer un `HeadBucket` a R2. Devuelve `{ estado, version, dependencias }` y **no filtra nada**
  (sin nombres de bucket ni URLs internas). Rate-limitado.
- `instrumentation.ts` + `app/global-error.tsx` — integración de Sentry, **si** se aprueba (§16).
  `PLAN.md` §2.5 ya lo contemplaba, así que no es un proveedor nuevo inventado aquí. La
  alternativa sin dependencia: log drains de Vercel a un destino que elijas. Recomendación:
  empezar con logs estructurados + drain, y añadir Sentry sólo si el volumen de errores lo
  justifica — es una decisión de costo, no técnica.
- `docs/observabilidad.md` *(nuevo)* — qué se registra, qué **no** se registra nunca, cuánto se
  retiene, quién puede verlo.

**Pruebas:**
- Provocar un error en cada ruta y verificar que aparece con `request_id` y **sin** PII.
- `GET /api/health` → 200 con todo sano; apagar R2 (credencial inválida en local) → 503.
- Prueba automática de que el logger redacta: pasarle un objeto con `email`, `dni`,
  `access_token` y verificar que la salida no los contiene.

**Criterios de aceptación:**
- [ ] Cero `console.error` sin estructura en `app/api/`.
- [ ] `/api/health` refleja el estado real de ambas dependencias.
- [ ] Ningún registro contiene PII ni secretos, verificado por prueba.
- [ ] Existe al menos una alerta activa (tasa de error 5xx, o fallo de salud sostenido).

**Riesgos:** registrar de más es una fuga de privacidad, no una mejora. Por eso la prueba de
redacción es criterio de aceptación.

**Intervención humana:** decidir Sentry vs. log drains. Configurar el destino y las alertas.
Definir a quién notifican.

---

# BLOQUE E — Operación

## F13 · Staging, despliegue, rollback y backups verificados

**Objetivo:** cerrar P-24, P-25, P-26. Que exista un lugar donde probar sin arriesgar, y que el
"si algo sale mal" de `DESPLIEGUE.md` deje de ser un párrafo y sea un procedimiento probado.

**Depende de:** F9, F12.

**Archivos probables:**
- `docs/staging.md` *(nuevo)* — siguiendo el patrón de `Bancary/docs/staging.md`: proyecto
  Supabase **exclusivo** de staging, bucket R2 **exclusivo**, credenciales propias, dominio
  propio, y **jamás** datos personales reales. Tabla de variables por entorno.
- `scripts/smoke-staging.mjs` *(nuevo)* — verificación post-despliegue automatizada: `/api/health`
  responde; un perfil público sirve HTML con contenido; el `cleanup` responde 401 sin token; el
  `image-proxy` responde 400 ante un host falso; el sitemap tiene entradas. Es la versión
  ejecutable del "Paso 4 — Verificación" de `DESPLIEGUE.md`.
- `.github/workflows/staging.yml` *(nuevo)* — al mergear a `main`: desplegar a staging, aplicar
  migraciones ahí, correr el smoke. Producción **sigue siendo manual y deliberada**.
- `docs/backups.md` *(nuevo)* — qué se respalda, con qué frecuencia, dónde vive, cuánto se
  retiene, y **el registro fechado de cada prueba de restauración**.
- `docs/runbooks/` *(nuevo)*:
  - `restaurar-base.md` — restauración completa y restauración de un solo perfil.
  - `perdida-de-archivos.md` — un usuario reporta contenido borrado: cómo rastrear con
    `media_assets` + `audit_log` + logs de F12, y cómo recuperar si hay versioning en R2.
  - `incidente-de-seguridad.md` — rotación de claves (R2, anon key, tokens), contención,
    notificación bajo Ley 29733.
  - `rollback.md` — el procedimiento de §15 de este documento.
  - `takedown-dmca.md` — el SLA operativo (se completa en F14).
- `docs/rotacion-de-credenciales.md` *(nuevo)* — cierra P-12: inventario, dueño y frecuencia de
  rotación de cada credencial.

**Pruebas:**
- **Restauración probada de verdad:** tomar un backup, restaurarlo en un proyecto vacío, y
  levantar la app contra él. Registrar el tiempo que tomó. Un backup no probado no es un backup.
- El smoke corre verde contra staging tras un despliegue.
- Simulacro de rollback: desplegar, revertir, verificar que la app funciona.

**Criterios de aceptación:**
- [ ] Staging existe, aislado, con datos ficticios.
- [ ] Backups automáticos activos, con retención definida.
- [ ] **Al menos una restauración completa ejecutada y fechada.**
- [ ] Versioning o lifecycle configurado en R2 (protege contra el borrado accidental que ni F2
      previene: un `eliminar-cuenta` legítimo pero equivocado).
- [ ] Los 5 runbooks escritos y revisados.
- [ ] `RTO` y `RPO` declarados explícitamente.

**Riesgos:** un segundo proyecto de Supabase y un segundo bucket cuestan dinero. Si el
presupuesto no da, la alternativa mínima honesta es: Supabase local (F6) como entorno de
migración + un *preview deployment* de Vercel apuntando a él. Es peor, pero es infinitamente
mejor que probar contra producción. Esa decisión es tuya (§16).

**Intervención humana:** **toda esta fase.** Crear el proyecto de staging, el bucket, configurar
backups, ejecutar la restauración de prueba. Nada de esto se puede hacer desde el repositorio.

---

## F14 · Moderación operable, DMCA y privacidad completa

**Objetivo:** cerrar P-13, P-30, P-31, P-32. `0008` creó las tablas; falta la operación. Una
plataforma que aloja música de terceros sin un proceso de takedown ejecutable es un objetivo
legal fácil, y eso es tan bloqueante como cualquier bug de seguridad.

**Depende de:** F13.

**Archivos probables:**
- `app/admin/reportes/page.tsx` *(nuevo)* — cola de moderación: listar por estado, ver el
  contenido reportado, resolver con nota, suspender un perfil, marcar un takedown. Protegida por
  `ADMIN_USER_IDS` en el borde (`proxy.ts`) **y** por RLS en la base. Interfaz mínima y
  funcional, con los componentes de UI que ya existen — no es una fase de diseño.
- `app/admin/auditoria/page.tsx` *(nuevo)* — consulta del `audit_log` de `0008`.
- `supabase/migrations/0014_moderacion_operativa.sql` *(nuevo)* — estados de takedown
  (notificación → suspensión → contranotificación → restitución) con marcas de tiempo, plazos
  legales, y RLS que sólo permite a los administradores. Verificación explícita de que el
  contenido suspendido **desaparece** del feed, del sitemap y del perfil público (cierra P-34).
- `app/perfil/config/page.tsx` — botones de **exportar mis datos** y **eliminar mi cuenta**
  conectados a las funciones que `lib/moderation.ts` ya expone. Están escritas y sin usar.
- `lib/site.ts` — `LEGAL_CONTACT_EMAIL` pasa a un correo institucional (P-30).
- `components/legal/consentimiento-cookies.tsx` *(nuevo)* — banner de consentimiento que
  **de verdad** controla `@vercel/analytics` (P-31), coherente con `/legal/cookies`.
- `docs/retencion-de-datos.md` *(nuevo)* — P-32: cuánto se guarda cada cosa, incluyendo logs,
  reportes resueltos y contenido de cuentas eliminadas.
- `docs/runbooks/takedown-dmca.md` — completado con plazos reales y responsables.

**Pruebas:**
- E2E: reportar contenido → aparece en la cola → resolver → el perfil queda suspendido → el
  contenido **no** aparece en el feed, ni en el sitemap, ni en el perfil público, ni en la caché
  (F10 debe invalidar al suspender).
- Un no-administrador que pide `/admin/reportes` recibe redirect en el borde, sin HTML.
- Exportar datos devuelve un JSON completo y **sólo** de quien lo pide.
- Eliminar cuenta borra base y archivos; el perfil deja de existir; el username queda liberado o
  reservado según se decida.
- Sin consentimiento → `@vercel/analytics` no carga (verificado por ausencia de la petición).

**Criterios de aceptación:**
- [ ] Un reporte se resuelve completamente sin abrir el SQL Editor.
- [ ] El flujo de DMCA está implementado y documentado con plazos.
- [ ] La suspensión es efectiva en **todas** las superficies de lectura, incluida la caché.
- [ ] Exportación y borrado accesibles desde la interfaz (Ley 29733 arts. 19 y 20; GDPR arts. 15,
      17 y 20).
- [ ] El correo legal es institucional.
- [ ] El consentimiento de cookies controla la analítica de verdad.

**Riesgos:** un panel de administración es una superficie nueva y privilegiada. Mitigación:
protegido en el borde **y** por RLS; toda acción escribe en `audit_log`; nunca usa service role.

**Intervención humana:** crear el correo institucional. Definir los plazos del SLA de DMCA.
Revisar los textos legales con criterio propio (o asesoría) antes de publicarlos.

---

## 4. Resumen de dependencias y orden recomendado

| Fase | Depende de | Puede correr en paralelo con | Riesgo |
|---|---|---|---|
| F0 · Verificación | — | — | Bajo (sólo lectura) |
| F1 · Línea base | F0 | — | Bajo |
| F2 · Residuos de seguridad | F1 | F8 | Medio |
| F3 · Validación de esquema | F2 | F8 | **Alto** |
| F4 · CSP con nonce | F2 (idealmente F8) | — | **Alto** sin F8 |
| F5 · Anti-abuso | F2 | F8 | Medio |
| F6 · Supabase CLI | F0, F3, F5 | F8 | Medio |
| F7 · Pruebas de RLS | F6 | F8 | Bajo |
| F8 · E2E + a11y + visual | F1 | F2–F7 | Medio |
| F9 · CI empresarial | F7, F8 | — | Bajo |
| F10 · Server rendering | F6, **F8** | — | **Alto** |
| F11 · Feed y cuotas | F10 | F12 | Medio |
| F12 · Observabilidad | F9 | F11 | Bajo |
| F13 · Staging y backups | F9, F12 | — | Bajo (mucho trabajo humano) |
| F14 · Moderación y privacidad | F13 | — | Medio |

**Si tuvieras que elegir sólo tres fases:** F0 (saber qué está desplegado), F7 (pruebas de RLS) y
F10 (server rendering). La primera evita construir sobre arena, la segunda impide que la
seguridad se degrade en silencio, y la tercera es la única que cambia cuánta gente llega a Vibe.

---

## 5. Matriz de riesgos globales

| Riesgo | Probabilidad | Impacto | Mitigación | Fase |
|---|---|---|---|---|
| Las migraciones nunca se aplicaron: la base sigue abierta | **Media** | **Crítico** | F0 es bloqueante y lo primero de todo | F0 |
| El validador de bloques rechaza contenido real y rompe la publicación | Media | Alto | Modo observación una semana antes de activar | F3 |
| La CSP con nonce rompe ffmpeg.wasm o los embeds | Media | Alto | E2E de F8 como prerrequisito; retroceso inmediato disponible | F4 |
| El paso a servidor cambia la UX sin que nadie lo note | Media | Alto | Capturas visuales aprobadas antes de empezar | F8→F10 |
| Retirar los fallbacks de esquema rompe una pantalla | Media | Medio | Uno a uno, tras `db:verify`, con verificación visual | F6 |
| La limpieza de R2 borra archivos en uso | **Ya ocurrió antes** | **Crítico** | Ventana de 7 días + haystack completo + aborto ante lectura parcial | F2 |
| Un backup nunca probado no sirve cuando hace falta | Alta | **Crítico** | Restauración ejecutada y fechada como criterio de aceptación | F13 |
| El CI se vuelve lento y la gente lo saltea | Media | Medio | Jobs paralelos, caché, visual sólo en PR | F9 |
| Un takedown legítimo no se puede ejecutar a tiempo | Media | **Crítico (legal)** | Panel + SLA documentado | F14 |
| Costos de R2/Together se disparan por abuso | Media | Alto | Cuotas (F11) + alertas de gasto (humano) | F11 |
| Rotura de compatibilidad al actualizar Next 16 / React 19 | Baja | Alto | Dependabot agrupado + CI completo antes del merge | F9 |

---

## 6. Política de migraciones forward-only

Se documenta en `docs/migraciones.md` (F6). El resumen operativo:

1. **Nunca se edita una migración aplicada.** Ni para arreglar un typo. El arreglo va en una
   migración nueva. Editar una aplicada hace que la base local y la de producción diverjan en
   silencio, que es exactamente el problema que este proyecto ya vivió con
   `harden_profiles_rls.sql` → `fix_group_creation_rls.sql` → `setup_vibra.sql`.
2. **Toda migración es idempotente** (`if not exists`, `create or replace`, `drop policy if
   exists`). Ya es la convención del repo; se mantiene.
3. **Los cambios destructivos van en dos despliegues:**
   - *Expandir*: añadir la columna/tabla nueva, escribir en ambas, desplegar el código que lee de
     las dos. Nadie se rompe.
   - *Contraer*: en una migración posterior, cuando el código viejo ya no corre, eliminar lo
     viejo. `0003` (que hace `drop column` de `legal_settings` y `draft_content`) es el ejemplo de
     lo que **no** se debe repetir: fue necesario y correcto en su momento, pero dejó el código
     anterior sin poder volver atrás, como dice `DESPLIEGUE.md`.
4. **Orden de despliegue:** migración primero, código después. El código nuevo debe tolerar el
   esquema viejo durante el intervalo (lo que hoy hacen los fallbacks; la diferencia es que será
   deliberado y temporal, no permanente).
5. **Toda migración se prueba en tres lugares antes de producción:** Supabase local
   (`db:verify`), CI (`test:db`), staging.
6. **Nada se ejecuta a mano en el SQL Editor de producción.** El SQL Editor pasa a ser una
   herramienta de sólo lectura para diagnóstico.

---

## 7. Despliegue y rollback

**Despliegue normal (una fase):**
1. PR con los 5 jobs de CI en verde.
2. Merge a `main` → despliegue automático a **staging** + migraciones de staging + smoke.
3. Verificación manual en staging del flujo tocado por la fase.
4. Backup de producción (Supabase → Database → Backups).
5. Migraciones de producción, una por una, verificando cada una.
6. Promoción del despliegue en Vercel.
7. `scripts/smoke-staging.mjs` apuntado a producción.
8. Observar métricas y errores 30 minutos (F12).

**Rollback:**

| Qué falló | Acción | Tiempo |
|---|---|---|
| Sólo código | Promover el despliegue anterior en Vercel | < 2 min |
| Código + migración **aditiva** | Promover el anterior; la migración se queda (es compatible) | < 5 min |
| Código + migración **destructiva** | Restaurar el backup **y** promover el anterior | Según §13; por eso las destructivas van en dos pasos |
| Sólo datos corruptos | Restaurar sólo las tablas afectadas (runbook `restaurar-base.md`) | Variable |

**Regla de oro, ya aprendida en `DESPLIEGUE.md`:** el código antiguo no funciona contra una base
ya migrada. Por eso la política de dos pasos de §6 no es burocracia — es lo que hace que el
rollback de código, solo, siga siendo posible.

---

## 8. Acciones que requieren intervención humana o credenciales

Lo que yo no puedo hacer. Ordenado por urgencia.

| # | Acción | Fase | Por qué es humana | Bloquea |
|---|---|---|---|---|
| 1 | Correr los diagnósticos y pegar el resultado | F0 | No tengo acceso a tu base | **Todo** |
| 2 | Confirmar/aplicar las migraciones `0002`–`0009` | F0 | Sólo tú corres SQL en tu proyecto | **Todo** |
| 3 | Configurar `ADMIN_USER_IDS` en Vercel y `.env.local` | F0 | Es tu UUID de Supabase | F2, F14 |
| 4 | Configurar `NEXT_PUBLIC_SITE_URL` con el dominio definitivo | F0 | Decisión de producto | F10 (SEO) |
| 5 | Configurar `TOGETHER_API_KEY` | F0 | Credencial de pago tuya | Generación de imágenes |
| 6 | Decidir la política de `orders`/`order_items`/`donations` | F0 | Depende de tu modelo de negocio | F7 |
| 7 | Definir dueños de `CODEOWNERS` | F1 | Decisión organizativa | F9 |
| 8 | Instalar Docker Desktop + `supabase link` | F6 | Requiere tu máquina y tu proyecto | F6, F7 |
| 9 | **Aprobar las capturas visuales de referencia** | F8 | Definen oficialmente "así se ve Vibe" | F10 |
| 10 | Activar protección de rama en GitHub | F9 | Sólo desde la configuración del repo | Que el CI sea puerta real |
| 11 | Decidir: Sentry o log drains de Vercel | F12 | Decisión de costo | F12 |
| 12 | Decidir: captcha con proveedor o confirmación de correo | F5 | Proveedor nuevo vs. función existente | F5 |
| 13 | Crear el proyecto Supabase y el bucket R2 de **staging** | F13 | Cuesta dinero; es tu cuenta | F13 |
| 14 | Activar backups + **ejecutar una restauración de prueba** | F13 | Sólo tú accedes a la consola | F13 |
| 15 | Activar versioning/lifecycle en R2 | F13 | Configuración de Cloudflare | F13 |
| 16 | Configurar alertas de gasto (R2, Together AI, Vercel) | F11/F12 | Cuentas de facturación tuyas | Control de costos |
| 17 | Crear un correo institucional para avisos legales | F14 | Registro de dominio/correo | F14 |
| 18 | Definir plazos del SLA de DMCA y revisar los textos legales | F14 | Decisión legal, posiblemente con asesoría | F14 |
| 19 | Definir la cuota de almacenamiento por perfil | F11 | Decisión de producto y costo | F11 |
| 20 | Definir RTO/RPO y la retención de datos | F13/F14 | Decisión de negocio | F13, F14 |

---

## 9. Lo que este plan deliberadamente NO hace

Dicho explícito, para que no lo des por cubierto:

- **No reescribe `block-inspector.tsx` (2 657 líneas) ni `profile-editor.tsx` (1 111).** Son
  grandes y se beneficiarían de una división, pero es el código más frágil del proyecto y
  dividirlo sin necesidad funcional es riesgo puro. Se hará cuando una funcionalidad lo pida, con
  las pruebas E2E de F8 ya puestas.
- **No arregla las ~23 advertencias del React Compiler de golpe.** Se congelan con un trinquete y
  se retiran cuando se toque cada componente. La razón es la misma que dio la auditoría: un CI en
  rojo que nadie puede arreglar se aprende a ignorar.
- **No introduce Prettier ni reformatea el repositorio.** Ver F1.
- **No cambia de proveedor en nada.** Ni Redis para rate limits (Postgres basta), ni otro
  almacenamiento, ni otro hosting.
- **No activa el optimizador de imágenes de Next.** Ver F11.
- **No añade funcionalidad de producto nueva.** El panel de administración de F14 no es una
  funcionalidad nueva: es lo que hace ejecutable lo que las páginas de `/legal` ya prometen.
- **No toca el diseño, el copy ni los flujos.** Si una fase produce una diferencia visual, la
  fase está mal implementada.

---

## 10. Definición de "hecho" — aplica a toda fase

Una fase se declara cerrada sólo cuando **todo** esto se cumple:

- [ ] Los 5 jobs de CI en verde (una vez F9 exista).
- [ ] `pnpm qa` limpio en local.
- [ ] Pruebas nuevas o actualizadas para el comportamiento tocado.
- [ ] Cero diferencias visuales, o diferencia aprobada explícitamente por ti con la captura al
      lado.
- [ ] Migraciones probadas en local → CI → staging → producción, en ese orden.
- [ ] Documentación actualizada (runbook, `docs/`, o `AGENTS.md` según corresponda).
- [ ] Rollback verificado o descrito paso a paso.
- [ ] Reporte de cierre con: `HEAD`, `git status --short`, archivos no rastreados, y el cambio en
      el número de pruebas (convención tomada de `gnomos/AGENTS.md`, que es exactamente la
      información que evita sorpresas al consolidar).

---

## 11. Lecturas de referencia usadas

Sólo como referencia; ninguno de estos repositorios se modificó ni se modificará.

- **Canodent** — `AGENTS.md` (precedencia y gates obligatorios), `.github/workflows/quality.yml`
  (gitleaks fijado por digest, `npm audit`, e2e en CI), `tests/visual/capture.spec.ts` (la
  solución al problema de referencias visuales entre Windows y Linux, que Vibe va a tener igual),
  `docs/performance-budget.md`, `docs/operations.md`.
- **Bancary** — `.github/workflows/quality.yml` (gitleaks + `git diff --check`),
  `vitest.db.config.mjs` y `test/database/*` (14 archivos de pruebas de base y RLS: el modelo
  directo para F7), `scripts/verify-db.mjs`, `supabase/migrations/` (34 migraciones con marca de
  tiempo), `docs/staging.md` (la tabla de variables por entorno que F13 replica).
- **gnomos** — `AGENTS.md`: trabajar un slice a la vez, validar antes de persistir, transacciones
  y bloqueos donde la concurrencia lo exige, preferir pruebas conductuales sobre inspección de
  texto, y reportar `HEAD` + estado del árbol antes de declarar listo. Ese último punto es el
  origen de la §10.

---

## 12. Primer paso concreto

Cuando quieras arrancar:

1. Corre `supabase/_diagnostico_parte2.sql` en el SQL Editor y pégame los 4 resultados.
2. Dime si las migraciones `0002`–`0009` ya corrieron, y cuándo.
3. Confírmame qué variables de entorno están puestas hoy en Vercel.

Con eso cierro F0 y puedo escribir `docs/estado-desplegado.md`, `AGENTS.md`, `.env.example` y el
diagnóstico complementario en el mismo día — que es todo F1 salvo la medición, que sale de correr
los comandos.

En paralelo, y sin depender de nada tuyo, puedo empezar **F8** (Playwright, axe, capturas de
referencia): es la fase que más protege todo lo que viene después y la única que no necesita ni
una credencial.
