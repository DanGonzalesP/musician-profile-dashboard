# `supabase/legacy/` — SQL histórico

> **Estado: ARCHIVADO. NO EJECUTAR.** El baseline reproducible existe en
> `supabase/migrations/0000_baseline.sql` y producción coincide con la cadena
> versionada hasta `0012`.

## Qué vive aquí

Los `.sql` sin numerar que se corrieron a mano
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

(Los tres `_diagnostico_*.sql` **no** se movieron: son herramientas de solo lectura
que se siguen usando.)

## Evidencia del cierre de P-14

El 2026-08-16 se completó F6 en este orden:

1. Se creó un backup manual completo de producción (`schema`, `data` y `roles`)
   fuera del repositorio.
2. Se generó `0000_baseline.sql` desde el esquema real tras `0009`.
3. `pnpm db:verify` reconstruyó una base limpia desde `0000` hasta `0012`.
4. `pnpm test:db` pasó sus 13 pruebas de seguridad y comportamiento.
5. Se aplicaron `0010`, `0011` y `0012` en producción, una por una, con
   verificación después de cada migración.
6. La comparación enlazada confirmó que no hay diferencias estructurales ni de
   permisos. `pg-delta` sólo propone normalizar el formato textual —sin cambiar
   el cuerpo— de tres funciones heredadas; `migra` además recrea cuatro
   políticas con una definición idéntica. No se aplicó ese ruido como DDL.
7. Los SQL históricos se movieron con `git mv` y los mensajes del código dejaron
   de indicar que se ejecuten manualmente.

## Regla

**Histórico. Ya incorporado al baseline. NO EJECUTAR.**

Se conservan por trazabilidad —explican por qué el esquema quedó como quedó— y
porque `harden_profiles_rls.sql` → `fix_group_creation_rls.sql` →
`setup_vibra.sql` es el caso de estudio de por qué existe la política
forward-only de [`docs/migraciones.md`](../../docs/migraciones.md).
