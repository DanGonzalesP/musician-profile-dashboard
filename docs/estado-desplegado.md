# Estado desplegado — F0

> **ESTADO: ABIERTO / BASE DE DATOS SINCRONIZADA.**
> Supabase y Vercel se verificaron directamente el 2026-08-16. El backup manual, el baseline
> `0000` y el despliegue de `0010`–`0012` están completos. Quedan pendientes las decisiones sobre
> las tablas heredadas y el inventario de Cloudflare/variables.

Última actualización: 16 de agosto de 2026 · Evidencia recopilada por: **Codex**

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
0001=true; 0002=true; 0003=true; 0004=true; 0005+0007=true;
0006=true; 0007=true; 0008=true; 0009=true;
0010=true; 0011=true; 0012=true; 0013=false; 0014=false.
```

Lo que el diagnóstico del 2026-08-05 dejó anotado (fuente: memoria del proyecto, **no verificado
de forma independiente**): las migraciones `0002`…`0009` se aplicaron ese día; las 16 tablas de
`public` tienen RLS activo; `orders` y `order_items` **no existen**; `0004` no necesitó cambios.

| Migración | ¿Aplicada? | Fecha | Evidencia |
|---|---|---|---|
| 0001_catalog_schema_fix | ✅ | 2026-08-16 | `services.profile_id` y ambos `position_index` existen; se corrigió el diagnóstico que buscaba una columna equivocada |
| 0002_media_assets | ✅ | 2026-08-16 | `media_assets` existe |
| 0003_profile_private | ✅ | 2026-08-16 | `profile_private` existe; no hay `legal_settings` público |
| 0004_lock_remaining_rls | ✅ | 2026-08-16 | 24/24 tablas de `public` con RLS activo |
| 0005_publish_profile_rpc | ✅ | 2026-08-16 | `publish_profile` de 3 argumentos existe |
| 0006_username | ✅ | 2026-08-16 | `username` existe y es único |
| 0007_optimistic_concurrency | ✅ | 2026-08-16 | `content_version` existe |
| 0008_moderacion_y_cumplimiento | ✅ | 2026-08-16 | existen `content_reports`, `user_blocks`, `audit_log` |
| 0009_shared_rate_limits | ✅ | 2026-08-16 | existen tabla y RPC del rate limit |
| **0010_validar_bloques** (F3) | ✅ | 2026-08-16 | constraints de tipo, tamaño, objeto y posición verificadas |
| **0011_limites_de_escritura** (F5) | ✅ | 2026-08-16 | tabla, función, 5 triggers y revocación de `execute` verificadas |
| **0012_descubrimiento_y_feed** (F11) | ✅ | 2026-08-16 | RPC e índices keyset disponibles; índice opcional de `profile_blocks` omitido al no existir `created_at` |
| **0013_endurecer_advisors_supabase** (F0/F5/F14) | ✅ | 2026-08-16 | Funciones privilegiadas fuera del esquema expuesto, rate limit fail-closed, tablas internas deny-all y respaldo privado |
| **0014_explicitar_rls_respaldo_privado** (F0) | ✅ | 2026-08-16 | Política deny-all explícita para el respaldo ya privado; Security Advisor en 0 infos |
| **0015_relacion_bloques_perfiles** (F0/F11) | ✅ | 2026-08-16 | FK `NOT VALID`; producción conserva pendiente el refresco de caché de 0016 |
| **0016_refrescar_cache_postgrest** (F0/F11) | 🟡 verificada localmente; pendiente de producción | Publica en la Data API la FK de 0015 sin reiniciar la base |
| **0017_cuotas** (F11) | ⬜ ni escrita — necesita la decisión de cuota (§8 #19) | | |
| **0018_moderacion_operativa** (F14) | ⬜ ni escrita — necesita decidir cómo se representa un administrador **en la base** (hoy `ADMIN_USER_IDS` sólo existe en el entorno de la app) | | |

---

## 2 · RLS y políticas

Salida de las consultas B y C de `_diagnostico_parte2.sql`:

```
B: 24 tablas; todas con `relrowsecurity=true`.
C: 9 SELECT públicos con `qual=true`. Fuera de la lista esperada aparecen
`artist`, `merch`, `music_feed` y `username_history`; requieren decisión explícita.
```

Criterios de aceptación de F0:

- [x] Ninguna tabla de `public` con `relrowsecurity = false`.
- [ ] Ninguna política con `qual = true` fuera de los SELECT públicos intencionales
      (`profiles`, `profile_blocks`, `products`, `services`, `feed_comments`, `feed_post_comments`).

### Funciones `security definer`

Salida de la consulta 2:

```
Definer detectadas: `consume_authenticated_rate_limit`, `eliminar_mi_cuenta`,
`handle_new_user`, `record_username_change`, `registrar_auditoria`,
`set_comment_author_name` y `set_question_asker_name`.
Todas tienen `search_path` fijo; ninguna concede ejecución a `anon`.
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
No existen `legal_settings` ni `draft_content` en `profiles`.
`user_id` y `owner_user_id` siguen físicamente presentes, pero `anon` no tiene SELECT.
`orders` y `order_items` no existen. `donations` sí existe: 8 columnas, RLS activo y 0 políticas.
Deuda heredada: `_backup_profiles_20260805`, `artist`, `donations` y `merch`.
```

- [x] `profiles` **no** tiene `legal_settings` ni `draft_content` (P-01).
- [x] `orders` / `order_items`: confirmado que no existen (P-03).
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
| 3 | `curl -X POST https://<dominio>/api/cleanup-orphaned-files -H "Content-Type: application/json" -d '{"folder":"audio"}'` | **401** | ✅ 401 (`pnpm smoke`) |
| 4 | `curl "https://<dominio>/api/image-proxy?url=https://pub-XXX.r2.dev.ejemplo.com/x"` | **400** | ✅ 400 (`pnpm smoke`) |
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
PostgreSQL 17.6 on aarch64-unknown-linux-gnu
version_mayor = 17
```

`supabase/config.toml` se corrigió a `major_version = 17` el 2026-08-16, antes de correr
`db:verify`.

---

## 7 · Riesgo declarado

Si el diagnóstico revela una tabla abierta con datos reales dentro, se cierra **el mismo día** con
una migración nueva (siguiente número libre), antes de continuar con cualquier otra fase.
