# Despliegue en Cloudflare Workers

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

## 2. Recursos que hay que crear una sola vez

### 2.1 Bucket de caché incremental

```bash
pnpm wrangler r2 bucket create vibe-cache-incremental
```

Es un bucket **distinto** del que guarda los archivos de los artistas. No es
una manía: mezclarlos significaría que un vaciado de caché puede tocar audio
subido por alguien, y que las reglas de ciclo de vida de uno se aplicarían al
otro.

### 2.2 Base D1 para la caché de etiquetas

```bash
pnpm wrangler d1 create vibe-cache-etiquetas
```

El comando imprime un `database_id`. **Hay que pegarlo en `wrangler.jsonc`**,
donde ahora dice `PENDIENTE-CORRER-wrangler-d1-create`. Mientras diga eso el
despliegue falla, que es a propósito: es preferible a arrancar contra una base
que no existe y descubrirlo cuando un artista publique.

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
| **Entorno de BUILD** (variables del proyecto en Workers Builds) | Todo `NEXT_PUBLIC_*`, más `R2_ENDPOINT` y `R2_BUCKET_NAME` | Next las **incrusta en el código** al compilar. Ponerlas sólo en ejecución compila, despliega, arranca… y el navegador recibe `undefined` |
| **`wrangler.jsonc` → `vars`** | `TRUSTED_PROXY` | Ejecución, no sensible, se versiona |
| **Secretos** (`pnpm wrangler secret put NOMBRE`) | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `TOGETHER_API_KEY`, `META_APP_ACCESS_TOKEN`, `ADMIN_USER_IDS` | Credenciales: nunca se versionan |

### El caso de `R2_ENDPOINT`

Es el que engaña. No lleva prefijo `NEXT_PUBLIC_`, así que parece de ejecución.
No lo es: de él sale el origen que `lib/csp.ts` mete en `connect-src`, y esa CSP
la arma `proxy.ts`, que también se compila. **Si falta en el build, la política
sale sin ese origen y el navegador bloquea TODAS las subidas** aunque la
variable esté puesta en ejecución.

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
| Cola de revalidación | **`"direct"`** | Suficiente para el volumen actual; evita provisionar un Durable Object |

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

### El rate limit sigue siendo en memoria

`lib/rate-limit.ts` cuenta en memoria del proceso. En Vercel cada función
serverless era su propia instancia; **en Workers cada isolate tiene su propio
contador**, así que el límite se diluye igual o más.

No es una regresión de la migración —ya era así—, pero Cloudflare da la
herramienta para arreglarlo de verdad: un Durable Object da un contador único
y consistente. Queda pendiente y anotado.

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
