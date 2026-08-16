# Runbook — Takedown / DMCA

**Cuándo:** llega una notificación de infracción de derechos de autor (o de
contenido ilegal) sobre material alojado en un perfil.

**Estado:** el esqueleto de datos existe (`content_reports`, `is_suspended`,
`audit_log` en 0008). La **operación completa** (panel de administración, flujo
de estados con plazos) es F14 y depende de DDL (`0014_moderacion_operativa.sql`)
y de decisiones legales. Este runbook define el proceso mientras tanto.

## Canal

Las notificaciones legales llegan al **correo institucional** (P-30). Hoy
`LEGAL_CONTACT_EMAIL` en `lib/site.ts` es un correo personal marcado con ⚠️:
cambiarlo a institucional es parte de F14 (acción humana #17).

## Flujo (SLA a fijar por el responsable legal — acción humana #18)

1. **Recepción.** Registrar la notificación: quién reclama, qué contenido (URL
   del perfil/bloque), base del reclamo. Crear/actualizar la fila en
   `content_reports`.
2. **Evaluación.** ¿La notificación es válida y suficiente? Para copyright se
   exige la declaración jurada (ya la valida `lib/moderation.ts`).
3. **Suspensión.** Si procede, marcar el perfil `is_suspended = true`. Efecto:
   - RLS oculta el contenido de `profile_blocks` (0008).
   - El código filtra el perfil del descubrimiento y del feed de música (P-34,
     segunda capa: `lib/feed/discovery.ts`, `lib/musicFeed.ts`).
   - El sitemap deja de listarlo (join `!inner` + RLS).
   - **Pendiente F10:** invalidar la caché del perfil al suspender, para que una
     página cacheada no siga sirviéndose. Hoy no hay caché de página (el perfil
     se hidrata en cliente), así que no aplica todavía; al hacer F10 se añade la
     invalidación.
4. **Notificar al usuario.** Motivo y cómo presentar una contranotificación.
5. **Contranotificación / restitución.** Si el usuario responde válidamente y
   procede, revertir `is_suspended` dentro del plazo legal.
6. **Cierre.** Resolver el `content_report` con nota. Todo queda en `audit_log`.

## Plazos (a completar — decisión legal)

| Etapa | Plazo objetivo |
|---|---|
| Acuse de recibo | _(por definir)_ |
| Evaluación → suspensión | _(por definir)_ |
| Ventana de contranotificación | _(por definir, típico 10–14 días)_ |
| Restitución tras contranotificación válida | _(por definir)_ |

## Verificación de que la suspensión es efectiva

Prueba manual (y E2E en F14): suspender un perfil de prueba y confirmar que
**no** aparece en: feed de música, descubrimiento/tienda, sitemap, ni su página
pública muestra bloques. Las dos primeras están cubiertas por pruebas unitarias
del filtro (`lib/feed/discovery.test.ts`).
