# Descubrimiento: incremento visible del 5 de noviembre de 2026

No completa el rediseño integral ni ninguno de los 27 cierres. La autorización
vigente permite mejorar la interfaz conservando funciones, contenido y permisos.

## Cambios

Recuperación de medios del feed (6 de noviembre, sin ejecutar pruebas): fotos y
videos muestran un aviso ES/EN y reintento cuando el elemento informa un error.
Reintentar crea un elemento nuevo con la misma URL autorizada; no agrega parámetros
ni cambia permisos. El foco pasa a la región del medio y el video vuelve a intentar
reproducirse sólo si la publicación está activa. Al cambiar de fuente o desmontar,
se pausa el elemento anterior. Los controles del video fallido no quedan detrás
del aviso y el texto/autor/acciones permanecen disponibles. Validación final pendiente:
404/403, desconexión y recuperación, video no decodificable, autoplay denegado,
cambio rápido de publicación/fuente, teclado, ES/EN, axe y capturas.

Publicaciones en pantallas bajas (6 de noviembre, implementación pendiente de
validación): foto/video conserva una altura mínima de128px. Cuando texto y medio
no caben, la columna permite desplazamiento y recibe foco con teclado. El texto
expandido comparte ese desplazamiento, en lugar de crear otro scroll anidado de96px.
La sección mantiene su altura de pantalla para conservar el detector de publicación
activa y las acciones laterales. Pendiente al final: foto/video con texto largo,
expandir/contraer, móvil vertical/horizontal, zoom, teclado, avance entre publicaciones,
axe y capturas. No acredita todavía el cierre de accesibilidad.

Confirmaciones del editor (6 de noviembre, sin pruebas): `ConfirmDialog` usa
modal nativo con título/descripción asociados, foco inicial en Cancelar, Escape,
fondo inerte y exclusión de decisiones repetidas. Botones de44px y altura acotada
con scroll para móvil. El borrado desde el control del lienzo ahora confirma igual
que el inspector; antes llamaba directamente a deleteBlock. El aviso aclara que
agregar otro bloque no recupera su contenido. El hero conserva vaciado, no borrado.
El botón móvil del inspector dice Volver al editor: sólo cierra el panel, no realiza
un guardado, y la etiqueta anterior podía atribuirle una confirmación inexistente.

Pendiente final: cancelar/confirmar con teclado y puntero, Escape/backdrop,
foco restaurado con disparador presente y foco tras eliminar el bloque, cambios
de permisos, doble activación, hero/otros bloques, autoguardado/publicación,
axe y referencias visuales. No se borraron bloques reales durante implementación.

Créditos musicales (6 de noviembre, sin pruebas): el carrusel compartido renderiza
una sola copia de cada tarjeta. Esto elimina la segunda instancia del iframe al
expandir un crédito, así como enlaces duplicados ocultos sólo con aria-hidden.
Conserva desplazamiento automático opcional: al llegar al final espera1.6segundos
y vuelve al inicio, sin duplicar contenido para el bucle. Añade avance/retroceso,
pausa persistente, scrollbar visible, foco y preferencia de movimiento reducido.
La interacción por puntero o avance manual detiene el automático hasta reanudar;
una tarjeta expandida también lo mantiene detenido. Velocidad ajustada al tiempo
entre frames y sin temporizadores de reanudación que sobrevivan al desmontaje.
Botones ES/EN de44px; abrir/cerrar identifica el título del crédito.

Pendiente final: créditos externos/aceptados, exclusión de pendientes/rechazados,
una sola instancia de embed, teclado/lectura accesible, scroll horizontal y
vertical, contenido corto/largo, cambios de tamaño, pausa/reanudación, móvil,
axe y nuevas referencias. No acredita medición de rendimiento ni WCAG global.

Discografía (6 de noviembre, implementación sin pruebas): control visible para
pausar/reanudar movimiento automático; preferencia de movimiento reducido aplicada
a portadas, rotación de descripciones, escritura animada y vinilo. El foco dentro
del bloque detiene el autoavance para operar por teclado. Las copias visuales del
carrusel conservan selección por puntero, pero sólo una copia por álbum participa
en la navegación de teclado/lectura accesible. Las descripciones tienen botones
de selección con nombre y estado; el texto de pista se entrega completo al lector
de pantalla. Se preservan álbumes, reproducción, avance de pistas y editor.

Se reemplazan reinicios síncronos en efectos por identidad de contenido en las
descripciones; el render consulta estado de la URL cargada en vez de leer un ref.
No se redujo el techo de lint sin medir. Pendiente final: pausa/reanudación,
preferencia del sistema y cambios durante reproducción, foco y copias del loop,
selección/cierre de álbum, cambio de archivo/otro reproductor, descripciones
editadas, móvil, axe y referencias visuales. No acredita aún WCAG2.2AA global.

- Secciones con nombres visibles: Descubrir, Servicios y Productos; teclado y
  blancos de interacción de al menos 44 px.
- Filtros independientes por sección, opción Todos, recuento de perfiles y
  salida explícita de resultados vacíos. Se conservan los rubros anteriores.
- Categorías móviles de desplazamiento manual; los controles dejan de moverse
  automáticamente. Nombres completos de los rubros en escritorio.
- Encabezados descriptivos y acceso a la tienda visible sin pasar el mouse.
- Contraste corregido en los elementos nuevos, sin desactivar reglas de axe.
- Disco adaptado a la altura móvil para evitar solaparlo con los filtros.

Se revisaron como referencias de producto las páginas oficiales de
[SoundCloud](https://soundcloud.com/company/about-us/),
[Bandcamp](https://bandcamp.com/guide) y
[Patreon](https://support.patreon.com/hc/en-us/articles/16263061573645-Get-started-on-Patreon).
La decisión de hacer explícitas las secciones y las salidas de filtros es propia
de Vibe; no se incorporan pagos, suscripciones ni otras funciones de esas plataformas.

## Evidencia y límites

`tests/e2e/descubrimiento.spec.ts` prueba navegación con teclado, filtros que
persisten, recuperación del estado vacío, enlace a tienda, contraste WCAG 2.2 AA
en las áreas nuevas y límites del reproductor en 390 × 667.

Capturas con datos ficticios bajo `.wrangler/auditoria/ux-after-*`: servicios
revisados en 390, 768, 1024 y 1440 px; reproductor revisado en 390 × 667.
Son evidencia de revisión, no referencias de píxeles aprobadas. Los archivos
anteriores `ux-antes-*` y `ux-original-*` fueron sobrescritos accidentalmente
durante la captura y NO acreditan el estado anterior. No usarlos para comparar.

La vista `http://127.0.0.1:3070` recibió los componentes actualizados y se abrió
en Chrome. Su contenido local puede diferir del fixture usado en las capturas.
No se desplegó. Resultados de comandos y bloqueos en `../RESULTADOS_PRUEBAS.md`.

Pendientes del rediseño: publicaciones multimedia en pantallas bajas, revisión
integral de perfil/editor/autenticación, paleta general y referencias de píxeles.
La auditoría de accesibilidad nueva cubre las áreas intervenidas, no toda la app.


## Segundo bloque de producto — pendiente de validación

El 5 de noviembre se prepararon cambios en acceso/recuperación, configuración,
panel del artista, notificaciones, navegación móvil y preview modal del editor.
El panel prioriza edición, borrador y perfil; las consultas fallidas de actividad
se distinguen de registros de cero. Se añadió reintento, bloqueo de acciones
simultáneas, estados accesibles y mensajes sin errores internos. Configuración
ya no muestra un dominio supuesto. La vista previa usa diálogo modal nativo.

Las publicaciones reservan una columna para acciones, ajustan el medio a la
altura disponible, permiten desplegar descripción y controlar el video activo.
Se preservan funciones, permisos, datos y proveedores; no se habilitan cobros.

Copiado a la vista local de desarrollo, no publicado. Por instrucción del usuario,
no se ejecutaron pruebas ni revisión visual en este bloque. No hay capturas ni
referencias nuevas aprobadas. Las evidencias del bloque anterior NO acreditan
estos cambios. Deben validarse al terminar el bloque de implementación.

## Tercer bloque — gestión de catálogo y música (6 de noviembre)

Implementados estados de guardado, eliminación confirmada, reintentos y
conservación de campos ante errores en productos, servicios y enlaces MP3.
Las consultas fallidas no se presentan como bibliotecas vacías. Las acciones
se bloquean mientras otra está en curso, y una escritura sin confirmación
requiere recargar antes de repetir. El ajuste rápido de stock compara el valor
leído para detectar cambios de otra pestaña. Catálogo normaliza enlaces mediante
el saneador existente; controles de imágenes y variantes tienen nombres accesibles.
Música utiliza el tema del sitio y mensajes seguros en lugar de errores internos.

Preparado localmente; no hay pruebas, revisión visual ni publicación de este
bloque. No acredita cierre de concurrencia global, idempotencia ni accesibilidad.
Bloque pedidos/grupos (6 de noviembre): historial con reintento, filtro recuperable y separación entre registros e ingresos cobrados; no se suman importes de moneda desconocida. Invitaciones con exclusión, respuesta pendiente confirmada y errores seguros; refresco diferenciado de mutación. Tres archivos copiados a preview. Sin pruebas ni revisión visual todavía; no acredita los cierres completos.

Panel y creación de grupos: enlace público corregido a username real; formularios y acciones protegidos durante guardado; errores de carga/permisos recuperables. Grupo confirmado se conserva si falla un paso opcional; creación incierta obliga a revisar lista antes de repetir. Implementación local sin pruebas ni capturas nuevas, pendiente evidencia integral.

Acceso a grupos y selector: lista incluye membresías aceptadas y rol; conteos completos reservados a propietarios conforme a RLS. Selector con errores/reintento y aviso de recarga, bloqueado al publicar. Menú del feed usa username real, distingue error de lista vacía y descarta respuestas obsoletas de sesión. Implementado y copiado a preview, aún sin pruebas ni revisión visual.

Editor: estados durables de guardado y carga fallida recuperable; aviso de archivos locales y al cerrar/recargar con trabajo pendiente; cambio de perfil confirmado y bloqueado mientras guarda. Implementado en tres componentes y copiado a preview; sin pruebas ni revisión visual todavía. Navegación interna requiere revisión posterior.

Preview del editor usa contenido vivo, incluido grupo activo y archivos locales, sin depender del borrador remoto. Enlaces internos y logo piden confirmar salida con cambios pendientes; cierre de sesión maneja errores y no compite con guardado. Cuatro componentes copiados localmente, pendientes pruebas y revisión visual final.

Preview independiente: grupo seleccionado con permisos reales, lectura versionada del borrador, reintento y error seguro. Editor conserva grupo ante fallos de consulta. Diálogo de salida nativo con foco y Escape. Implementación local sin pruebas ni capturas; revisión final pendiente.

Bandeja: búsqueda, solo pendientes, actualización, errores de carga y decisiones ambiguas recuperables. Preguntas: diálogo nativo, campos protegidos durante envío y mensajes seguros; preserva texto ante fallo. Preparado localmente; pruebas y capturas pendientes para el final.

Datos personales: descarga y eliminación excluyentes; copia parcial indicada, resultado de eliminación separado de fallo al limpiar sesión. Exportación ampliada preparada en0043 sin aplicar ni validar. Cambios de interfaz locales, pruebas pendientes.

Configuración guarda identidad, roles y color en una sola escritura confirmada; carga conjunta y recuperación de resultado incierto conservando campos. Disponibilidad de username no presume éxito ante error. No pruebas ni revisión visual todavía.

Enlaces públicos: configuración solicita actualizar nombre nuevo y alias anterior con propiedad comprobada por servidor. Catálogo, grupo y editor comunican demora de vista pública separada de escritura exitosa. Implementado localmente; validación final pendiente.

Acceso y recuperación: perfil pendiente recuperable sin repetir registro; contraseña con envío exclusivo, errores de conexión controlados y redirección cancelada al salir. Textos ES/EN. Implementación local; pruebas y revisión visual al final, sin cierre integral acreditado.

Reportes: diálogo nativo con foco, etiquetas y envío exclusivo; conserva borrador ante fallo/cierre, valida datos en ambos caminos y confirma sólo recepción acreditada por respuesta. Sin promesa de correo automático. Implementado; pruebas y revisión visual pendientes para el final.

Moderación: decisiones serializadas, actualización requerida tras POST y recuperación sin borrar notas; historial validado antes de mostrar y confirmación de escritura separada de caché. API verifica respuesta de decisión. Sin pruebas todavía; requiere0042 antes de habilitar esta vista local.

Preparada sección Decisiones y revisiones para titulares: lectura privada, solicitud por decisión y consulta del moderador. Depende de0044 sin aplicar. Falta respuesta formal/notificaciones y validación final. No visible aún en preview3070.

Respuesta de revisiones preparada en0045: moderador independiente, respuesta pública visible para titular, mantenimiento/restitución/cierre por decisión modificada. Aún sin aplicar ni probar; notificaciones y revocación sin suspensión siguen pendientes.

Bandeja global de solicitudes sin respuesta: pendientes antiguos primero, reportes agrupados, estado visible y reconsulta al fallar carga. Detalle prioriza solicitudes no resueltas. Depende de0046 sin aplicar; pruebas y revisión visual al final.

Revisión favorable sin suspensión: opción de revocar aceptación, con resultado legible en panel e historial. La base no modifica otras sanciones y exige restitución si este expediente mantiene la retirada. Extensión de0045 sin aplicar ni probar.

Copia personal: categorías reales de la copia preparada, compatible con formatos anteriores.0047 prepara reportes propios y solicitudes/respuestas, sin notas internas ni identidad de denunciantes/moderadores. Sin aplicar ni probar; exportación sigue parcial.

Avisos internos de moderación en Notificaciones y Decisiones: contador real, errores recuperables y lectura explícita ligada a la versión/respuesta mostrada.0048 preparada sin aplicar; no correo ni notificación externa. Pruebas al final.

Copia personal ampliada con datos básicos de cuenta, preguntas enviadas/recibidas y lecturas de moderación (formato4,21 categorías).0049 preparada sin aplicar; cliente conserva formatos anteriores. Sin secretos de autenticación ni promesa de copia integral. Pruebas al final.

Preguntas enviadas en Notificaciones: listado propio paginado con fecha y marca de lectura, error/reintento independiente, limpieza al cambiar sesión. El formulario enlaza en nueva pestaña tras envío confirmado o dudoso para conservar borrador. Depende de0049 sin aplicar; pruebas y capturas al final.

Envío de preguntas: mismo identificador en reintentos del mismo borrador mientras el componente sigue montado; confirmación por fila propia y contenido exacto tras respuesta perdida.0050 preparada conserva autoría al marcar lectura y bloquea cambios del mensaje recibido. No cubre recarga de página ni repara datos históricos; sin pruebas aún.

Configuración incorpora administración de la lista de bloqueos: consulta propia paginada, desbloqueo confirmado y recuperación ante error. No se presenta como protección de acceso público. Pendiente conectar lista al feed y entrada de bloqueo; sin pruebas todavía.

Perfiles ajenos con sesión ofrecen Ocultar de mi feed y restauración. Feed filtra música/publicaciones/servicios/productos y sus conteos con la lista propia; espera preferencias ante carga/error. Descubrimiento resuelve ids reales. Alcance explícito: no impide visitar perfiles públicos ni interactuar. Implementado sin pruebas ni despliegue; pendiente validación final.

Comentarios: error de carga visible y reintento; borradores separados por destino mientras el panel permanece montado; respuestas tardías no se mezclan entre canciones; envío con UUID estable y reconciliación propia tras respuesta perdida. Límite100 mostrado explícitamente. Sin pruebas aún; historial completo y foco móvil pendientes.

Historial de comentarios ampliado: páginas50 por cursor fecha+id, cargar anteriores con reintento sin perder lista/borrador y actualización de recientes. Contador de cargados, no total supuesto. Reemplaza límite fijo100 del incremento previo. Sin pruebas todavía.

Panel móvil de comentarios convertido a diálogo nativo: foco contenido, Escape/clic exterior, retorno al disparador y adaptación al ancho escritorio; cierre44px y movimiento reducido. Fuentes recientes del feed copiadas al preview local, sin afirmar validación visual ni ejecutar pruebas.

Refresco de preferencias conserva el feed montado pero oculto, con audio/video pausados y borrador de comentarios intacto para la misma cuenta. Primera carga/cambio de identidad siguen cerrados hasta confirmar preferencias. Fuentes copiadas al preview, pendientes de validación final.

Comentarios propios pueden eliminarse con confirmación; identidad y destino se comprueban en código bajo RLS. Sólo se retira la fila tras confirmar ausencia; error conserva fila y pide actualizar. Fuentes copiadas al preview; pruebas pendientes.
# Banner con IA — implementación del 6 de noviembre de 2026

El inspector del bloque principal incorpora «Crear un banner con IA», descripción
de hasta 600 caracteres, generación cancelable, vista previa y aceptación expresa.
El banner existente se conserva hasta pulsar «Usar este banner». La nueva imagen
se registra como archivo local y recorre la reserva, subida y finalización normales
al publicar; no se guarda un enlace temporal del proveedor como medio definitivo.
La aceptación actualiza sólo banner sobre el bloque vigente, sin restaurar otros
campos antiguos. Cambiar de bloque, sesión o comenzar publicación desmonta la
generación y descarta su vista previa; cancelar no garantiza que el proveedor no
haya procesado una solicitud ya recibida.

La API mantiene el contrato URL anterior y añade output=file para este cliente.
Cuenta autenticada y límite distribuido existentes, solicitud limitada a4096bytes,
respuesta limitada a8MiB, archivo PNG máximo5MiB, timeout90s, sin caché y sin
registrar respuestas del proveedor. Cliente usa JWT del propietario verificado y
descarta respuestas si cambia el contexto del editor. Sin clave responde503 antes
de llamar al proveedor. No se añadieron claves, créditos, planes ni modelos nuevos.

Formato base64/output_format documentado en el
[SDK oficial de Together](https://github.com/togethercomputer/together-typescript/blob/main/src/resources/images.ts).
Se conserva el modelo ya configurado: su disponibilidad en la cuenta y los derechos
de uso requieren validación; no se reemplaza automáticamente por otro de pago.

Pendiente para etapa final: pruebas conductuales de entrada inválida/excesiva,
timeout/proveedor/error/PNG, sesión cambiada, cancelación, edición simultánea,
doble clic, publicación mediante reservas, 503 sin configuración, teclado/axe y
capturas escritorio/móvil. No se ejecutaron pruebas ni generación real en este cambio.


### Selector de elementos: borrado y navegación

Pistas, créditos, publicaciones y enlaces solicitan confirmación antes de borrar.
Cambiar el contenido o contexto de la lista invalida una confirmación abierta.
Los controles miden al menos 44 px y la barra admite varias líneas; el contador
anuncia el elemento seleccionado. No cambia la persistencia ni los permisos.
Pendiente al final: teclado/axe, foco al cancelar y al borrar el último elemento,
invalidación por cambio de álbum/lista, navegación móvil y autoguardado.
No se ejecutaron pruebas ni eliminaciones reales durante esta implementación.

### Recorte de imágenes: teclado, errores y cancelación

El recorte permite mover la imagen con controles horizontal/vertical además de
arrastrar; zoom conserva el centro elegido. Diálogo nativo con Escape y foco,
controles de 44 px y marco de 240 px para pantallas estrechas. Un fallo al exportar
muestra un error y permite reintentar conservando el encuadre. Cerrar durante la
exportación impide entregar el resultado tardío; cambiar imagen o proporción abre
una sesión nueva. Se conserva JPEG con máximo de 1600 px y el protocolo File/blob
existente, sin subir directamente al almacenamiento.
Pendiente final: teclado/axe, dimensiones reales, arrastre cancelado, límites de
zoom/posición, carga/exportación fallida, doble clic, cancelar durante toBlob,
cambio de imagen y publicación autenticada del recorte. No se ejecutaron pruebas.

### Ubicación del perfil: sincronización y recuperación

País/departamento ahora reflejan el valor actual del borrador, incluso si cambia
sin desmontar el selector. La carga diferida del catálogo permite reintentar al
fallar. Valores históricos no reconocidos permanecen visibles y no se reescriben
al cargar; departamentos históricos mantienen una opción propia. Se conserva el
orden de Lima primero y la elección explícita como único origen de cambios.
Controles de 44 px y una columna en ventanas menores de 360 px.
Pendiente al final: cambios externos de value, carga fallida/reintento/desmontaje,
valores históricos, países sin departamentos, vaciado, teclado/axe y móvil.
No se ejecutaron pruebas en esta implementación.

### Feed: consultas innecesarias y movimiento reducido

Retiradas las consultas masivas de conteo cuyos resultados FeedContainer guardaba
sin consumir. El panel conserva sus comentarios paginados y el contador de filas
cargadas. No cambian permisos, contenido ni botones de conversación. Las flechas
y el avance al finalizar una canción usan desplazamiento inmediato cuando se
prefiere movimiento reducido; la preferencia no reinicia la reproducción.
Pendiente final: comprobar red, comentarios y paginación, avance musical/manual,
cambio de preferencia y comportamiento móvil. Sin pruebas ni mediciones nuevas.

### Copia de datos: cancelación de preparación

La exportación JSON incorpora Cancelar preparación y señal de cancelación del
RPC a los 60 segundos, al cambiar la sesión o al desmontar la pantalla. Una
respuesta tardía cancelada no dispara descarga. Se conserva validación de dueño
y de categorías. Se libera el enlace temporal aunque falle su activación.
Cancelar no modifica datos ni garantiza detener trabajo SQL ya iniciado. Las
consultas de sesión del SDK no admiten esta señal; la descarga queda igualmente
condicionada a que la operación siga activa. Pendiente final: fallo, timeout,
cancelación, cuenta cambiada, descarga válida y teclado/axe. Sin pruebas ejecutadas.

### Historial de licencias: recuperación y sesión

El historial se reinicia por perfil y usuario, se oculta sin sesión y permite
reintentar fallos tanto del módulo como de la consulta. La lectura fija el JWT
verificado para el usuario esperado. Redescargar comprueba la sesión después de
cargar el generador, impide doble activación y muestra errores recuperables.
No se generaron documentos reales. Pendiente final: cambiar perfil/cuenta,
respuesta tardía, fallos de import/consulta/generación, teclado y descarga.
La pantalla legal padre y la emisión/guardado requieren revisión independiente.
