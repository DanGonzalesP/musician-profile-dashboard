# Estado desplegado — F0

> **ESTADO: ABIERTO / BLOQUEADO POR CREDENCIALES.**
> Este documento es la plantilla que F0 exige rellenar. La sesión que lo creó **no tiene acceso a
> la base de datos de producción, al panel de Vercel ni a Cloudflare**, así que ninguna casilla
> puede marcarse desde el repositorio. Todo lo demás del plan se ejecutó igualmente, declarando la
> suposición: ver `IMPLEMENTACION_VIBE_EMPRESARIAL.md`.

Última actualización: 15 de agosto de 2026 · Firmado por: **(pendiente)**

---

## Cómo cerrar esta fase

1. Supabase → SQL Editor → ejecutar `supabase/_diagnostico_parte2.sql` (4 resultados).
2. Supabase → SQL Editor → ejecutar `supabase/_diagnostico_estado.sql` (7 resultados).
3. Pegar cada salida en su sección de abajo, tal cual, sin resumir.
4. Ejecutar las 4 comprobaciones externas de la §4.
5. Rellenar el inventario de variables de la §5.
6. Cambiar el estado de la cabecera a **CERRADO**, poner fecha y firmar.
7. Registrar en `IMPLEMENTACION_VIBE_EMPRESARIAL.md` que F0 quedó cerrada.

Ninguno de estos pasos modifica nada: las dos consultas son de solo lectura y las comprobaciones
externas son peticiones HTTP que deben **fallar**.

---

## 1 · Migraciones aplicadas

Salida de la consulta 1 de `_diagnostico_estado.sql`:

```
(pegar aquí)
```

Lo que el diagnóstico del 2026-08-05 dejó anotado (fuente: memoria del proyecto, **no verificado
de forma independiente**): las migraciones `0002`…`0009` se aplicaron ese día; las 16 tablas de
`public` tienen RLS activo; `orders` y `order_items` **no existen**; `0004` no necesitó cambios.

| Migración | ¿Aplicada? | Fecha | Evidencia |
|---|---|---|---|
| 0001_catalog_schema_fix | | | |
| 0002_media_assets | | | |
| 0003_profile_private | | | |
| 0004_lock_remaining_rls | | | |
| 0005_publish_profile_rpc | | | |
| 0006_username | | | |
| 0007_optimistic_concurrency | | | |
| 0008_moderacion_y_cumplimiento | | | |
| 0009_shared_rate_limits | | | |
| **0010_validar_bloques** (F3) | ❌ escrita, sin aplicar | | |
| **0011_limites_de_escritura** (F5) | ❌ escrita, sin aplicar | | |
| **0012_descubrimiento_y_feed** (F11) | ❌ escrita, sin aplicar | | |
| **0013_cuotas** (F11) | ⬜ ni escrita — necesita la decisión de cuota (§8 #19) | | |
| **0014_moderacion_operativa** (F14) | ⬜ ni escrita — necesita decidir cómo se representa un administrador **en la base** (hoy `ADMIN_USER_IDS` sólo existe en el entorno de la app) | | |

---

## 2 · RLS y políticas

Salida de las consultas B y C de `_diagnostico_parte2.sql`:

```
(pegar aquí)
```

Criterios de aceptación de F0:

- [ ] Ninguna tabla de `public` con `relrowsecurity = false`.
- [ ] Ninguna política con `qual = true` fuera de los SELECT públicos intencionales
      (`profiles`, `profile_blocks`, `products`, `services`, `feed_comments`, `feed_post_comments`).

### Funciones `security definer`

Salida de la consulta 2:

```
(pegar aquí)
```

Lista blanca esperada (todo lo que aparezca fuera de esta lista es superficie sin dueño):

| Función | Modo | Quién ejecuta | Por qué es definer |
|---|---|---|---|
| `consume_authenticated_rate_limit` | definer | `authenticated` | Escribe en `rate_limit_windows`, que nadie más debe tocar. Atada a `auth.uid()`. |
| `exportar_mis_datos` | definer | `authenticated` | Lee tablas ajenas al usuario para armar el export. Atada a `auth.uid()`. |
| `eliminar_mi_cuenta` | definer | `authenticated` | Borra en cascada. Atada a `auth.uid()`. |
| `publish_profile` | **invoker** | `authenticated` | Debe respetar RLS: es la garantía de que A no publica el perfil de B. |

---

## 3 · Columnas sensibles y deuda del prototipo

Salidas de las consultas 3, 4 y 5:

```
(pegar aquí)
```

- [ ] `profiles` **no** tiene `legal_settings` ni `draft_content` (P-01).
- [ ] `orders` / `order_items`: confirmar que no existen (P-03).
- [ ] `donations`: confirmar el esquema y decidir política (P-03).
- [ ] `artist` / `merch` / `donations` con `qual = true`: decidir retiro (P-03b).
- [ ] `_backup_profiles_20260805`: decidir archivo y borrado (P-03b).

> **Decisión pendiente y bloqueante para F7** (§8, acción #6): qué se hace con
> `orders`/`order_items`/`donations`. Las dos opciones que el plan admite son *implementar el
> modelo de pedidos de verdad* o *retirar las pantallas*. Mientras no se decida, las pantallas
> `/perfil/pedidos` y `/perfil/dashboard` siguen rotas para el usuario — ver la mitigación
> aplicada en `IMPLEMENTACION_VIBE_EMPRESARIAL.md` (§P-03).

---

## 4 · Comprobaciones externas e independientes

Las cuatro que faltaban del paso 4 de `DESPLIEGUE.md`. Se ejecutan **desde fuera**, con la anon
key pública, contra el dominio real. Todas deben **fallar**; el éxito de cualquiera es un agujero.

| # | Comando | Esperado | Obtenido |
|---|---|---|---|
| 1 | `curl "$SUPABASE_URL/rest/v1/profiles?select=*" -H "apikey: $ANON"` | sin `legal_settings`, `draft_content`, `user_id`, `owner_user_id` | |
| 2 | `curl "$SUPABASE_URL/rest/v1/profile_private?select=*" -H "apikey: $ANON"` | 0 filas o 401 | |
| 3 | `curl -X POST https://<dominio>/api/cleanup-orphaned-files -H "Content-Type: application/json" -d '{"folder":"audio"}'` | **401** | |
| 4 | `curl "https://<dominio>/api/image-proxy?url=https://pub-XXX.r2.dev.ejemplo.com/x"` | **400** | |
| 5 | Guardar un enlace `javascript:alert(1)` en un bloque y abrir el perfil público | el enlace queda inerte | |
| 6 | Pegar `https://<dominio>/<username>` en WhatsApp | tarjeta con nombre y foto del artista | |

Desde F13 esto deja de hacerse a mano: `scripts/smoke-staging.mjs` automatiza 1, 3, 4 y añade
salud y sitemap.

---

## 5 · Inventario de variables de entorno

Nombres canónicos en `.env.example`. Marcar el estado real de cada una **por entorno**.
No pegar valores aquí, jamás.

| Variable | Local (`.env.local`) | Vercel producción | Vercel preview | Staging (F13) |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | | | | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | | | | |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | | | | |
| `NEXT_PUBLIC_SITE_URL` | | ✅ *(según el plan)* | | |
| `R2_ACCOUNT_ID` | | | | |
| `R2_ENDPOINT` | | | | |
| `R2_ACCESS_KEY_ID` | | | | |
| `R2_SECRET_ACCESS_KEY` | | | | |
| `R2_BUCKET_NAME` | | | | |
| `ADMIN_USER_IDS` | | ✅ *(según el plan)* | | |
| `TOGETHER_API_KEY` | ❌ **ausente (P-02)** | ❌ **ausente (P-02)** | | |
| `META_APP_ACCESS_TOKEN` | | | | |
| `TRUSTED_PROXY` | no aplica | no aplica (Vercel se autodetecta) | | |

---

## 6 · Versión de Postgres

Salida de la consulta 7. La necesita `supabase/config.toml` (F6) para que el entorno local
reproduzca producción.

```
(pegar aquí)
```

`supabase/config.toml` quedó escrito con `major_version = 15`, que es el valor por defecto de
Supabase. **Si la consulta devuelve otra cosa, corregir ese archivo antes de correr `db:verify`**;
con la versión equivocada, el entorno local no reproduce producción y `db:verify` da una falsa
tranquilidad.

---

## 7 · Riesgo declarado

Si el diagnóstico revela una tabla abierta con datos reales dentro, se cierra **el mismo día** con
una migración nueva (siguiente número libre), antes de continuar con cualquier otra fase.
