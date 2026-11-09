# Limpieza manual del inventario propio

Implementación del 6 de noviembre de 2026. Pendiente de pruebas finales; no se
ejecutó limpieza ni simulación contra almacenamiento durante este cambio.

La pantalla `/cleanup` requiere sesión y permiso `maintenance` comprobado en
Postgres. Este permiso no da propiedad sobre archivos ajenos. La pantalla ofrece
audio, imágenes y video, siempre con alcance `propios`; la API mantiene sus
contratos anteriores y vuelve a comprobar permiso en cada solicitud.

1. Elegir carpeta y **Consultar sin retirar archivos**. La consulta enumera R2 y
   referencias visibles sin solicitar borrados. Muestra candidatos, antigüedad,
   archivos sin atribución y fuera del inventario propio.
2. Si hay candidatos, decidir si retirarlos. La confirmación advierte que no hay
   deshacer en el panel y que se vuelve a consultar el estado actual: no es una
   lista congelada ni una autorización sobre exactamente las filas anteriores.
3. Revisar retirados, fallos y conservados al reclamar. La reclamación de la base
   sigue protegiendo referencias concurrentes; no se relaja RLS ni se omite el
   recibo de retirada. Un formato histórico no aceptado también se conserva.
4. Si falla la respuesta, no asumir que no hubo cambios: consultar de nuevo antes
   de reintentar. La pantalla no reintenta escrituras automáticamente. El botón
   queda bloqueado mientras la petición en curso no termina.

Cambiar de cuenta limpia resultados y descarta respuestas anteriores. La petición
usa el JWT de la cuenta comprobada, no el de una sesión que aparezca después.
Una revocación devuelve401/403 y oculta el panel. No se calcula espacio liberado
a partir del número de objetos: la estimación anterior de2.5MB/archivo se retiró.

La API limita el cuerpo a4KiB, rechaza null/arrays/opciones con tipos incorrectos
(incluido `simular: "true"`, que nunca debe interpretarse como retirada), y aborta
si R2 anuncia otra página sin entregar un cursor nuevo. Respuesta correcta no-store.

Aceptación final pendiente: permisos/revocación, simulación sin escrituras, cada
carpeta, carreras de referencias, archivos históricos/sin dueño/recientes,
fallos parciales, cambio de cuenta durante consulta/retirada, doble clic, cuerpos
inválidos, paginación incompleta, teclado/axe y capturas. La limpieza no sustituye
la cola automática de supresión de cuentas ni su supervisión operativa.
