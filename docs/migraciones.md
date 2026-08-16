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

El código nuevo debe tolerar el esquema viejo durante el intervalo.

Eso es exactamente lo que hoy hacen los fallbacks en cascada de
`lib/musicFeed.ts`, `lib/catalog.ts`, `lib/feed/discovery.ts` y
`lib/feed/publicPosts.ts` (P-15). La diferencia que introduce esta política es
que pasan a ser **deliberados y temporales**, no permanentes: se retiran en
cuanto `db:verify` demuestra que el esquema es conocido.

También es lo que hace `checkAuthenticatedRateLimit` cuando la RPC de `0009` no
existe (`PGRST202` → cae al contador local) y lo que hace el "modo observación"
de `lib/blocks-schema.ts` mientras `0010` no está aplicada.

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
| 0001 | `catalog_schema_fix` | Esquema del catálogo | ✅ *(por confirmar en F0)* |
| 0002 | `media_assets` | Propiedad de archivos de R2 | ✅ *(por confirmar)* |
| 0003 | `profile_private` | Saca DNI y borradores de la tabla pública | ✅ *(por confirmar)* |
| 0004 | `lock_remaining_rls` | RLS en todo lo que faltaba | ✅ *(por confirmar)* |
| 0005 | `publish_profile_rpc` | Publicación atómica | ✅ *(por confirmar)* |
| 0006 | `username` | Identidad real, única, con historial | ✅ *(por confirmar)* |
| 0007 | `optimistic_concurrency` | Versión optimista de la publicación | ✅ *(por confirmar)* |
| 0008 | `moderacion_y_cumplimiento` | Reportes, bloqueos, export, borrado | ✅ *(por confirmar)* |
| 0009 | `shared_rate_limits` | Contador compartido en Postgres | ✅ *(por confirmar)* |
| **0010** | `validar_bloques` | Restricciones del JSONB + `publish_profile` v3 | ✍️ escrita, ❌ sin aplicar |
| **0011** | `limites_de_escritura` | Triggers anti-spam en las 5 tablas de escritura | ✍️ escrita, ❌ sin aplicar |
| **0012** | `descubrimiento_y_feed` | RPC de descubrimiento + índices keyset | ✍️ escrita, ❌ sin aplicar |
| 0013 | `cuotas` | Cuota de almacenamiento por perfil | ⬜ ni escrita |
| 0014 | `moderacion_operativa` | Estados de takedown + panel de admin | ⬜ ni escrita |

Las marcas "por confirmar" se resuelven ejecutando `supabase/_diagnostico_estado.sql`
y pegando el resultado en [`estado-desplegado.md`](estado-desplegado.md).

**Las tres migraciones escritas y sin aplicar (`0010`–`0012`) no rompen nada
mientras esperan.** El código que las acompaña detecta su ausencia y sigue
funcionando como antes: el validador de bloques corre en modo observación, y
`fetchProductSellers`/`fetchServiceProviders` caen a la agregación en
JavaScript si `descubrimiento_perfiles` no existe. Es la regla 4 de arriba
aplicada a conciencia — el orden de despliegue (migración primero, código
después) es el recomendado, pero acá el inverso también es seguro.

### Correcciones aplicadas a `0010`–`0012` el 2026-08-16

Las tres siguen **sin aplicar**, así que corregirlas en su sitio no viola la
regla forward-only: no hay ninguna base en la que ya hayan corrido. Los tres
cambios salieron de la auditoría adversarial:

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

---

## El baseline

`supabase/migrations/0000_baseline.sql` **todavía no existe**. Es el esquema
completo tal como quedó tras `0009`, y es lo que permite que `db reset`
reconstruya todo desde cero.

Se genera con `supabase db diff` contra la base real, así que requiere
`supabase link` y credenciales. Ver
[`../supabase/legacy/README.md`](../supabase/legacy/README.md) para el
procedimiento exacto y para por qué los 23 `.sql` históricos no se archivaron
todavía.

**Hasta que el baseline exista, `pnpm db:verify` no puede pasar**: las
migraciones numeradas dan por existentes tablas que solo crean los `.sql`
sueltos (`feed_comments`, `music_feed`, `profile_questions`,
`author_certificates`, `licenses`, `credit_requests`).

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

1. Backup de producción (Supabase → Database → Backups). **Antes**, no después.
2. Aplicar la migración, **una sola**, y correr su bloque de verificación.
3. Recién entonces la siguiente.
4. Promover el despliegue de código en Vercel.
5. `pnpm smoke` apuntado a producción.
6. Observar errores 30 minutos.
