# Comprobación de disponibilidad

Estado: implementación preparada, sin ejecutar ni activar. No acredita el cierre23.

`scripts/comprobar-disponibilidad.mjs` consulta sólo `/` y `/api/health` del origen
HTTPS configurado, sin sesión, claves, redirects ni datos de usuarios. Cada
petición tiene15 segundos de plazo; health admite hasta16 KiB. Exige HTTP200,
HTML en portada y JSON con estado/dependencias Supabase/R2 en `ok`. Una versión
esperada opcional debe coincidir con los primeros7 caracteres del commit.
Devuelve código1 ante fallo, respuesta inválida o configuración ausente. Imprime
sólo resultado, duración, código HTTP y versión saneada; nunca el cuerpo recibido.
No prueba acceso, reproducción, publicación, restauración ni gasto.

Actualización del6 de noviembre, pendiente de pruebas: el monitor reconoce429
como `rate_limited` y lee el contrato de health también con503. Si es una respuesta
de salud válida, incluye únicamente los estados `ok`/`error` de Supabase y R2;
si no contiene ese contrato, informa `health_unavailable`. Nunca publica el cuerpo
ni convierte503 en éxito. Una versión esperada hexadecimal admite mayúsculas o
minúsculas. No se ha activado el flujo ni ejecutado consultas al servicio con este
cambio; los casos de respuesta quedan para la validación final.

## Activación posterior a gates y despliegue

1. Consolidar el flujo `.github/workflows/disponibilidad.yml` en la rama
   predeterminada del repositorio empresarial. Fuera de
   `vibemusicprofile-oss/musician-profile-dashboard` no ejecuta el job.
2. Confirmar saldo/límites de Actions existentes, sin ampliar facturación.
   La frecuencia preparada es horaria, no un SLA. El flujo necesita runner;
   no se afirma gratuidad ni capacidad de alertar si Actions no se ejecuta.
3. Configurar variables del repositorio: `VIBE_MONITOR_ORIGIN` con origen HTTPS
   de Vibe (sin ruta, consulta, credenciales ni URL de Supabase) y opcionalmente
   `VIBE_EXPECTED_VERSION` con commit desplegado. `VIBE_MONITOR_ENABLED=true`
   habilita el job. Sin esa variable queda omitido, NO demuestra salud.
4. El titular debe designar responsable y suplente, y configurar sus avisos
   de Actions. Este flujo no contiene destinatarios, webhooks ni envía mensajes.
5. Ejecutar manualmente al final, comprobar resumen y salida; ensayar fallo
   controlado en entorno aislado y verificar recepción y respuesta del encargado.
   Después comprobar un evento programado real. Registrar enlaces y tiempos.

GitHub documenta que los eventos programados pueden demorarse; sus avisos dependen
de preferencias y del actor que modifica la programación. No es un sustituto de
un monitor con garantía de entrega:
[eventos programados](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule),
[notificaciones de ejecuciones](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs).

## Respuesta a fallo

- Consultar el resumen de la ejecución y el despliegue vigente. No copiar cuerpos
  de respuesta, cookies ni credenciales a incidencias.
- `http_status`: revisar Worker y dependencias;429 significa comprobación
  limitada, no prueba de caída. No eludir rate limits.
- `rate_limited`: esperar la siguiente comprobación y revisar la frecuencia y
  los límites; no repetir en bucle ni aumentar el cupo para silenciar el aviso.
- `health_unavailable`: el servicio respondió503 sin el contrato de salud;
  revisar primero la configuración y disponibilidad del limitador y los logs.
  No atribuir automáticamente la caída a R2 o Supabase.
- `timeout` o `connection_or_response_error`: confirmar conectividad, TLS y logs.
- `dependencies_not_ready`: revisar logs privados de health, Supabase y R2.
- `version_mismatch`: comprobar publicación y variable esperada antes de revertir.
- `configurationError`: corregir configuración; no declarar disponible el sitio.
- Recuperación: ejecución posterior correcta más verificación del recorrido que
  falló. No borrar evidencia del incidente ni restaurar migraciones hacia atrás.

Pendientes del cierre23: recepción real de avisos, responsable/suplente, alertas
de errores sostenidos y gasto, seguimiento del propio monitor y ensayo operativo.
