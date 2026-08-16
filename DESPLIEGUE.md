# Guía de despliegue — cambios de la auditoría

> **Estado vigente (2026-08-16):** producción ya tiene aplicadas y verificadas
> las migraciones `0000`–`0017`. **No vuelvas a ejecutar manualmente** los pasos
> históricos de `0002`–`0009` que aparecen debajo.
>
> Para una migración futura: backup manual fuera del repositorio, `pnpm
> db:verify`, `pnpm test:db`, `supabase db push --linked --dry-run`, aplicación
> de una sola migración, verificación, despliegue de Vercel y `pnpm smoke`.

Lo que sigue documenta el despliegue histórico original y se conserva como
trazabilidad.

> ⚠️ **Antes de empezar: haz un backup.** En Supabase → Database → Backups.
> Las migraciones 0003 y 0006 modifican y eliminan columnas.

---

## Paso 1 — Diagnóstico (solo lectura, no cambia nada)

Pega `supabase/_diagnostico_rls.sql` completo en el SQL Editor y **mándame los
5 resultados**. Con eso confirmo:

- Qué tablas tienen `qual = true` abiertas (agujeros que siguen sin cerrar).
- Qué tablas tienen RLS desactivado del todo.
- Las columnas reales de `profiles`, `orders`, `donations`, para ajustar 0004.
- Si ya cruzaste las 1000 filas que rompían el borrado de archivos.
- Si hay `display_name` duplicados (esos perfiles hoy están inalcanzables).

**No sigas al paso 2 sin esto**, sobre todo por `orders`: la migración 0004 la
deja cerrada a propósito hasta saber qué columna identifica al comprador en tu
esquema.

---

## Paso 2 — Migraciones, en orden estricto

En el SQL Editor de Supabase, una por una, verificando que cada una termine sin
error antes de la siguiente. Todas son idempotentes (puedes repetirlas).

| # | Archivo | Qué hace | Riesgo |
|---|---------|----------|--------|
| 1 | `0002_media_assets.sql` | Registro de propiedad de archivos | Bajo — solo crea |
| 2 | `0003_profile_private.sql` | **Saca DNIs y borradores de la tabla pública** | ⚠️ Elimina columnas |
| 3 | `0004_lock_remaining_rls.sql` | Cierra `music_feed`, `orders`, `donations` | Medio |
| 4 | `0005_publish_profile_rpc.sql` | Publicación transaccional | Bajo |
| 5 | `0006_username.sql` | Identidad única + historial | ⚠️ Backfill masivo |
| 6 | `0007_optimistic_concurrency.sql` | Control de versión al publicar | Bajo |
| 7 | `0008_moderacion_y_cumplimiento.sql` | Reportes, DMCA, borrado de cuenta | Bajo — solo crea |
| 8 | `0009_shared_rate_limits.sql` | Límite de subidas/IA compartido entre instancias | Bajo — solo crea |

> **0009 es opcional pero recomendada.** Sin ella, el límite de frecuencia de
> `/api/upload-url` y `/api/generate-image` sigue funcionando, pero en memoria de
> cada instancia serverless (más laxo bajo mucho paralelismo). Al aplicarla, el
> contador pasa a Postgres y se vuelve global. El código detecta solo si está
> aplicada: si falta, cae al límite local sin romper nada (ver `lib/rate-limit.ts`).
> La función RPC solo deja a cada usuario tocar su propio contador (`auth.uid()`),
> así que nadie puede bloquear a otro ni manipular su cuota.

### Sobre 0003 (la más importante y la más delicada)

Mueve `legal_settings` (nombre legal y **DNI**) y `draft_content` a una tabla
privada, y luego **elimina esas columnas de `profiles`**. Ese `drop column` es
lo que de verdad cierra la fuga.

El archivo copia los datos antes de borrar. Aun así, **verifica entre medio**:

```sql
select count(*) as con_datos_legales from profile_private where legal_settings <> '{}'::jsonb;
```

Si ese número no cuadra con los artistas que llenaron sus datos legales, **para
y avísame** antes de que corra el `drop column`.

### Sobre 0006 (username)

Deriva un username de cada `display_name`, resolviendo colisiones con sufijo
numérico. Al terminar te muestra la tabla completa:

```sql
select id, display_name, username from profiles order by created_at;
```

Revísala. Si algún artista quedó con un username feo, puede cambiarlo desde
Configuración — y su enlace anterior seguirá redirigiendo.

---

## Paso 3 — Variables de entorno

En Vercel (Settings → Environment Variables) y en tu `.env.local`:

```bash
ADMIN_USER_IDS=tu-uuid-de-supabase
```

Tu UUID sale de: Supabase → Authentication → Users → tu fila → columna `UID`.

Sin esta variable **nadie** es administrador, y `/api/cleanup-orphaned-files`
queda inutilizable. Es deliberado: prefiero una herramienta de mantenimiento
apagada a una abierta por un despiste de configuración.

También conviene fijar:

```bash
NEXT_PUBLIC_SITE_URL=https://tu-dominio-real.com
```

Sin ella, los metadatos de Open Graph y el sitemap usan la URL efímera de cada
despliegue de Vercel, y las tarjetas al compartir apuntan a un dominio que
cambia. **Este es el que más impacto tiene en el SEO.**

Y si quieres que `/api/generate-image` funcione (hoy manda `Bearer undefined`):

```bash
TOGETHER_API_KEY=...
```

---

## Paso 4 — Verificación

Después de desplegar, comprueba que los arreglos son reales.

**1. Los DNIs ya no son públicos.** Con la anon key (la del bundle):

```bash
curl "https://TU-PROYECTO.supabase.co/rest/v1/profiles?select=*" -H "apikey: TU_ANON_KEY"
```

No debe aparecer `legal_settings`, `draft_content`, `user_id` ni `owner_user_id`.

**2. El borrado masivo está cerrado:**

```bash
curl -X POST https://tu-dominio.com/api/cleanup-orphaned-files -H 'Content-Type: application/json' -d '{"folder":"audio"}'
```

Debe responder **401**, no un reporte de borrado.

**3. El SSRF está cerrado:**

```bash
curl "https://tu-dominio.com/api/image-proxy?url=https://pub-TUBUCKET.r2.dev.ejemplo.com/x"
```

Debe responder **400**.

**4. El XSS está muerto.** Guarda `javascript:alert(1)` en el campo de contacto
del hero, publica, y abre tu perfil: el botón debe quedar inerte, sin ejecutar
nada.

**5. Las tarjetas sociales funcionan.** Pega el enlace de un perfil en
[opengraph.xyz](https://www.opengraph.xyz) — debe salir el nombre y la foto del
artista, no el título genérico de Vibe.

---

## Qué NO está hecho, y por qué

Lo digo explícito para que no lo des por cubierto:

- **`orders` queda sin política de lectura.** 0004 le activa RLS y borra las
  políticas viejas, pero no crea la de comprador/vendedor porque no sé qué
  columna identifica al comprador en tu esquema. Hasta que la definas, la tabla
  queda **cerrada** (falla segura). El diagnóstico del paso 1 me da el dato.

- **El rate limiting es por instancia, no global.** El contador vive en memoria
  del proceso y en Vercel cada función serverless es su propia instancia. Frena
  el abuso accidental y el scripting básico; para un límite real hace falta
  Redis (Upstash). Está documentado en `lib/rate-limit.ts`.

- **Las 23 advertencias del React Compiler.** `react-hooks/set-state-in-effect`
  y `react-hooks/refs` marcan patrones que perjudican el rendimiento del editor.
  Son legítimas, pero corregirlas son ~23 refactors de hooks: es un trabajo
  aparte, no algo para colar en una tanda de seguridad. Quedan como *warning*
  para no dejar un CI en rojo que todos aprendan a ignorar. Los 4 hallazgos que
  sí eran bugs ya están corregidos.

- **No hay panel de administración.** Los reportes llegan a `content_reports`,
  pero hoy se revisan desde el SQL Editor. Es el siguiente paso natural.

- **La agregación del feed de descubrimiento sigue en el cliente.** Ahora es
  determinista (ordenada), pero sigue siendo una muestra de las 500 filas más
  recientes. Con varios miles de productos hay que mover el `group by` a
  Postgres.

- **La CSP mantiene `unsafe-inline` y `unsafe-eval`.** Quitarlos exige nonces
  por request; es un cambio con riesgo real de romper ffmpeg.wasm y los scripts
  inline de Next, y quería que lo probaras con calma, no mezclado con el resto.

---

## Si algo sale mal

Las migraciones son idempotentes, pero 0003 y 0006 **no son reversibles solas**
(eliminan columnas / crean constraints). Por eso el backup del principio.

Para volver el código atrás sin tocar la base:

```bash
git checkout main
```

El código viejo **no funciona** contra la base ya migrada (busca `draft_content`
en `profiles`, que ya no existe). Si necesitas revertir de verdad, hay que
restaurar el backup también.
