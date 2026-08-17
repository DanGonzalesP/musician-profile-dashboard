# Política de migraciones — forward-only

Cierra P-14. Es la regla que convierte el esquema de Vibe en un artefacto
versionado, aplicable y reproducible, en vez de folclore repartido entre 23
archivos sueltos y el historial del SQL Editor.

---

## Las seis reglas

### 1. Nunca se edita una migración ya aplicada

Ni para arreglar un typo. El arreglo va en una migración **nueva**.

Editar una aplicada hace que la base local y la de producción diverjan en
silencio. No es hipotético: este proyecto ya lo vivió con la cadena
`harden_profiles_rls.sql` → `fix_group_creation_rls.sql` → `setup_vibra.sql`,
donde cada archivo intentaba corregir lo que el anterior había roto y nadie
sabía cuál estaba aplicado.

La única excepción es una migración que **todavía no se aplicó en ningún
entorno**, ni siquiera en local. En cuanto alguien corre `db reset`, deja de
serlo.

### 2. Toda migración es idempotente

`create table if not exists`, `create or replace function`,
`drop policy if exists` antes de `create policy`, `add column if not exists`.

Ya es la convención del repositorio (mira `0002`…`0011`); se mantiene. El motivo
práctico: `pnpm db:verify` reconstruye desde cero en cada corrida de CI, y una
migración que solo funciona la primera vez rompe el gate.

### 3. Los cambios destructivos van en dos despliegues

**Expandir → Contraer.**

| Paso | Qué se hace | Qué se despliega |
|---|---|---|
| Expandir | Añadir la columna/tabla nueva. Escribir en ambas. El código lee de las dos. | Migración + código, en ese orden. Nadie se rompe. |
| Contraer | En una migración **posterior**, cuando el código viejo ya no corre en ningún sitio, eliminar lo viejo. | Migración sola. |

`0003_profile_private.sql` es el ejemplo de **lo que no se debe repetir**: hace
`drop column legal_settings` y `drop column draft_content` en el mismo paso.
Fue necesario y correcto en su momento (esas columnas estaban filtrando DNIs
por la anon key y cada hora contaba), pero dejó el código anterior sin poder
volver atrás — como advierte `DESPLIEGUE.md`.

Las restricciones `check` de `0010` y `0011` siguen la regla en su versión
suave: entran como `not valid`, que las aplica a lo nuevo sin recorrer lo
histórico. La validación retroactiva es un segundo paso, en su propia migración.

### 4. Orden de despliegue: migración primero, código después

El código nuevo debe tolerar el esquema viejo durante el intervalo. Esa
compatibilidad es deliberada y temporal: se retira en cuanto `db:verify`
demuestra que el esquema es conocido y producción ya tiene la migración.

Los fallbacks en cascada de `lib/musicFeed.ts`, `lib/catalog.ts`,
`lib/feed/discovery.ts` y `lib/feed/publicPosts.ts` (P-15) se retiraron el
2026-08-16 después de verificar `0000`–`0012`. Las rutas hacen una sola consulta
al esquema canónico y propagan el error real en vez de ocultarlo como contenido
vacío o guardar sólo una parte de los datos.

Los periodos de compatibilidad de `checkAuthenticatedRateLimit` y del modo de
observación de `lib/blocks-schema.ts` se cierran por separado en F5 y F3.

### 5. Toda migración se prueba en tres lugares antes de producción

```
Supabase local  →  CI  →  staging  →  producción
  pnpm db:verify   pnpm test:db    smoke      backup + una por una
```

Ninguno de los tres primeros cuesta dinero ni afecta a un usuario real. Saltarse
uno solo tiene sentido si se acepta explícitamente el riesgo, y eso se escribe
en el PR.

### 6. Nada se ejecuta a mano en el SQL Editor de producción

El SQL Editor pasa a ser una herramienta de **solo lectura** para diagnóstico:
`_diagnostico_parte2.sql` y `_diagnostico_estado.sql` y nada más.

Toda escritura entra por una migración numerada. Si algo hay que arreglar
urgentemente a las 2 de la mañana, se arregla con una migración numerada
aplicada desde la CLI — sigue siendo rápido y además queda registrado.

---

## Numeración y nomenclatura

`NNNN_descripcion_en_espanol.sql`, con `NNNN` de cuatro dígitos y consecutivo.

Se conserva el esquema numérico existente en vez de pasar a marcas de tiempo
como Bancary: cambiar la convención a mitad de camino renombraría 11 archivos
ya aplicados, que es exactamente lo que la regla 1 prohíbe. La marca de tiempo
resuelve las colisiones entre ramas paralelas, un problema que Vibe no tiene
hoy (un desarrollador, una rama a la vez).

Si en el futuro hay varias ramas escribiendo migraciones a la vez, la colisión
se resuelve renumerando **la que no se haya aplicado todavía**.

### Estado actual

| # | Archivo | Qué hace | Aplicada |
|---|---|---|---|
| 0001 | `catalog_schema_fix` | Esquema del catálogo | ✅ producción |
| 0002 | `media_assets` | Propiedad de archivos de R2 | ✅ producción |
| 0003 | `profile_private` | Saca DNI y borradores de la tabla pública | ✅ producción |
| 0004 | `lock_remaining_rls` | RLS en todo lo que faltaba | ✅ producción |
| 0005 | `publish_profile_rpc` | Publicación atómica | ✅ producción |
| 0006 | `username` | Identidad real, única, con historial | ✅ producción |
| 0007 | `optimistic_concurrency` | Versión optimista de la publicación | ✅ producción |
| 0008 | `moderacion_y_cumplimiento` | Reportes, bloqueos, export, borrado | ✅ producción |
| 0009 | `shared_rate_limits` | Contador compartido en Postgres | ✅ producción |
| **0010** | `validar_bloques` | Restricciones del JSONB + `publish_profile` v3 | ✅ producción 2026-08-16 |
| **0011** | `limites_de_escritura` | Triggers anti-spam en las 5 tablas de escritura | ✅ producción 2026-08-16 |
| **0012** | `descubrimiento_y_feed` | RPC de descubrimiento + índices keyset | ✅ producción 2026-08-16 |
| **0013** | `endurecer_advisors_supabase` | Advisors, funciones privilegiadas y respaldo privado | ✅ producción 2026-08-16 |
| **0014** | `explicitar_rls_respaldo_privado` | Política deny-all explícita sobre el respaldo privado | ✅ producción 2026-08-16 |
| **0015** | `relacion_bloques_perfiles` | FK necesaria para el join PostgREST de la portada | ✅ producción 2026-08-16 |
| **0016** | `refrescar_cache_postgrest` | Recarga versionada de la caché tras la FK | ✅ producción 2026-08-16 |
| **0017** | `marca_tiempo_profile_blocks` | `created_at` + índice keyset para publicaciones | ✅ producción 2026-08-16 |
| **0018** | `corregir_concurrencia_y_suspension` | `GREATEST` sin calificar, conflicto de versión no reintentable, columnas de suspensión reservadas a moderación | ⬜ escrita, pendiente de producción |
| 0019 | `cuotas` | Cuota de almacenamiento por perfil | ⬜ ni escrita |
| 0020 | `moderacion_operativa` | Estados de takedown + panel de admin | ⬜ ni escrita |

El estado de `0001`–`0017` se verificó directamente contra producción el
2026-08-16 y quedó registrado en [`estado-desplegado.md`](estado-desplegado.md).

### Correcciones aplicadas a `0010`–`0012` el 2026-08-16

Estas correcciones se hicieron antes de su primera aplicación. Desde el
2026-08-16, `0010`–`0012` ya están aplicadas y son inmutables; cualquier arreglo
posterior debe ir en una migración nueva. Los tres cambios salieron de la
auditoría adversarial:

- **`0011`** — `aplicar_limite_de_escritura()` es `security definer` y se
  quedaba con el `execute` que Postgres concede a `PUBLIC` por defecto. Se le
  añadió el `revoke`. (El disparo del trigger no comprueba `EXECUTE` —el
  privilegio se verifica al **crear** el trigger—, así que revocarlo no rompe
  nada.) Se retiró además una variable declarada y nunca usada (`v_col_usuario`)
  que sugería un comportamiento que la función no tiene: el sujeto del contador
  sale de `auth.uid()`, no de la columna que declara cada trigger.

- **`0012`** — los índices keyset se creaban con `create index` a secas sobre
  `products` y `services`. Esas dos tablas nacieron **fuera** de las migraciones
  y ningún archivo del repositorio declara su `created_at`: si no la tuvieran,
  el `create index` abortaría la migración **entera**, y con ella se perdería el
  RPC `descubrimiento_perfiles`, que es lo que de verdad cierra P-16. Ahora cada
  índice comprueba antes que la tabla y la columna existan, y avisa por `notice`
  si se salta alguno. Un índice ausente cuesta velocidad; una migración abortada
  cuesta la fase. Esta fragilidad desaparece sola cuando exista el baseline
  `0000`, que es donde el esquema dejará de ser folclore.

- **`0010`** — revisada contra `0007` línea por línea (firma, `security
  invoker`, `search_path`, `for update`, versión optimista, limpieza del
  borrador y los dos `grant`): la v3 conserva todo y sólo añade la validación
  **antes** del `delete`. Sin cambios.

### Lo que `0018` corrige de `0010` y `0013`

Las tres correcciones salieron de la **primera corrida real** de las pruebas de
base de F7. Ninguna era visible leyendo el SQL: las tres necesitaban Postgres y
PostgREST de verdad. `0010` y `0013` ya están aplicadas en producción y son
inmutables (regla 1), así que el arreglo va en `0018`.

- **`GREATEST` no es una función.** `0013` calificó cada función con
  `pg_catalog.` al fijar `search_path = ''`. Correcto para todas menos para
  `GREATEST`, que es una construcción del analizador sintáctico —como
  `CURRENT_USER` o `EXTRACT`— y no vive en ningún esquema. El resultado era
  `42883 function pg_catalog.greatest(integer, integer) does not exist` **sólo
  en la rama que calcula `retry_after`**: dentro del cupo el contador respondía
  bien y reventaba justo cuando debía rechazar. `0018` la usa sin calificar.

- **`conflicto_de_version` viajaba como error transitorio.** `0010` lo levantaba
  con `errcode = 'serialization_failure'` (40001), que para todo el ecosistema
  significa "reintenta": PostgREST reintentaba en vez de devolver el error, y la
  llamada se comía el timeout completo. El conflicto es permanente —la versión
  esperada no vuelve— así que `0018` usa `PT409`, la convención de PostgREST
  para fijar el estado HTTP, y la respuesta pasa a ser un **409 inmediato**. El
  texto `conflicto_de_version` que consume `components/profile-editor.tsx` no
  cambia.

- **El dueño podía levantarse su propia suspensión.** RLS en Postgres no
  distingue columnas y `profiles_update_owner` autoriza la fila entera, así que
  un perfil suspendido por un takedown podía mandar `is_suspended = false` por
  PostgREST. `0018` añade un trigger `before update` sobre `profiles` que veta
  cambios en `is_suspended`, `suspended_reason` y `suspended_at` cuando el rol
  efectivo es `anon` o `authenticated`. Se eligió un trigger y no privilegios
  por columna (`grant update (col, …)`) porque estos obligan a enumerar todas
  las columnas y a acordarse de cada columna futura: la primera que se olvide
  rompe el editor en silencio. El hueco de **F14** ya está escrito:
  `private.es_admin(uuid)` existe como talón que devuelve `false` y se reemplaza
  con `create or replace` sobre `private.admin_users` sin tocar el trigger.

---

## El baseline

`supabase/migrations/0000_baseline.sql` existe y representa el esquema real
después de `0009`, sin datos de producción. El 2026-08-17 se comprobó que
`pnpm db:verify` reconstruye desde cero `0000`–`0018` y que las **110** pruebas
de base pasan (dos corridas seguidas, sin ningún `todo`). La comparación
enlazada del 2026-08-16 —anterior a `0018`— no encuentra diferencias estructurales ni
de permisos: sólo formato textual en tres cuerpos de función heredados. El
motor `migra` muestra además cuatro recreaciones de políticas idénticas, que no
se convirtieron en DDL por ser ruido del comparador.

Los SQL manuales que dieron origen al baseline están archivados, sin capacidad
operativa, en [`../supabase/legacy/`](../supabase/legacy/).

---

## Cómo escribir una migración nueva

1. Crear `supabase/migrations/NNNN_lo_que_hace.sql` con el siguiente número.
2. Encabezado obligatorio, siguiendo el estilo de las 11 que ya existen:
   - **Qué problema resuelve** y con qué hallazgo `P-nn` se corresponde.
   - **Por qué este diseño y no otro**, si hubo alternativa razonable.
   - **Después de cuál** hay que correrla.
   - Si es idempotente (debe serlo).
3. Escribirla idempotente.
4. `pnpm db:verify` → tiene que reconstruir desde cero sin error.
5. `pnpm test:db` → añadir o actualizar la prueba que verifica lo que la
   migración promete. Una política de RLS nueva sin prueba es una política que
   se puede reabrir en silencio.
6. Bloque de **verificación** al final del archivo: consultas de solo lectura
   que confirman que quedó aplicada. Es lo que se pega en el PR como evidencia.
7. En el PR, describir el **rollback**: qué migración lo deshace, o qué backup
   hace falta si es destructiva.

## Cómo aplicarla en producción

Ver `DESPLIEGUE.md` y [`runbooks/rollback.md`](runbooks/rollback.md). Resumen:

1. Backup de producción **antes**, no después. En el plan Free se usa un dump
   manual de `schema`, `data` y `roles`, guardado fuera del repositorio.
2. Aplicar la migración, **una sola**, y correr su bloque de verificación.
3. Recién entonces la siguiente.
4. Promover el despliegue de código en Vercel.
5. `pnpm smoke` apuntado a producción.
6. Observar errores 30 minutos.
