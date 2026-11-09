# Aportes a campañas: estado de implementación

El bloque de crowdfunding conserva título, descripción, estudio, meta, monto,
participantes y días declarados por el artista. Esos datos no son una conciliación
de pagos. Antes permitía aumentar los contadores de la página pública con una
simulación local. Desde el6noviembre, el render público no abre esa simulación ni
incrementa aportes/reacciones; muestra que estas acciones no están habilitadas y
que Vibe no ha procesado los montos declarados. No se borran datos históricos.

La demostración se conserva en `PerfilPreviewContent`, usado para vista previa
del editor. `BlockRenderer.allowSupportDemo` es falso por defecto y no procede
del contenido del bloque. Activarlo sólo permite sumar valores en memoria; no
llama a una API, crea pedidos, persiste saldos ni habilita una pasarela. Cambiar
el bloque o salir de la vista reinicia la simulación. La moneda USD del diálogo
es parte de la demostración heredada, no una decisión comercial de cobro.

El diálogo usa modal nativo con foco, Escape y cierre explícito, no desaparece
por temporizador. Los montos deben ser finitos, positivos, representables y de
hasta dos decimales. La confirmación dice que no se cobró ni guardó un aporte.
Los textos nuevos tienen versiones española e inglesa.

No se implementó un proveedor de pagos, precios ni suscripciones reales. Antes
de habilitarlos siguen pendientes titular y reglas comerciales/legales, proveedor
autorizado, monedas, impuestos, cancelación/devolución y contratos. La futura
integración requiere autorización en servidor, comprobación de firmas de eventos,
idempotencia, conciliación y cuotas por permisos; un contador cliente no sustituye
esas garantías. No contratar ni habilitar facturación por esta preparación.

Pruebas diferidas al final: página pública con valores históricos y bloque
manipulado, demo del editor y vista guardada, cambio de bloque/reinicio, montos
inválidos y confirmación repetida, diálogo sobre preview modal, Escape/foco,
teclado/axe, móvil, ES/EN y ausencia de peticiones/escrituras de pago. No se declara
preparación comercial ni cumplimiento legal por existir esta separación de UI.
