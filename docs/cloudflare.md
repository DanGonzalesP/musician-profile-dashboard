# Despliegue en Cloudflare Workers

## Reportes anónimos (0040)

El formulario sin cuenta usa `/api/reportes`. La anon key ya no permite INSERT
directo en `content_reports`: debe pasar por `submit_anonymous_report` con un
comprobante del runtime ligado al reporte íntegro, al sujeto HMAC de red y a una
vigencia de 30 segundos. Usa la pareja `ANONYMOUS_RATE_LIMIT_KEY` / `_KEY_ID` de0038,
con dominio de firma distinto. No registrar el payload: contiene el reclamo.
Cupo adicional fijo:15 por red/hora y300 globales/día; se mantienen los límites
anteriores de0011. Repetir comprobantes consume cuota. Sin clave válida se cierra
la recepción con503; no mostrar éxito al usuario. Los reportantes autenticados
conservan su escritura RLS, sin permiso para fijar estado/resolución/notas.

Aplicar0040 y publicar la ruta en la misma ventana de mantenimiento: clientes
anónimos antiguos deben recargar antes de reportar. No volver a habilitar INSERT
anónimo como rollback; conservar la ruta compatible. Verificación local en
`test/database/anonymous-report.test.ts` y `tests/e2e-auth/reportes.spec.ts`.
La provisión remota y la aceptación desplegada siguen pendientes.


## Permisos de administración (0039)

`ADMIN_USER_IDS` deja de autorizar operaciones. La sesión real consulta
`has_platform_permission`: `owner` gestiona roles y tiene permisos de moderación
y mantenimiento; `moderator` solo moderación; `maintenance` solo mantenimiento.
Esto no amplía acceso a borradores ni permite borrar archivos ajenos: las reglas
de propiedad y retirada siguen aplicándose por separado.

El operador de la base debe comprobar la identidad del titular y provisionar
el primer `owner` en `private.platform_roles` por SQL administrativo. No existe
una ruta pública para reclamar ese puesto. No copiar UUIDs de otro proyecto ni
inferir el titular por un correo editable. Esta provisión remota sigue pendiente.

Desde una sesión de owner, `set_platform_role(p_user_id,p_role)` asigna o cambia
un rol; `p_role=null` lo revoca. `platform_role_history` devuelve el registro
paginado únicamente al owner. La auditoría registra también la provisión SQL
(actor nulo), los cambios y las retiradas, sin texto libre ni claves.
El último owner no puede retirarse o degradarse desde la aplicación: primero
debe asignar un sucesor. La recuperación excepcional corresponde al operador
de la base y también queda registrada. Ninguna clave administrativa de Supabase
se añade a la aplicación.

## Requisito de ejecución: límite anónimo (0038)

Antes de habilitar la versión que incluye 0038, provisionar una clave aleatoria
independiente de 32 bytes (hexadecimal) con identificador en
`private.anonymous_gateway_keys`. El mismo par debe llegar como secretos
`ANONYMOUS_RATE_LIMIT_KEY` y `ANONYMOUS_RATE_LIMIT_KEY_ID` al Worker; nunca al
build público, al navegador, al repositorio ni a registros de comandos.
No reutilizar claves de medios ni claves administrativas de Supabase.

Sin el par, `/api/oembed` y `/api/health` responden 503. Con el cupo agotado
responden 429 y `Retry-After`; ninguna de esas respuestas se almacena en caché.
Los límites por red son 30 y 60 peticiones por minuto respectivamente; los
techos globales son 600 y 3000. La base almacena un identificador HMAC, no la IP.
IPv6 se agrupa por /64. Fuera del contexto de Cloudflare en producción, o sin
`TRUSTED_PROXY=true`, todos los visitantes comparten un contador conservador.
Nunca se acepta `X-Forwarded-For` como alternativa.

Para rotar: añadir el nuevo par privado, actualizar los secretos del Worker,
verificar las dos rutas y retirar el par anterior cuando no queden versiones
activas que dependan de él. Revocar una clave invalida sus comprobantes de
inmediato. Los Workers de la propia zona forman parte de la frontera de
confianza; revisar sus permisos y subpeticiones antes de acreditar staging.
La implementación y las pruebas locales no acreditan este aprovisionamiento
remoto ni cierran el punto 7.

Vibe corría en Vercel. Este documento es el runbook de la plataforma nueva:
qué hay que crear una sola vez, qué variable va en qué sitio, cómo se despliega
y cómo se vuelve atrás.

El adaptador es [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare):
toma la salida de `next build` y la empaqueta para el runtime de Workers
(`workerd`).

---

## 0. Por qué el código estaba casi listo

Vale la pena saberlo antes de tocar nada, porque acota el riesgo: el
acoplamiento a Vercel eran **cinco puntos concretos**, no una arquitectura.

- No había un solo `import` de un módulo nativo de Node en `app/`, `lib/` ni
  `proxy.ts`.
- `images.unoptimized` ya estaba activo, así que nunca se dependió del
  optimizador de imágenes de Vercel.
- `ffmpeg.wasm` corre en el navegador y en un solo hilo, así que no necesita
  `SharedArrayBuffer` ni las cabeceras COOP/COEP que lo acompañan.
- R2 **ya era Cloudflare**.

Lo que sí cambió está en la tabla de §6.

---

## 1. Requisitos previos

```bash
pnpm install
pnpm wrangler login
```

`wrangler` va como dependencia de desarrollo del proyecto: se usa con `pnpm
wrangler`, no con una instalación global, para que la versión sea la misma en
todas las máquinas y en CI.

---

## 2. Recursos existentes: verificar, no recrear

Registro histórico 2026-10-04: `wrangler.jsonc` identificaba la cuenta personal
de Vibe. Estado verificado 2026-11-04: el perfil `vibe` de Wrangler empresarial
está autorizado y asociado únicamente a este repositorio; perfil global y
Bancary intactos. No reutilizar comandos de la cuenta personal ni recrear
recursos existentes. Credencial empresarial `vibe-music-artistas-runtime`
creada y cifrada con DPAPI en `.wrangler/credenciales-empresa/r2-runtime.dpapi`;
la carpeta ACL permite acceso solo al usuario actual y SYSTEM. Aún falta
configurarla/comprobarla en runtime.

### 2.1 Bucket de caché incremental

Binding `NEXT_INC_CACHE_R2_BUCKET` → `vibe-cache-incremental`.

Es un bucket **distinto** del que guarda los archivos de los artistas. No es
una manía: mezclarlos significaría que un vaciado de caché puede tocar audio
subido por alguien, y que las reglas de ciclo de vida de uno se aplicarían al
otro.

### 2.1 bis · Bucket privado para el WASM de FFmpeg

`public/ffmpeg/ffmpeg-core.wasm` supera el límite de 25 MiB por archivo de
Workers Static Assets. Se excluye del paquete estático mediante
`public/.assetsignore` y vive en el bucket privado `vibe-static-assets`. La
ruta de mismo origen `/ffmpeg/ffmpeg-core.wasm` transmite desde un binding R2
que solo permite leer ese objeto fijo; no se habilita acceso público al bucket
ni se mezcla con archivos de artistas o caché ISR.

```bash
pnpm wrangler r2 object put vibe-static-assets/ffmpeg-core.wasm \
  --file public/ffmpeg/ffmpeg-core.wasm \
  --content-type application/wasm \
  --cache-control 'public, max-age=0, must-revalidate' --remote
```

La instrucción anterior describe la cuenta Cloudflare personal histórica. El
bucket empresarial también permanece privado. El WASM verificado mide
32,232,419 bytes y su SHA-256 es
`9F57947A5BD530D8F00C5B3F2CB2A3492FAA7E5D823315342D6A8656D0A6B7B7`; se cotejó
con la descarga. Aún no se ha desplegado.

### 2.2 Base D1 para la caché de etiquetas

El `database_id` ya está fijado en `wrangler.jsonc`. No hay placeholder.
Antes de un despliegue autorizado, comprobar el esquema además del recurso:
`pnpm wrangler d1 execute vibe-cache-etiquetas --remote --command "PRAGMA table_info(revalidations)"`.
Se esperan `tag`, `revalidatedAt`, `stale`, `expire` y unicidad de `tag`.
La verificación de esquema reportada el 2026-11-04 encontró esos cuatro campos,
unicidad de `tag` y 0 filas en D1 empresarial; antes de desplegar, volver a
ejecutar la comprobación remota indicada arriba.
OpenNext **1.20.16 instalado** inicializa la tabla en `populate-cache`, invocado
por `cf:preview`/`cf:deploy`, no por `pnpm build` ni por un `wrangler deploy`
directo. Verificación empresarial 2026-11-04: D1 está inicializada con
`revalidations(tag,revalidatedAt,stale,expire)`, `tag` único y 0 filas. Su
intento de añadir `stale`/`expire` ignora errores: una base antigua con sólo una
de esas columnas requiere inspección y reparación dirigida antes de desplegar.

La copia de `derias-assets` personal a `vibe-artist-media` empresarial terminó:
67 objetos, 124,720,470 bytes (15 audios y 52 imágenes). SHA-256, metadatos e
inventarios coinciden; el origen sigue intacto. El destino permanece privado,
`media_assets` tiene 0 filas y las URLs antiguas no se cambiaron. Evidencia
ignorada por Git: `.wrangler/migracion-empresa-2026-11-04/r2-copia-verificada.json`.
La caché sigue vacía; no hubo deploy. La credencial empresarial fue rotada tras
exposición accidental, verificada con alcance al bucket de artistas, y la
revocación de la primera clave quedó comprobada. Falta configurar/comprobar la
sustituta en runtime. El detalle, incluida la diferencia con la clave personal,
está en [migracion-empresa-vibe.md](migracion-empresa-vibe.md); nunca incluir
valores ni IDs de claves.

Esto es lo que hace que "publicar" se vea de inmediato en el perfil público.

### 2.3 CORS del bucket de archivos

```bash
pnpm node scripts/setup-r2-cors.mjs
```

Ahora permite `localhost`, `*.workers.dev` y el origen de
`NEXT_PUBLIC_SITE_URL`. Si esa variable no está definida al correrlo, el
dominio de producción **no** queda permitido y las subidas fallarán desde él.

---

## 3. Dónde va cada variable

Esto ya causó un bug una vez. La distinción no es burocrática:

| Dónde | Qué va ahí | Por qué |
|---|---|---|
| **Entorno de BUILD** (Workers Builds → Settings → Build → Variables) | Todo `NEXT_PUBLIC_*`; `APP_VERSION` o `WORKERS_CI_COMMIT_SHA` | Next incrusta las variables públicas; `next.config.mjs` fija únicamente la versión pública del build |
| **Ejecución** (Worker → Settings → Variables and Secrets, tipo Text; o `vars`) | `TRUSTED_PROXY`, `R2_ENDPOINT`, `R2_BUCKET_NAME` | El SDK S3 y el proxy los necesitan durante cada petición; no son secretos |
| **Secretos** (`pnpm wrangler secret put NOMBRE`) | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `TOGETHER_API_KEY`, `META_APP_ACCESS_TOKEN`, `ANONYMOUS_RATE_LIMIT_KEY`, `ANONYMOUS_RATE_LIMIT_KEY_ID` | Credenciales: nunca se versionan |

### El caso de `R2_ENDPOINT`

`R2_ENDPOINT` es de ejecución: compilar `proxy.ts` no convierte automáticamente
todas las variables privadas en constantes. Se comprobó con Worker real y un
endpoint ficticio aportado sólo al runtime. Mantenerlo también en el entorno de
build es compatible, pero **no sustituye configurarlo en el Worker**. El mismo
criterio aplica a `R2_BUCKET_NAME`. Las claves S3 sólo van como secretos de
ejecución y se limitan al bucket de artistas; los buckets de caché y WASM usan
bindings, no esas claves.

El síntoma es engañoso: la API responde 200, la fila se registra en
`media_assets`, y no queda nada en los registros del servidor.

---

## 4. Construir y desplegar

```bash
pnpm cf:build      # empaqueta el Worker en .open-next/
pnpm cf:preview    # lo corre en local con el runtime real de Workers
pnpm cf:deploy     # sube a Cloudflare
```

`pnpm cf:preview` es lo más parecido a producción que se puede correr en la
propia máquina: usa `workerd`, no Node. Un fallo que sólo aparece en el borde
—un módulo que workerd no provee, una API del servidor que no existe allí— sale
aquí y no en el despliegue.

> **`pnpm build` NO cubre esto.** Compila la app de Next, pero no la empaqueta
> para `workerd`. Por eso CI tiene un job aparte, `Build del Worker de
> Cloudflare`.

### 4.1 Windows: `pnpm cf:build` falla en local

Con un fallo así:

```
error: Cannot read directory ".open-next/.../node_modules/react": Acceso denegado.
```

**No es un problema de permisos ni del proyecto.** El adaptador copia
`node_modules` dentro de `.open-next` y, al recrear los enlaces simbólicos en
Windows, los crea con el tipo equivocado —archivo en vez de directorio—, así
que quedan rotos. Windows reporta eso como "Acceso denegado" y esbuild muere.

Se comprobó comparando el mismo enlace en el origen y en la copia: idéntico
destino relativo, el origen resuelve y la copia no.

`node-linker=hoisted` **no lo arregla**: esas rutas no salen de `node_modules`,
las reconstruye el *file tracing* de Next.

Opciones, en orden de preferencia:

1. **Dejar que construya CI o Cloudflare Workers Builds.** Los dos son Linux y
   no tienen el problema. Es el camino normal de despliegue.
2. **Construir en un contenedor Linux** cuando haga falta verificarlo en local.
3. `next dev` sigue funcionando en Windows con normalidad para el desarrollo
   del día a día.

---

## 5. Caché: qué se eligió y por qué

Está en `open-next.config.ts` con el razonamiento completo. En resumen:

| Pieza | Elección | Motivo |
|---|---|---|
| Caché incremental (ISR) | **R2** | KV es de consistencia eventual (~60 s). Un artista publicaría y vería su versión vieja durante un minuto sin explicación |
| Caché de etiquetas (`revalidateTag`) | **D1** | Lo mismo: publicar es el momento en que el usuario está mirando |
| Cola de revalidación | **Durable Object (`DOQueueHandler`)** | Cola coordinada entre isolates y deduplicación; la cola `direct` es sólo para preview/debug, no para producción |

Vibe usa las tres cosas que dependen de esto: `revalidate = 300` en
`/[username]` y `/[username]/tienda`, `revalidate = 3600` en el sitemap, y
`revalidateTag` al publicar (`app/acciones/revalidar-perfil.ts`).

**No se activaron** `withRegionalCache` ni la purga automática. El propio
adaptador documenta que la caché regional "no mejora directamente mucho el
rendimiento" y que su ganancia real viene de saltarse la caché de etiquetas en
los aciertos — algo desactivado por defecto en Next 16 porque rompe la
revalidación con SWR. Activarlas a ciegas cambiaría el comportamiento de
invalidación sin ninguna medición que lo justifique.

---

## 6. Qué cambió respecto de Vercel

| Punto | Antes | Ahora | Nota |
|---|---|---|---|
| Analítica | `@vercel/analytics` | Cloudflare Web Analytics | Sigue sin cargarse hasta un sí explícito del visitante |
| CSP | `vitals.vercel-insights.com`, `va.vercel-scripts.com` | `cloudflareinsights.com`, `static.cloudflareinsights.com` | |
| Correlación de peticiones | `x-vercel-id` | `cf-ray` | El mismo id que se busca en el panel de Cloudflare |
| Rate limit por IP | `process.env.VERCEL === "1"` | `cf-connecting-ip` + `TRUSTED_PROXY` | **Más fuerte**: el borde sobrescribe la cabecera, no hay versión falsificable |
| URL del sitio | Respaldo `NEXT_PUBLIC_VERCEL_URL` | Sin respaldo | Cloudflare no tiene equivalente. `NEXT_PUBLIC_SITE_URL` es obligatoria |
| Versión en `/api/health` | `VERCEL_GIT_COMMIT_SHA` | `WORKERS_CI_COMMIT_SHA` / `APP_VERSION` | |
| CORS de R2 | `*.vercel.app` | `*.workers.dev` + dominio real | |

### El rate limit: qué está distribuido y qué no

Hay **dos capas**, y la diferencia importa a la hora de decidir si queda algo
que arreglar:

| Ruta | Contador | Efecto en Workers |
|---|---|---|
| `/api/upload-url` | **Postgres** (RPC `consume_authenticated_rate_limit`, migración `0009`) | Correcto: uno solo para todos los isolates |
| `/api/generate-image` | **Postgres**, igual | Correcto |
| `/api/oembed` | en memoria del isolate | **Se diluye** |
| `/api/health` | en memoria del isolate | Se diluye |
| `/api/eliminar-cuenta` | en memoria del isolate | Se diluye |

Las dos rutas donde el abuso cuesta dinero de verdad —la que entrega
almacenamiento y la que gasta créditos de Together AI— **ya usan el contador
distribuido**, y además fallan cerradas: si Postgres no responde, deniegan en
vez de caer a un `Map` por instancia (F5, migración `0009`).

Lo que queda en memoria es la primera barrera para peticiones **anónimas**, y
es deliberado: sin una identidad verificable, dejar que el cliente elija la
clave de un RPC compartido haría el límite trivialmente evadible (ver el
comentario en `lib/rate-limit.ts`).

**El hueco real que deja Workers** es entonces más estrecho de lo que parece:
`/api/oembed`, que hace `fetch` a terceros sin autenticación. Con un contador
por isolate, el límite efectivo es más alto que el configurado, y esa ruta es
un proxy gratis para quien la encuentre. Ahí sí valdría un Durable Object —que
es justo lo que Cloudflare hace fácil—, pero es una mejora acotada, no un
agujero abierto en las rutas que cuestan dinero.

---

## 7. Volver atrás

```bash
pnpm wrangler deployments list
pnpm wrangler rollback [ID-DE-VERSION]
```

El rollback del Worker **no revierte la base de datos**. Si el despliegue
incluía una migración de Supabase, hay que revertirla aparte siguiendo
`docs/migraciones.md`. Las migraciones del proyecto son forward-only: la vuelta
atrás es una migración nueva, no un `down`.

---

## 8. Comprobaciones tras el primer despliegue

```bash
curl -s https://TU-DOMINIO/api/health | jq
```

Debe responder `estado: "ok"` y una `version` que **no** sea `"desarrollo"`. Si
dice `"desarrollo"`, el build no recibió `WORKERS_CI_COMMIT_SHA` y no vas a
poder saber qué commit está sirviendo cuando algo falle.

Y las que sólo se ven en un navegador real:

1. **Subir un audio y una imagen** desde el editor. Es lo que rompe la CSP si
   `R2_ENDPOINT` faltó en el build (§3).
2. **Publicar un perfil** y comprobar que el cambio se ve en el perfil público
   sin esperar. Eso ejercita D1.
3. **Compartir el enlace** en WhatsApp o Slack y ver que sale la tarjeta con
   imagen. Eso ejercita `opengraph-image` y `NEXT_PUBLIC_SITE_URL`.

## Generación aislada de tipos (2026-11-06)

Usar `pnpm cf:typegen`. El script fija un archivo explícito de nombres vacíos
(`scripts/cloudflare-type-bindings.example`) y evita heredar variables de pruebas
o credenciales del proceso. No usar `wrangler types` directamente sobre el entorno
habitual: puede incorporar nombres de `.env.local` o `.dev.vars` a la interfaz.
La lista de nombres sirve únicamente para TypeScript; no provisiona variables,
secretos, recursos ni modifica el Worker. No rellenar ese archivo con valores.
Actualizar la lista si cambia el contrato de configuración de la aplicación.

Generación local ejecutada con salida 0. La interfaz ya no declara variables del
arnés de pruebas ni Vercel; incorpora claves de recibos/gateway y referencia del
Worker a sí mismo. El archivo generado sigue ignorado por Git. Falta la validación
final de compilación e integración; esto no acredita configuración desplegada.

## Contratos de claves separados para medios

La plantilla principal `.env.example` incluye el par `MEDIA_RECEIPT_KEY` /
`MEDIA_RECEIPT_KEY_ID`, que debe coincidir con `private.media_runtime_keys`.
Configurar S3 por sí solo no habilita reservas, finalización ni retirada.
El origen `NEXT_PUBLIC_R2_PUBLIC_URL` reconoce URLs históricas: no autoriza
publicar el bucket; la entrega actual utiliza `/api/media`.

El Worker de mantenimiento tiene su propia plantilla de nombres vacíos en
`workers/media-maintenance.env.example`: anon key de Supabase y par
`MEDIA_MAINTENANCE_KEY` / `_KEY_ID`, asociado a `private.media_maintenance_keys`.
No compartirlo con recibos ni con el gateway anónimo. La URL empresarial queda
preparada en su configuración, con mantenimiento todavía desactivado.
Estos cambios no instalan secretos ni despliegan recursos. Su aceptación remota
sigue pendiente después de migraciones y gates, igual que la del Worker principal.
