# Permisos del equipo

La entrada `/admin/roles` exige una sesión con permiso `roles` en Postgres.
Sólo `owner` lo tiene. El directorio muestra UUID, rol y fecha de modificación,
sin correos ni perfiles. Se consulta manualmente y pagina de veinte en veinte.
Una búsqueda exacta permite preparar una asignación a un UUID confirmado por
el operador; un resultado sin rol no confirma que la cuenta exista. La escritura
rechaza asignaciones a cuentas inexistentes.

Los roles son excluyentes: owner incluye gestión de permisos, moderación y
mantenimiento; moderator permite moderación; maintenance permite mantenimiento.
No se conceden permisos desde metadatos de Auth ni desde una lista del runtime.
Retirar un rol no elimina la cuenta ni su contenido. El primer owner sigue
requiriendo provisión administrativa fuera de la aplicación con identidad
confirmada; esta interfaz no permite autoasignárselo.

Antes de guardar se muestra la cuenta y el cambio solicitado en una confirmación.
La RPC0059 toma el bloqueo de0039, vuelve a comprobar el permiso y compara
`updated_at` con el estado consultado. Ante conflicto se debe consultar otra vez.
Delega la escritura a0039 para preservar auditoría y protección del último owner.
La función anterior sigue disponible para compatibilidad; la interfaz usa la
nueva variante condicionada. No se abren permisos sobre las tablas privadas.

Las peticiones fijan el JWT de la cuenta que abrió la pantalla. Un cambio de
sesión limpia datos y bloquea el formulario hasta entrar de nuevo. Un fallo de
red al guardar se trata como resultado incierto: no hay reintento automático.
Consultar antes de repetir. El contador de versión evita presentar respuestas
de una sesión anterior. La revocación efectiva se comprueba en cada RPC; una
pantalla abierta no conserva autorización en la base.

Implementado y aplicado sólo local el6noviembre; no se asignaron ni revocaron
roles durante este trabajo. Pendiente al final: acceso anon/usuario/moderador/
maintenance/owner, cambio y revocación, último owner y autorrevocación, conflicto
concurrente, auditoría persistida, cuenta inexistente, cambio de sesión durante
lectura/escritura, doble envío, respuesta perdida, paginación, teclado/axe y móvil.
La pantalla consulta `platform_role_history` de0039, sólo para owner, en páginas
de veinte operaciones con una fila adicional para detectar continuación. Muestra
rol anterior/nuevo, responsable registrado, cuenta afectada, identificador y hora
de Perú. Un actor nulo se presenta como ausencia de sesión registrada; no se le
atribuye una identidad o motivo supuesto. El historial es de sólo lectura y se
limpia al cambiar de sesión, al guardar o ante fallo de consulta. Volver al inicio
recupera los cambios recientes; no hay sondeo continuo.

Las respuestas se validan en runtime. Los cursores deben ser positivos, únicos y
descendentes, dentro del rango bigint; un número JSON fuera del rango entero
seguro se rechaza para evitar saltar operaciones por redondeo. La UI no inventa
filas ni fechas ante datos inválidos. Pendientes adicionales para las pruebas
finales: más de veinte operaciones, límites de página, nuevos cambios durante
paginación, actor nulo, respuesta inválida, permiso revocado, sesión cambiada y
error de red. Esta integración no acredita aún la aceptación del cierre8.
