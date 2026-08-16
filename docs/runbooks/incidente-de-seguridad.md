# Runbook — Incidente de seguridad

**Cuándo:** credencial filtrada, acceso no autorizado, exposición de datos
personales, o sospecha fundada de cualquiera de ellos.

## 1. Contener (minutos, no horas)

- Si hay una **credencial filtrada**, revocarla **ya** (ver
  [`../rotacion-de-credenciales.md`](../rotacion-de-credenciales.md)):
  - anon key de Supabase → regenerar en Supabase.
  - claves de R2 → revocar el token en Cloudflare.
  - `TOGETHER_API_KEY` / `META_APP_ACCESS_TOKEN` → regenerar.
- Si hay **acceso no autorizado** a la app, promover un deploy limpio y, si hace
  falta, poner la app en mantenimiento.
- **No** borrar logs ni evidencia: se necesitan para el análisis y para la
  notificación legal.

## 2. Evaluar el alcance

- ¿Qué credencial/ruta se comprometió? ¿Qué permite? (la anon key sólo da lo que
  RLS permite; la service role —que **no vive en la app**— lo daría todo).
- ¿Se accedió a **datos personales**? (correos, DNI en `legal_settings`,
  contenido privado). Revisar `audit_log` y logs.
- ¿Sigue activo el acceso?

## 3. Rotar y restaurar

- Rotar **todas** las credenciales del mismo alcance, no sólo la filtrada
  (patrón swap sin downtime en el doc de rotación).
- Si hubo modificación de datos, ver
  [`restaurar-base.md`](restaurar-base.md).

## 4. Notificar (Ley 29733 / GDPR)

Si hubo **exposición de datos personales**:

- **Ley 29733 (Perú):** notificar a la Autoridad Nacional de Protección de
  Datos y a los titulares afectados según el reglamento vigente.
- **GDPR (si aplica a usuarios en la UE):** notificar a la autoridad de control
  en **≤ 72 h** desde que se tiene constancia (art. 33), y a los titulares si el
  riesgo es alto (art. 34).
- El correo legal institucional (P-30, F14) es el canal. Los plazos concretos y
  el responsable se fijan como **acción humana #18**.

## 5. Post-mortem

- Línea de tiempo con `request_id` y `audit_log`.
- Causa raíz y arreglo con prueba que lo fije.
- Actualizar este runbook con lo aprendido.

## Invariantes que reducen el radio de explosión

- Service role **fuera de la app**: una ruta comprometida no da acceso total.
- RLS con `auth.uid()` real en toda tabla: la anon key filtrada no lee lo ajeno.
- `media_assets` + `audit_log`: todo acceso privilegiado deja rastro.
