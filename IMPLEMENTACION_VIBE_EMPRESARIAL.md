# Implementación del Plan Empresarial — registro de ejecución

Registro de lo **completado y verificado localmente**, de lo que quedó **bloqueado
por una acción estrictamente humana**, y de la evidencia real de cada gate. Sigue
la precedencia de [`AGENTS.md`](AGENTS.md) y el orden de fases de
[`PLAN_VIBE_EMPRESARIAL.md`](PLAN_VIBE_EMPRESARIAL.md).

- **Fecha:** 31 de agosto de 2026 (última sesión: cierre de **F8 autenticado** y de la mitad restante de **F4**).
- **Base al iniciar el bloque de cierre de base:** `6fb43b8`.
- **Producción verificada:** Supabase `0000`–`0017` y Vercel, 16 de agosto de 2026.
  `0018` está escrita y verde en local; **todavía no aplicada en producción**.
- **Entorno:** Windows 11 (26200) · Node v24.16.0 · pnpm 11.10.0 · Next 16.2.12 ·
  TypeScript 5.7.3 · Vitest 4.1.10 · Playwright 1.62.

> Esta sesión **retomó** el árbol no commiteado que dejó una auditoría
> interrumpida. Se revisó pieza por pieza, se corrigió lo que estaba roto, se
> borraron los artefactos que no debían versionarse, y se llevó hasta el final
> todo lo que se podía terminar. En el bloque posterior se autorizó la CLI,
> se levantó Docker y se cerraron también el baseline, las pruebas de base y el
> despliegue de `0010`–`0012`.

---

## 1. Gates obligatorios — resultado real

| Gate | Comando | Resultado |
|---|---|---|
| Tipos | `pnpm typecheck` | ✅ **0 errores** |
| Lint | `pnpm lint` (`--max-warnings=22`) | ✅ **0 errores, 22 warnings** (exit 0) |
| Pruebas unitarias | `pnpm test` | ✅ **20 archivos, 259 pruebas** |
| QA agregado | `pnpm qa` | ✅ verde de punta a punta |
| Build | `pnpm build` | ✅ **exit 0** |
| **E2E + axe** | `pnpm test:e2e` | ✅ **92 pruebas verdes** (chromium escritorio + móvil) |
| **E2E autenticado** | `pnpm test:e2e:auth` | ✅ **26 pruebas verdes** contra Supabase local (escritorio + móvil) |
| **Regresión visual** | `pnpm test:visual` | ✅ **24 instantáneas ARIA verdes** (el feed entró en esta sesión), 24 capturas de píxeles omitidas (esperan aprobación humana) |
| **Visual del editor** | `pnpm test:visual:auth` | ✅ **4 instantáneas ARIA verdes** (390/768/1024/1440) |
| **Smoke** | `node scripts/smoke-staging.mjs` | ✅ **7 de 7 en verde** contra un servidor local (§2.11) |
| **Reconstrucción DB** | `pnpm db:verify` | ✅ `0000`–`0018` desde cero; `db lint` sin errores |
| **Pruebas DB** | `pnpm test:db` | ✅ **110 de 110**, sin ningún `todo`, en 7 archivos (2026-08-17) |
| **Paridad producción** | `supabase db diff --linked --schema public,private` | ✅ sin diferencias (2026-08-16, antes de `0018`) |

**Cambio en el número de pruebas:** de **68 en 7 archivos** (línea base `6ffa555`)
a **259 unitarias en 20 archivos + 110 de base + 92 E2E públicas + 26 E2E
autenticadas + 28 instantáneas ARIA** = **515 pruebas ejecutables**, todas
verdes.

La cifra de base subió de **21 a 110** el 2026-08-17 (§2.18); las 26
autenticadas y las 4 del editor son del 2026-08-31 (§2.19). Las menciones
anteriores a "13" y "21 pruebas de base" quedaron obsoletas y se corrigieron en
este documento.

**Los gates de base de datos ya están cerrados.** Docker, el baseline y las
credenciales dejaron de ser bloqueos el 2026-08-16.

---

## 2. Lo que se completó

### 2.1 F1 · Línea base e higiene — cerrada
`AGENTS.md`, `.github/CODEOWNERS`, `.github/dependabot.yml`,
`.github/pull_request_template.md`, `.env.example` (14 variables, sin valores),
`docs/linea-base.md`, `docs/deuda-react-compiler.md`. Trinquete de lint en 22.

### 2.2 F2 · Residuos de seguridad — cerrada
- **P-04** `cleanup-orphaned-files` ya no devuelve `error.message`.
- **P-05** haystack con el cliente autenticado del admin, incluye
  `profile_private.draft_content`, cruza contra `media_assets` con ventana de
  gracia de 7 días (`lib/cleanup-orphans.ts`, probado sin red) y **aborta** si
  no pudo leer alguna fuente.
- **P-06** `image-proxy` cuenta bytes reales (`lib/stream-limit.ts`) y responde 413.
- **P-07** `identificarSolicitante()` sólo confía en `x-forwarded-for` con proxy
  de confianza.

### 2.3 F3 · Validación de esquema del contenido — desplegada
`lib/blocks-schema.ts` (valida forma, no contenido) + modo observación por
defecto + `supabase/migrations/0010_validar_bloques.sql`, aplicada y verificada
en producción.

### 2.4 F5 · Anti-abuso en las escrituras del navegador — desplegada
`supabase/migrations/0011_limites_de_escritura.sql` + `lib/rate-limit-errors.ts`
adoptado en comentarios, preguntas, reportes y bloqueos. La migración está
aplicada y sus cinco triggers se verificaron en producción.

### 2.5 F4 · CSP con nonce y aislamiento — cerrada localmente

- `proxy.ts` genera un nonce criptográfico distinto por documento, lo inyecta
  en la request y en la response y conserva la renovación de cookies de
  Supabase en la misma petición.
- `lib/csp.ts` construye la política fail-closed: `script-src` no contiene
  `unsafe-inline`; `unsafe-eval` sólo existe en desarrollo; ffmpeg conserva
  `blob:`/`wasm-unsafe-eval`; imágenes, conexiones e iframes se acotan a los
  proveedores que Vibe usa.
- `app/layout.tsx` lee el nonce y el script bloqueante de tema lo recibe sin
  producir desajustes de hidratación. COOP es `same-origin`; CORP es
  `same-site`, salvo la imagen Open Graph que debe poder consumirse desde
  WhatsApp/Slack/Discord y sale `cross-origin`.
- `tests/e2e/csp.spec.ts` comprueba nonces únicos, las cabeceras y **cero
  violaciones CSP** en legal, feed y perfil, escritorio y móvil. La auditoría
  detectó y corrigió una primera versión que activaba el overlay de Next y
  bloqueaba un botón móvil.
- La política permite de forma acotada los dos CDN regionales que devuelve el
  oEmbed de TikTok para las portadas de créditos. Una prueba conductual carga
  ambas imágenes y abre la pestaña Publicaciones; hosts imitadores, HTTP y un
  comodín global siguen bloqueados.

### 2.6 F8 · E2E, accesibilidad y regresión visual — **cerrada localmente**

Es el cambio más grande de esta sesión, y el que desbloqueó todo lo demás.

**El problema que había:** las specs interceptaban la red del navegador con
`page.route`. Eso sólo cubre la mitad de la aplicación: en cuanto una consulta
sale del servidor (`generateMetadata`, sitemap, Server Components) el navegador
no la ve y no hay nada que interceptar. Por eso las pruebas de contenido estaban
marcadas como "requieren Supabase local" y se saltaban solas.

**La solución:** `tests/e2e/fixtures/servidor-supabase.mjs`, un **PostgREST de
mentira** (~340 líneas) que sirve `tests/e2e/fixtures/datos.json`.
`playwright.config.ts` lo arranca y le apunta `NEXT_PUBLIC_SUPABASE_URL`, así
que **las dos mitades** —render en servidor y navegador— reciben los mismos
fixtures deterministas. Sin Docker, sin credenciales, sin un solo dato real.
Implementa el subconjunto de PostgREST que la aplicación usa: `select` con
recursos embebidos y `!inner`, filtros por operador, `or`, `order`, `limit`,
`offset`, la negociación de "un solo objeto" de `.maybeSingle()`, y la RPC
`descubrimiento_perfiles`.

Con eso, **ya no hay ni una prueba saltada por falta de datos**:

| Spec | Qué congela |
|---|---|
| `perfil-publico.spec.ts` | HTML del servidor con contenido; **render sin JavaScript**; metadatos sociales; 404 real; perfil suspendido; sitemap sin suspendidos; axe en perfil y tienda |
| `feed.spec.ts` | pista pública en el feed; **nada de un perfil suspendido**; foco con teclado; axe |
| `invariantes-publicas.spec.ts` | 401 en `cleanup`/`delete-file`/`upload-url`/`eliminar-cuenta`; 400 en `image-proxy`; robots y sitemap; cabeceras de seguridad |
| `auth.spec.ts` | redirección en el borde de las rutas protegidas |
| `legal-a11y.spec.ts` | axe en las 6 páginas legales y el login |
| `health.spec.ts` | contrato de `/api/health` sin filtrar internos |
| `tests/visual/capture.spec.ts` | estructura ARIA de 5 páginas en 4 anchos |

**Dos violaciones de accesibilidad reales, encontradas por la suite y
corregidas** (ninguna cambia un píxel; detalle en `docs/accesibilidad.md`):
1. `/legal/cookies`: región scrolleable sin foco de teclado (WCAG 2.1.1, seria).
2. Riel de filtros del feed en móvil: `role="tablist"` con hijos que no son
   pestañas (WCAG 1.3.1, **crítica**).

**Capa visual en dos niveles**, con el patrón que resuelve el problema
Windows/Linux: la instantánea **ARIA** es determinista, se versiona como texto y
se compara en todos los sistemas (20 referencias generadas y verdes); la capa de
**píxeles** lleva la plataforma en el nombre del archivo y **se omite** mientras
no exista una referencia aprobada. Generarlas es `pnpm test:visual:update`, y es
una decisión humana porque definen oficialmente cómo se ve Vibe.

### 2.7 F9 · CI empresarial — al día con lo que existe
`.github/workflows/ci.yml`: `permissions: contents: read`, `concurrency`,
`timeout-minutes`, job de **gitleaks**, job de **calidad** (audit bloqueante →
typecheck → lint con trinquete → test → build → `git diff --check`), job de
**E2E**, job de **regresión visual (capa ARIA)** y job de **base de datos y
RLS**. Los cuatro corren de verdad, sin credenciales.

> **Corrección (2026-08-17).** Este documento afirmaba que el job de base de
> datos seguía con `if: false`. Era falso: `.github/workflows/ci.yml` no tiene
> ese `if` en ninguna parte, y el PR de F7 lo demostró — el job levantó Supabase
> en el runner, aplicó `0000`–`0018` y corrió las 110 pruebas de base en 1 m 48 s.
> **Los cinco jobs ejecutan.**

Todas las acciones externas están fijadas a un commit SHA inmutable;
`pnpm audit --audit-level=high` sale 0 (quedan 7 moderadas y 1 baja).

> **Actualización (2026-09-04) — la puerta ya es puerta.** `main` quedó
> protegida con los cinco jobs como checks obligatorios (§8.1 del plan), así que
> el CI dejó de ser informativo y pasó a bloquear de verdad.
>
> Lo atrapó de inmediato. El primer PR que cruzó la puerta se puso en rojo en
> «Auditoría de dependencias» por **dos ALTAS nuevas**, no por deuda heredada:
> este mismo job salió verde en `main` el 2026-08-16.
>
> - **browserslist 4.28.6 → 4.28.8** (`GHSA-c83g-rgw3-j3cx`,
>   `GHSA-73wf-gq98-2v4g`). Transitiva vía `@babel/core`, sin ningún override
>   que la cubriera.
> - **fast-uri 4.1.2 → 3.1.7** (cuatro avisos, todos en la rama 4.x). La causa
>   no era el selector del override sino su **destino**: `fast-uri@>=3.0.0`
>   apuntaba a `">=3.1.5"`, un rango **sin tope superior**, así que el único
>   consumidor real —`ajv@8.20.0`, que declara `fast-uri: ^3.0.1`— terminaba
>   resuelto en una major 4.x que nunca pidió, y justo la vulnerable. Acotar el
>   destino a la misma major que el selector lo devuelve a 3.1.7.
>
> La lección para el resto del bloque `overrides` de `pnpm-workspace.yaml`: un
> destino sin tope superior puede empujar una dependencia a una major que su
> consumidor no pidió, y ahí los avisos de esa major nueva entran sin que ningún
> override los vea.

### 2.8 F10 · Perfil público renderizado en el servidor — **cerrada localmente**

Cierra **P-18**, **P-19** y **P-21**, con la estrategia de islas del plan: el
componente cliente **no se reescribió**.

- `lib/supabase-server.ts` → `fetchPublicProfilePage(username)`: perfil, bloques
  y catálogo en una sola ida, en paralelo, memorizada con `unstable_cache` y
  **etiquetada por perfil**.
- `app/[username]/page.tsx` y `app/[username]/tienda/page.tsx` resuelven en el
  servidor y pasan `datosIniciales`.
- `profile-client.tsx` / `tienda-client.tsx` aceptan esa prop **opcional**: si
  viene, calculan el estado inicial en el primer render con **las mismas
  funciones de mapeo que ya usaban** (`dbBlockToBlock`, `rowToProduct`,
  `rowToService`) y no hacen el `useEffect` de carga. Si no viene —Supabase
  caído en el servidor— se comportan exactamente como antes. Revertir la fase es
  quitar una prop.
- `app/[username]/opengraph-image.tsx` *(nuevo)*: tarjeta social compuesta. Un
  artista **sin foto** ya no comparte un enlace sin imagen (P-19).
- `app/acciones/revalidar-perfil.ts` *(nuevo)*: Server Action que invalida la
  etiqueta al publicar, para que el artista vea su cambio al instante y no en 5
  minutos. Best-effort: nunca convierte un fallo de caché en un fallo de
  publicación.
- Un username inexistente devuelve **404 de verdad** (antes: 200 con el texto
  "Artista no encontrado", un soft 404 que Google indexa igual).

**Evidencia de que el arreglo es real**, no una afirmación: dos pruebas cargan
el perfil y la tienda **con JavaScript deshabilitado** y verifican que el nombre
del artista, su lema y su single **se ven**. Sin hidratación posible, lo que se
ve es lo que mandó el servidor.

### 2.9 F11 (parcial) · Feed, agregación y paginación
- **P-16** — `supabase/migrations/0012_descubrimiento_y_feed.sql` *(nuevo)*:
  `descubrimiento_perfiles(tipo, limite)`, `security invoker`, con el `group by`
  en Postgres y excluyendo perfiles suspendidos e ítems inactivos.
  El límite público queda acotado a 100 aunque un cliente pida más.
  `lib/feed/discovery.ts` la usa **si existe** y cae a la agregación anterior si
  no, así que la migración se puede aplicar antes o después del código.
- **P-17** — `lib/feed/keyset.ts` *(nuevo, probado)*: cursor `(created_at, id)`
  con desempate, y `fetchAllPublicFeed`/`fetchPublicPosts` aceptan `cursor`. Las
  consultas pasan a tener un **orden total**, sin el cual una paginación por
  cursor se cuelga repitiendo el mismo bloque. Los índices que la hacen barata
  están en `0012`.
- **P-20** — `images.unoptimized` se mantiene, por la decisión ya razonada del
  plan (§F11).

### 2.10 F12 (parcial) · Observabilidad y salud
- `lib/log.ts` (probado): JSON estructurado con redacción recursiva de PII,
  tokens, claves y contenido, incluso cuando aparecen incrustados en el texto
  de una excepción o una URL firmada. No registra pilas con rutas locales.
  **Cero `console.*` en `app/api/`** (verificado).
- `app/api/health/route.ts`: 200/503 según Supabase y R2, con timeout de 3 s,
  rate limit y `no-store`. **No filtra** bucket, URL ni detalle.
- **P-02**: `generate-image` responde 503 con mensaje claro si falta
  `TOGETHER_API_KEY`.

### 2.11 F13 (parcial) · Smoke ejecutable y verificado
`scripts/smoke-staging.mjs` dejó de ser un archivo que nadie corrió. Se ejecutó
contra un servidor local con los fixtures y devolvió **7 de 7 en verde**:

```
✅ GET /api/health responde y reporta estado — status 503, estado=degradado (aceptado)
✅ GET /api/health no filtra internos — limpio
✅ POST /api/cleanup-orphaned-files sin sesión → 401
✅ GET /api/image-proxy con host no permitido → 400
✅ GET /sitemap.xml tiene entradas — status 200
✅ GET /robots.txt responde — status 200
✅ GET /artista_prueba sirve HTML con contenido (render server, F10) — 39 023 bytes
Smoke OK: 7 chequeos en verde.
```

`SMOKE_PERMITIR_DEGRADADO=1` acepta un health en 503 **sólo** cuando falta una
dependencia a propósito (el entorno local no tiene R2). Contra producción,
"degradado" sigue siendo un fallo ruidoso.

### 2.12 P-34 · Suspensión efectiva en todas las superficies de lectura
Cuatro capas, todas con prueba:

| Superficie | Cómo se aplica | Prueba |
|---|---|---|
| Perfil público y tienda | `fetchPublicProfilePage` → 404 antes de renderizar y antes de cachear | E2E |
| Sitemap | se pide `is_suspended` y se filtra; si el select falla, se sirven sólo las rutas estáticas | E2E |
| Feed de pistas y publicaciones | filtro por `profiles.is_suspended` | E2E |
| Descubrimiento (productos/servicios) | filtro en `aggregate()` **y** en el RPC de `0012` | unitaria + E2E |

### 2.13 P-03 · Las dos pantallas rotas del panel
`/perfil/pedidos` y `/perfil/dashboard` consultaban `order_items` (que no
existe) y mostraban **el texto crudo de Postgres al usuario**:
`relation "public.order_items" does not exist`. Ahora `lib/errores-de-consulta.ts`
(probado, 10 casos) traduce el error a la voz del producto sin filtrar nombres
de tablas ni de esquemas, y el dashboard sigue mostrando el resto de sus cifras
en vez de cortarse entero.

Esto **no** decide la pregunta de producto —implementar pedidos o retirar las
pantallas—, que sigue siendo tuya (§8 #6 del plan). Sólo deja de mentirle al
usuario mientras tanto.

### 2.14 F14 (parcial) · Privacidad operable sin inventar privilegios

- `components/zona-datos-personales.tsx` conecta la exportación JSON y la
  eliminación irreversible de cuenta desde `/perfil/config`; la ruta de
  borrado elimina primero los objetos inventariados en R2 y después la cuenta.
- `components/legal/consentimiento-cookies.tsx` mantiene Vercel Analytics
  apagado hasta una aceptación explícita, recuerda aceptar/rechazar de forma
  fail-closed y funciona con teclado. Tiene 11 casos unitarios y 14 ejecuciones
  E2E (7 conductas × escritorio/móvil).
- La suspensión ya desaparece de perfil, tienda, feed y sitemap (§2.12).
- El panel `/admin/reportes` no se improvisó: `ADMIN_USER_IDS` sólo existe en
  el entorno de Vercel y no puede convertirse honestamente en una política RLS.
  F14 se cierra cuando se apruebe cómo representar administradores en Postgres,
   junto con el correo y los plazos institucionales del takedown.

### 2.15 F6 · Compatibilidad temporal de esquema — retirada

- `musicFeed`, `publicPosts`, `discovery` y `catalog` ya no encadenan consultas
  contra columnas antiguas ni reintentan escrituras con payloads incompletos.
- El descubrimiento usa exclusivamente el RPC agregado de `0012`; desapareció
  la agregación limitada a 500 filas en JavaScript.
- Las pantallas directas de productos y servicios escriben el esquema canónico
  completo o muestran el error real: nunca informan éxito después de guardar
  sólo una parte.
- El contrato del RPC conserva 8 pruebas unitarias. Feed, tienda y perfil
  conservaron sus 88 pruebas E2E y sus 20 instantáneas ARIA.

### 2.16 F0/F5/F14 · Security Advisor y operaciones privilegiadas — desplegada

- `0013_endurecer_advisors_supabase.sql` mueve `citext` a `extensions` y el
  respaldo con borradores/datos legales a `private`, sin borrar una sola fila.
- Las tablas internas tienen políticas `RESTRICTIVE false/false` y privilegios
  directos revocados. `0014` explicita el mismo cierre sobre el respaldo
  privado. El Security Advisor quedó en **0 errores y 0 infos**.
- Las operaciones privilegiadas de rate limit y borrado de cuenta viven fuera
  del esquema expuesto; `public` sólo contiene wrappers `security invoker`.
- El cliente ya no elige cupo/ventana del contador y las rutas sensibles fallan
  cerradas si Postgres no responde. La prueba detectó y corrigió además que el
  borrado podía dejar un perfil individual huérfano.
- Queda **1 warning externo**: protección de contraseñas filtradas. La
  organización figura como Free y Supabase ofrece esta función desde Pro; no
  se activó un gasto ni se fingió que el aviso estaba resuelto.

### 2.17 F0/F11 · Portada y contrato PostgREST — desplegada

- `0015` restaura la relación declarativa entre `profile_blocks` y `profiles`
  que exige el feed público; la clave foránea queda `NOT VALID` para proteger
  las escrituras nuevas sin bloquear el despliegue por datos históricos.
- `0016` recarga de forma versionada la caché de esquema de PostgREST.
- `0017` añade la marca temporal que la consulta canónica ya ordenaba, junto
  con el índice keyset de publicaciones, y vuelve a recargar la caché.
- La prueba de base ejecuta el mismo join y orden de la portada. Producción
  responde `200` en `/` y el smoke posterior quedó **6 de 6 en verde**.

### 2.18 F7 · Pruebas de RLS y de base — **cerrada** (2026-08-17)

La suite de base pasó de **21 casos en 2 archivos** a **110 en 7**, sin ningún
`todo`. Cinco archivos nuevos cubren lo que el plan pedía en §F7:
`limites.test.ts`, `publicacion.test.ts`, `rls-feed-y-comentarios.test.ts`,
`rls-media.test.ts` y `rls-moderacion.test.ts`.

**Lo que valió la pena: la primera corrida real destapó tres defectos que
ninguna lectura del SQL habría encontrado.** Los tres viven en migraciones ya
aplicadas en producción, así que el arreglo va —forward-only— en
`supabase/migrations/0018_corregir_concurrencia_y_suspension.sql`:

| Defecto | Dónde estaba | Qué pasaba de verdad |
|---|---|---|
| `pg_catalog.greatest` no existe | `0013`, contador distribuido | `GREATEST` es una construcción del analizador, no una función: no se puede calificar por esquema. El error `42883` saltaba **sólo en la rama que rechaza la petición**. Dentro del cupo funcionaba; al topar el límite reventaba. |
| Conflicto lógico marcado como reintentable | `0010`, `publish_profile` v3 | `conflicto_de_version` viajaba con `errcode = serialization_failure` (40001), que significa "reintenta". PostgREST reintentaba una y otra vez un conflicto **permanente**: 30 s de espera para la prueba y para el artista con una pestaña vieja. Ahora es `PT409` → **409 Conflict inmediato**. El texto que consume `profile-editor.tsx` no cambió. |
| El dueño podía levantarse su propia suspensión | `profiles_update_owner` | RLS no distingue columnas y la política autoriza la fila entera: un perfil suspendido por takedown mandaba `is_suspended = false` por PostgREST. La moderación era decorativa. |

**La corrección de la suspensión, en detalle.** Un trigger `before update` sobre
`profiles` veta cambios en `is_suspended`, `suspended_reason` y `suspended_at`
cuando el rol efectivo es `anon` o `authenticated`. Se eligió trigger y no
privilegios por columna (`grant update (col, …)`) porque estos obligan a
enumerar cada columna presente y futura: la primera que se olvide rompe el
editor en silencio. Ninguna pantalla de Vibe escribe esas tres columnas
—verificado en `app/`, `lib/` y `components/`—, así que la UX no cambia; una
prueba lo fija editando el perfil y publicando **durante** la suspensión.

**Sin service role en el runtime.** La excepción legítima no es "la app con más
privilegios" sino "una sesión que no llegó por la Data API": el backoffice del
runbook de takedown, la CLI, o el rol de moderación que llegue. El hueco de F14
ya está escrito: `private.es_admin(uuid)` existe como talón que devuelve `false`
y se reemplaza con `create or replace` sobre `private.admin_users` sin tocar el
trigger ni una sola política.

**Higiene de la suite.** La service role aparece exactamente en tres sitios:
crear el usuario efímero, borrarlo, y montar/deshacer el escenario de takedown.
**Ninguna aserción de permisos la usa** — todas van con el JWT del usuario o sin
sesión, que es como habla la aplicación.

**Evidencia real (2026-08-17):**

```
pnpm db:verify   → 0000–0018 desde cero, db lint sin errores
pnpm test:db     → 7 archivos, 110 pruebas, 110 verdes, 0 todo   (9.73 s)
pnpm test:db     → repetido: 110 verdes                          (8.14 s)
pnpm qa          → typecheck 0 errores · lint 0 errores, 22 warnings · 221 unitarias
pnpm build       → exit 0
git diff --check → limpio
```

Las dos pruebas de publicación que antes agotaban los 30 s de timeout ahora
resuelven junto al resto: la suite entera baja de "cuatro fallos y minuto y
medio" a **menos de diez segundos en verde**. Ése es el efecto medible de quitar
el `serialization_failure`.

### 2.19 F8 · E2E autenticado y F4 · la subida en la CSP — cerradas (2026-08-31)

El bloqueo humano **G** del §4 decía que la accesibilidad del editor «exige una
sesión autenticada real» y que el servidor de fixtures es de sólo lectura y sin
auth *a propósito*. Las dos cosas eran ciertas; la conclusión no. La respuesta
no era falsificar un JWT —eso sí habría exigido reimplementar GoTrue o
versionar una credencial— sino **usar el Supabase local que `pnpm test:db` ya
levanta**.

`playwright.auth.config.ts` (nuevo) hace exactamente eso: sesión real por
formulario, base real con RLS encendida, y **R2 como única frontera simulada**.
Lo que NO se simula, a propósito: la autenticación, la base, el rate limit,
`/api/upload-url` ni RLS. Simular eso sería probar el mock.

**Tres defectos reales en la primera corrida. Dos son de producción.**

| # | Defecto | Por qué nadie lo había visto |
|---|---|---|
| 1 | **Publicar estaba roto para todo perfil individual.** `handlePublish` hacía `upsert({user_id, display_name, bio}, {onConflict:"user_id"})` sin `username`, columna `NOT NULL` sin valor por defecto desde `0006`. PostgREST lo traduce a `INSERT ... ON CONFLICT`, y Postgres valida los NOT NULL al **armar la fila candidata**, antes de detectar el conflicto: fallaba con `23502` aunque el perfil ya existiera. | Publicar exige sesión, y no había ni una prueba automática autenticada. |
| 2 | **La CSP bloqueaba todas las subidas.** El SDK de S3 firma en estilo *virtual-hosted* (`https://<bucket>.<endpoint>/…`), pero `connect-src` sólo listaba el origen desnudo de `R2_ENDPOINT`. El navegador rechazaba el PUT con "Refused to connect" y el editor lo reportaba como `TypeError: Failed to fetch`. | La CSP con nonce se desplegó el 2026-08-16 y ninguna prueba automática subía un archivo. |
| 3 | **Tres violaciones críticas de accesibilidad** en el inspector: los 56 campos sin nombre accesible (`label`) y los dos selectores de ubicación tampoco (`select-name`). | Mismo motivo que #1. |

**Cómo se corrigió cada uno**

1. `resolveOwnProfileId`, el helper canónico del repositorio para "encuentra mi
   perfil, y si no existe créalo bien". Además ahorra una escritura: para un
   perfil existente aquel upsert reescribía `display_name` y `bio` con sus
   propios valores.
2. `lib/csp.ts` lista los **dos orígenes exactos** (endpoint desnudo y con el
   bucket delante), sin comodines. Se sabe el nombre del bucket, así que no hay
   motivo para abrir `https://*.r2.cloudflarestorage.com`.
3. `Field` asocia por `htmlFor`/`useId` en vez de envolver en `<label>`: 10 de
   sus 56 usos contienen botones o subidores, y un `<label>` envolvente haría
   que tocar el texto abriera el selector de archivos. Detalle en
   [`docs/accesibilidad.md`](docs/accesibilidad.md).

**F4, la mitad que faltaba.** `lib/r2-config.ts` (nuevo, probado) hace
fail-closed **antes** de consumir cupo del rate limit y antes de registrar la
fila en `media_assets` — sin eso, una configuración incompleta dejaba
inventariado un archivo que jamás se subió. Y queda documentado que
`R2_ENDPOINT` tiene que existir **en el entorno de build** de Vercel: la CSP se
arma en `proxy.ts`, que es Edge middleware, y Next incrusta ahí las variables
al compilar. Si falta en el build, la política sale sin ese origen y las
subidas mueren en el navegador aunque la variable esté puesta en runtime.

**Higiene del entorno que destapó un riesgo silencioso.** El Supabase local de
Vibe se movió al bloque de puertos **544xx**. El CLI usa 543xx para todos los
proyectos y firma los JWT con el mismo secreto de demostración, así que con el
stack de Bancary levantado en esta misma máquina `SUPABASE_TEST_URL` seguía
respondiendo —pero era **otra base**, y la clave de servicio autenticaba igual.
`test/database/identidad-de-la-base.ts` añade la salvaguarda de conducta:
antes de crear un usuario comprueba que el esquema del otro lado sea el de Vibe.

**Qué cubre ahora la suite autenticada** (26 pruebas, escritorio y móvil):

| Spec | Qué congela |
|---|---|
| `sesion.spec.ts` | redirección en el borde sin sesión (y **sin HTML del panel** en la respuesta); sesión real que sobrevive a una recarga |
| `editor.spec.ts` | añadir bloque → editar → reordenar → borrador que sobrevive a una recarga → publicar → **verlo en el perfil público** |
| `editor-teclado-y-subidas.spec.ts` | recorrido con teclado; subida de imagen y de audio con PUT firmado y **cero blob URLs** en lo publicado; la ruta no filtra internos |
| `editor-accesibilidad.spec.ts` | axe sobre el editor y sobre el inspector abierto |
| `xss-almacenado.spec.ts` | una URL `javascript:` **escrita directo en la base** queda inerte al renderizar, y el bloque no se descarta |
| `tests/visual-auth/editor.spec.ts` | estructura ARIA del editor en 390/768/1024/1440 |

Además: el feed entró a la capa visual pública (faltaba), y
`lib/audio-engine.test.ts` fija el contrato del motor único con 16 casos —
audio↔audio, audio↔vídeo, medios muteados que **no** se tocan, y la ráfaga de
cambios rápidos que producía el audio zombie. Se usa un doble de
`HTMLAudioElement` con control manual de la promesa de `play()`, porque jsdom
no implementa `play()` y es justo esa promesa la que causaba el bug.

---

## 3. Qué se corrigió del árbol que se retomó

1. **`pnpm typecheck` estaba en rojo.** `playwright.visual.config.ts` pasaba
   `timeout` dentro de `toMatchAriaSnapshot`, opción que no existe en esa
   posición. Con el typecheck roto, `pnpm qa` no pasaba y el build habría
   fallado.
2. **`playwright-report/` y `test-results/` estaban sin rastrear en el árbol.**
   Son salidas regenerables que además pueden llevar capturas de la sesión. Se
   borraron y se añadieron al `.gitignore`, junto con `blob-report/` y los
   temporales del CLI de Supabase.
3. **Las pruebas de contenido se saltaban solas** con una nota que las declaraba
   imposibles sin Supabase local. No lo eran: ver §2.5.
4. **La instantánea ARIA se guardaba con sufijo de plataforma**
   (`-win32.aria.yml`), lo que la habría vuelto incomparable en el CI de Linux —
   justo lo contrario de para lo que existe esa capa.
5. **La capa de píxeles fallaba en vez de omitirse** cuando no había referencia
   para el sistema operativo actual, pese a que la configuración decía lo
   contrario en un comentario.
6. **`reuseExistingServer` reutilizaba un `next dev` de una corrida anterior.**
   Provocó una tanda de 18 fallos que no correspondían a ningún problema del
   repositorio. Ahora siempre se arranca fresco.
7. **`scripts/smoke-staging.mjs` nunca se había ejecutado.** Se corrigió lo que
   hacía falta y se corrió (§2.11).

---

## 4. Bloqueos estrictamente humanos (con evidencia)

Sólo quedan estos. Docker, el baseline, la CLI y las migraciones pendientes ya
no son bloqueos.

| # | Bloqueo | Evidencia exacta | Fase |
|---|---|---|---|
| D | **Aprobar las capturas de píxeles de referencia.** Definen oficialmente cómo se ve Vibe; no las fabrica un agente. Un comando: `pnpm test:visual:update`, revisar cada PNG, versionar. Mientras tanto la capa ARIA sí corre y bloquea. | `tests/visual/referencias/` sólo tiene `.aria.yml` | F8 |
| E | **Verificación externa del estado desplegado (F0)**: anon key sin DNIs, `cleanup` 401 en producción, etc. Requiere tu base y tus variables de Vercel. *(El equivalente local ya corre en `invariantes-publicas.spec.ts` y en el smoke.)* | — | F0 |
| ~~G~~ | ~~**Accesibilidad del editor con teclado.**~~ **Cerrado el 2026-08-31** (§2.19): no hacía falta falsificar un JWT, sino usar el Supabase local que `pnpm test:db` ya levanta. Destapó tres violaciones críticas, ya corregidas. | `docs/accesibilidad.md` | F8 |
| H | **Decisiones de proveedor y de negocio:** Sentry vs. log drains (F12), captcha vs. confirmación de correo (F5), staging y backups (F13), correo institucional y plazos de DMCA (F14), cuota por perfil (F11), política de `orders`/`donations` (F0 #6). | §8 del plan | varias |

Ninguno de estos impide que `pnpm qa`, `pnpm build`, `pnpm test:e2e`,
`pnpm test:visual` y el smoke pasen en verde hoy.

---

## 5. Fases no cerrables sólo desde el repositorio

- **F4 está cerrada localmente.** Queda la comprobación humana en navegador
  real de los seis embeds y ffmpeg.wasm; las superficies públicas y la consola
  CSP sí están automatizadas en escritorio y móvil.
- **F6 está cerrada:** existe `0000`, los SQL históricos están en `legacy/`, la
  base se reconstruye desde cero y los fallbacks temporales fueron retirados.
  La comparación con producción no muestra diferencias estructurales ni de
  permisos; el ruido textual heredado está documentado en `docs/migraciones.md`.
- **F7 está cerrada:** 110 pruebas de base en verde, dos corridas seguidas, sin
  ningún `todo` (§2.18). Las decisiones de producto sobre tablas heredadas
  siguen separadas en F0/F13.
- **F13/F14:** staging, backups, restauración probada y panel de moderación.
  El banner de consentimiento, la exportación y el borrado de datos ya están
  conectados. Los **runbooks y la documentación ya están escritos**
  (`docs/staging.md`, `docs/backups.md`, `docs/runbooks/*`,
  `docs/retencion-de-datos.md`, `docs/rotacion-de-credenciales.md`); lo que
  falta es la infraestructura, que cuesta dinero y vive en tus cuentas.

---

## 6. Riesgos abiertos

1. **La capa de píxeles no protege nada todavía.** Hasta que existan referencias
   aprobadas, un cambio visual fino puede pasar: lo que hoy detecta la suite es
   un cambio de **estructura**, no de color o espaciado.
2. **Cuotas y moderación administrativa siguen dependiendo de decisiones de
   producto/arquitectura.** No se creó una falsa capa: la cuota necesita el
   límite aprobado y el panel necesita una identidad de administrador también
   representada en Postgres para que RLS sea la segunda barrera.

---

## 7. Acciones humanas pendientes (orden de urgencia)

1. Completar las comprobaciones externas restantes de **F0** contra producción.
2. `pnpm test:visual:update`, revisar las capturas y versionarlas.
3. `TOGETHER_API_KEY` y las decisiones de proveedor del punto H de §4.

> **Cerrada el 2026-09-04.** «Definir dueños de **CODEOWNERS** y activar la
> protección de rama» era el punto 3 de esta lista. `CODEOWNERS` ya nombra a
> `@DanGonzalesP` y `main` está protegida con los cinco checks del flujo CI como
> obligatorios. La configuración exacta —y por qué las aprobaciones quedaron en
> 0 mientras haya un solo mantenedor— está en **§8.1 del
> `PLAN_VIBE_EMPRESARIAL.md`**.

*(Lista completa y priorizada: §8 del `PLAN_VIBE_EMPRESARIAL.md`.)*

---

## 8. Cómo reproducir todo esto

```powershell
pnpm install --frozen-lockfile
pnpm qa            # typecheck + lint + 221 unitarias
pnpm build
pnpm test:e2e      # E2E + axe, escritorio y móvil
pnpm test:visual   # 20 instantáneas ARIA en 4 anchos
```

Ninguno de esos cuatro comandos necesita Docker, credenciales, ni red hacia
Supabase, R2 o cualquier tercero.

Las pruebas de base **sí** necesitan Docker Desktop y el Supabase local:

```powershell
pnpm db:verify     # reconstruye 0000–0018 desde cero + db lint
pnpm test:db       # 110 pruebas de RLS, publicación, límites y moderación
```
