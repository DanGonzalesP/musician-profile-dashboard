# Runbook — Moderación de reportes

**Audiencia:** personal interno con permiso de moderación.  
**Panel:** `/admin/reportes`.  
**Alcance:** operación del flujo implementado. No establece un procedimiento legal ni promete cumplimiento normativo.

## Acceso y permisos

Inicia sesión con una cuenta que tenga rol `owner` o `moderator`. El permiso se comprueba en servidor mediante `auth.uid()` y `has_platform_permission('moderation')`; el rol `maintenance` por sí solo no autoriza revisar reportes. Si no tienes permiso, el panel no estará disponible. No compartas cuentas ni intentes saltarte el control del panel/API.

La asignación y revocación de roles corresponde a un `owner` y se hace mediante el procedimiento administrativo de roles; queda auditada. No se concede acceso mediante metadatos editables del perfil.

## Revisar y decidir

1. Abre `/admin/reportes`. La cola inicial muestra pendientes; usa las pestañas para consultar **Pendientes**, **En revisión**, **Aceptados** o **Rechazados**. La lista se pagina de 50 en 50.
2. Lee el motivo, detalles, contenido señalado y datos disponibles del reporte. Si hay nombre de usuario, puedes abrir el perfil en otra pestaña para contextualizar. No compartas detalles o datos del reportante fuera del trabajo autorizado.
3. En un reporte pendiente, escribe una nota de al menos 10 caracteres y selecciona **Abrir revisión**. El reporte pasa a “En revisión”.
4. En revisión, escribe una nota de 10–4000 caracteres y elige una decisión:
   - **Rechazar reporte:** cierra como rechazado sin suspender el perfil.
   - **Aceptar sin retirar el perfil:** cierra como aceptado; no cambia por sí misma la visibilidad del perfil.
   - **Aceptar y retirar todo el perfil:** cierra como aceptado y suspende el perfil entero, no solo el elemento señalado. Confirma el aviso de cambio de visibilidad.
5. Usa **Ver historial** para consultar las últimas 100 acciones del expediente, con acción, nota y fecha. La consulta independiente de auditoría añade el identificador del responsable.

Cada acción requiere permiso y nota; el servidor registra evento inmutable. El sistema impide que una persona revise un reporte sobre su propio perfil o uno que ella misma presentó. Si te afecta alguno de esos casos, no continúes: debe intervenir otro moderador autorizado.

La migración 0057 amplía la titularidad a `owner_user_id` de los grupos: el
propietario puede consultar decisiones, solicitar revisión, marcar avisos como
leídos e incluir sus decisiones en la exportación. Los miembros y administradores
del grupo no reciben por ello acceso a las solicitudes privadas del propietario.
La prohibición de resolver un expediente propio también incluye al dueño del
grupo, tanto en la decisión inicial como en la revisión. La disponibilidad de
una revisión ajena usa comparaciones que admiten `user_id` nulo en grupos.
Estas rutas quedan pendientes de las pruebas finales con cuentas separadas.

## Conflictos y fallos

Las decisiones incluyen la versión que se mostró al cargar la cola. Si otro cambio ocurrió antes de guardar, la operación responde como conflicto: actualiza la lista, vuelve a revisar el expediente y decide sobre la versión vigente; no repitas a ciegas.

Si la interfaz indica **“Decisión guardada. La actualización de caché necesita revisión”**, la decisión ya quedó guardada y no debe repetirse. La invalidación de caché falló: registra internamente la incidencia para que se revise la disponibilidad pública del perfil. Si no se pudo confirmar el resultado por un error de red, actualiza la lista y consulta el estado/historial antes de volver a actuar.

## Restauración

En un expediente aceptado, **Restituir perfil y revocar la decisión** solo está disponible si ese mismo expediente causó la suspensión vigente. Escribe una nota y confirma. Esta acción revoca esa decisión y deja el reporte rechazado; no levanta suspensiones originadas por otro expediente o causa.

## Límites del proceso

El sistema no envía notificaciones automáticas, no implementa un canal de apelación ni define plazos legales o SLA. No infieras que se notificó al reportante o al titular, ni comuniques plazos o garantías legales basándote en este panel. Sigue cualquier procedimiento externo aprobado por la organización; este runbook describe únicamente las funciones disponibles.

La ruta `/admin/auditoria` está implementada en código y **pendiente de validación y de aplicar 0042**. Muestra decisiones de moderación, admite filtrar por identificador de reporte y pagina de 50 en 50. La actividad histórica de `audit_log` se reserva a `owner` y no expone sus metadatos. Algunos eventos históricos fueron comunicados por clientes antiguos y no acreditan por sí solos decisiones del servidor. No uses esta pantalla como evidencia operativa hasta que se confirme su comportamiento y acceso.

## Referencias de implementación

- Panel y acciones: `app/admin/reportes/page.tsx`, `app/admin/reportes/report-queue.tsx`.
- API y actualización de caché: `app/api/admin/reportes/route.ts`.
- Permisos de plataforma: `supabase/migrations/0039_roles_plataforma.sql`.
- Cola, control de versión, recusación, suspensión, restauración e historial: `supabase/migrations/0041_operacion_moderacion.sql`.
