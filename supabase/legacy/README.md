# `supabase/legacy/` — SQL histórico

> **Estado: PREPARADO, PERO VACÍO A PROPÓSITO.** Los 23 `.sql` sueltos siguen
> en `supabase/`. Mover archivos aquí **antes** de que exista el baseline sería
> destruir la única forma de reconstruir el esquema. Lee el porqué abajo.

## Qué va a vivir aquí

Los `.sql` sin numerar que viven hoy en `supabase/` y que se corrieron a mano
en el SQL Editor en algún momento de la historia del proyecto:

```
add_master_role.sql                     harden_licenses_and_certificates_rls.sql
author_certificates_table.sql           harden_products_services_rls.sql
band_profiles.sql                       harden_profiles_rls.sql
credit_requests_table.sql               licenses_table.sql
drop_orphaned_tables.sql                limpiar_datos_prueba.sql
feed_post_comments_table.sql            profile_questions_table.sql
fix_group_creation_rls.sql              profiles_display_settings.sql
fix_security_linter_warnings.sql        profiles_legal_settings.sql
fix_services_price_duration.sql         profiles_musician_category.sql
fix_storage_bucket_listing.sql          reset_my_content.sql
                                        setup_vibra.sql
```

(Los dos `_diagnostico_*.sql` **no** se mueven: son herramientas de solo lectura
que se siguen usando.)

## Por qué todavía no se movieron

Es la ambigüedad de P-14: conviven `.sql` históricos sueltos con
`migrations/` numeradas, y nadie sabe cuál manda. El plan la resuelve así (F6):

1. Generar `supabase/migrations/0000_baseline.sql` con `supabase db diff`
   **contra la base real**, para que contenga el esquema completo tal como
   quedó tras `0009`.
2. Verificar con `pnpm db:verify` que `db reset` reconstruye todo desde cero.
3. Verificar con `supabase db diff --linked` que **no hay diferencias** contra
   producción. Este es el paso que demuestra que el baseline es fiel.
4. **Recién entonces** mover estos archivos aquí.

Los pasos 1 y 3 requieren acceso a la base de producción y `supabase link`.
Esta sesión no lo tiene, así que el baseline no existe todavía.

Mover los archivos ahora tendría dos consecuencias concretas y malas:

- **Se perdería la única receta del esquema.** Sin baseline, estos 23 archivos
  son lo único que describe las tablas que las migraciones numeradas dan por
  existentes (`feed_comments`, `music_feed`, `profile_questions`,
  `author_certificates`, `licenses`, `credit_requests`…). Archivarlos como "no
  ejecutar" dejaría el proyecto sin forma de levantar una base nueva.
- **Se romperían mensajes que el código muestra al usuario.** `lib/track-comments.ts`
  dice literalmente *"falta correr supabase/setup_vibra.sql"*, y hay mensajes
  equivalentes en `lib/post-comments.ts`, `lib/profile-questions.ts` y
  `lib/moderation.ts`. Esas rutas tienen que seguir siendo válidas.

## Cómo completarlo cuando el baseline exista

```powershell
# 1. Con `supabase link` ya hecho y Docker corriendo:
supabase db diff --linked --schema public -f 0000_baseline
# revisar el archivo generado ANTES de aceptarlo

# 2. Comprobar que reconstruye desde cero
pnpm db:verify

# 3. Comprobar que no hay diferencias contra producción
supabase db diff --linked --schema public
#    → sin salida = el baseline es fiel. Con salida = falta algo, no seguir.

# 4. Recién ahora, archivar (git mv conserva el historial)
git mv supabase/add_master_role.sql supabase/legacy/
# …y así con los 21 restantes (NO mover los dos _diagnostico_*.sql)

# 5. Actualizar los mensajes del código que citan estas rutas
#    (lib/track-comments.ts, lib/post-comments.ts, lib/profile-questions.ts,
#     lib/moderation.ts) para que apunten a supabase/legacy/…
```

## Regla, una vez completado

**Histórico. Ya incorporado al baseline. NO EJECUTAR.**

Se conservan por trazabilidad —explican por qué el esquema quedó como quedó— y
porque `harden_profiles_rls.sql` → `fix_group_creation_rls.sql` →
`setup_vibra.sql` es el caso de estudio de por qué existe la política
forward-only de [`docs/migraciones.md`](../../docs/migraciones.md).
