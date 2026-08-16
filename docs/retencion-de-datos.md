# Política de retención de datos — Vibe

Cierra **P-32**. Cuánto se guarda cada cosa y cuándo se borra. Base legal: Ley
29733 (Perú, protección de datos personales) y GDPR arts. 5.1.e (limitación del
plazo) y 17 (derecho de supresión).

## Principio

No se guarda nada más tiempo del necesario para el fin por el que se recogió.
El dato que ya no cumple una función es superficie de riesgo, no un activo.

## Tabla de retención

| Dato | Dónde | Retención | Al vencer |
|---|---|---|---|
| Perfil publicado (bloques, catálogo) | Postgres + R2 | mientras la cuenta exista | se borra al eliminar la cuenta |
| Borradores (`profile_private.draft_content`) | Postgres | mientras la cuenta exista | idem |
| DNI / datos legales (`legal_settings`) | `profile_private` | mientras la cuenta exista | se borra al eliminar la cuenta |
| Cuenta eliminada | — | **0 días**: `eliminar_mi_cuenta()` borra base + R2 | nada queda salvo lo legalmente exigible |
| `content_reports` resueltos | Postgres | 12 meses tras resolución | se anonimizan o se borran |
| `audit_log` | Postgres | 12 meses | se poda |
| Logs de servidor | drain externo | 30 días (configurable en el drain) | rotación automática del drain |
| Rate-limit windows | Postgres | efímero (poda perezosa) | se autolimpian al vencer |
| Objetos huérfanos en R2 | R2 | hasta la limpieza; ventana de gracia 7 días | los borra `cleanup-orphaned-files` |
| Username liberado (historial) | Postgres | permanente (para redirección) | no se borra (no es PII) |
| Consentimiento de analítica (`vibe:consentimiento-analitica`) | localStorage del visitante | hasta que el visitante borre su almacenamiento | desaparece con el navegador; se vuelve a preguntar |
| Señales de Vercel Analytics | Vercel | **sólo si el visitante aceptó**; retención del plan de Vercel | no se cargan sin consentimiento |

## Cuentas eliminadas

`lib/moderation.ts` → `eliminar_mi_cuenta()` (RPC `security definer`, atada a
`auth.uid()`). `/api/eliminar-cuenta` borra **R2 antes que la base**, en el
orden correcto, para no dejar objetos sin dueño. Tras el borrado:

- No queda perfil, ni bloques, ni borradores, ni DNI.
- El **username** queda liberado o reservado según se decida en F14 (hoy: el
  historial se conserva para redirección; no es PII).
- Con object versioning en R2 (ver [`backups.md`](backups.md)), los objetos
  borrados son recuperables durante la ventana de versioning **sólo por un
  administrador** y **sólo** para atender una reclamación legítima; vencida la
  ventana, desaparecen de verdad.

## Derechos del titular (Ley 29733 arts. 19–20; GDPR 15/17/20)

- **Acceso/portabilidad:** `exportar_mis_datos()` devuelve un JSON con **sólo**
  lo del solicitante. Conectado a la UI en F14.
- **Supresión:** `eliminar_mi_cuenta()`. Conectado a la UI en F14.

## Analítica y consentimiento (P-31)

`@vercel/analytics` **ya no se monta solo**. Lo monta
`components/legal/consentimiento-cookies.tsx`, y sólo tras un sí explícito:

- Sin decisión guardada → no se carga nada. Fail-closed, igual que el resto del
  proyecto; un valor manipulado a mano en el almacenamiento cuenta como "sin
  decidir" (`normalizarDecision`).
- La decisión vive en el **localStorage del visitante**, no en una cookie: sólo
  la necesita el navegador, y mandarla en cada petición sería exactamente el
  tipo de cookie que `/legal/cookies` dice no usar.
- La decisión no se asocia a ninguna cuenta ni viaja al servidor: no es un dato
  personal que Vibe trate, es una preferencia local.
- En desarrollo y en las pruebas la analítica no se carga **nunca**, ni siquiera
  aceptada.

Probado en `lib/consentimiento-cookies.test.ts` (11 casos, incluida la
manipulación del valor y el almacenamiento bloqueado) y en
`tests/e2e/consentimiento-cookies.spec.ts` (7 casos, incluido el render sin
JavaScript).

## Estado

- [x] Política documentada.
- [x] Borrado de cuenta implementado y ordenado (base + R2).
- [x] Consentimiento de analítica implementado, fail-closed y probado (P-31).
- [ ] Poda automática de `content_reports`/`audit_log` a 12 meses — necesita un
      job programado (cron de Supabase o Vercel) — **decisión/DDL**.
- [ ] Retención del drain configurada a 30 días — **humano** (depende del
      destino del drain, ver [`observabilidad.md`](observabilidad.md)).
