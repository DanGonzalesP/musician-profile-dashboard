# Backups y restauración — Vibe

Estado de **P-25: parcial**. La restauración de la base se ensayó en un destino
local aislado; faltan los archivos y el procedimiento operativo completo.
Este documento separa lo configurado de lo que falta confirmar.

## Qué se respalda

| Fuente | Qué contiene | Mecanismo | Frecuencia | Retención |
|---|---|---|---|---|
| **Postgres (Supabase)** | perfiles, bloques, catálogo, moderación, auditoría | Backups automáticos según plan; no confirmados aquí | por confirmar en consola | por confirmar |
| **R2 (Cloudflare)** | imágenes, audio, video de los perfiles | Copia independiente y restauración verificable pendientes | por definir | por definir |
| **Migraciones** | el esquema como código | Git (`supabase/migrations/`) | cada commit | permanente |

`media_assets` es el inventario que ata cada objeto de R2 a su dueño: es la
pieza que hace **rastreable** una restauración parcial (ver runbook
[`perdida-de-archivos.md`](runbooks/perdida-de-archivos.md)).

## R2: no hay recuperación por versioning confirmada

`/api/eliminar-cuenta` y `/api/cleanup-orphaned-files` borran objetos de R2.
La documentación oficial consultada el **2026-11-04** describe lifecycle como
reglas para transición de clase o expiración/borrado. La tabla de compatibilidad
S3 marca `PutBucketVersioning` y Object Lock como no soportados; no hay base para
prometer versiones o delete markers restaurables tras borrar un objeto.
Por tanto, no se debe tratar lifecycle como backup ni prometer recuperación
tras `DELETE`. Los borrados de R2 son irreversibles según la guía oficial.

Pendiente: definir y aprobar una copia independiente (destino/retención/costo),
preservar metadatos necesarios, y demostrar restauración de objetos y filas de
`media_assets` en un destino de prueba. No se activa ningún servicio de pago en
este documento. Véanse [ciclo de vida R2](https://developers.cloudflare.com/r2/buckets/object-lifecycles/),
[compatibilidad S3](https://developers.cloudflare.com/r2/api/s3/api/) y
[borrado de objetos](https://developers.cloudflare.com/r2/objects/delete-objects/).

## Herramienta de copia cifrada preparada (2026-11-06)

`scripts/respaldar-r2-cifrado.mjs` está implementado, **sin ejecutar ni validar**.
Es una copia de lectura de R2 a una carpeta nueva bajo `.wrangler/backups/`;
no borra origen, no crea buckets ni contrata servicios. No sustituye la copia
independiente ni el ensayo de restauración pendientes del cierre22.

El operador proporciona mediante su gestor de secretos variables específicas:
`VIBE_BACKUP_R2_ACCOUNT_ID`, `VIBE_BACKUP_R2_BUCKET`,
`VIBE_BACKUP_R2_ACCESS_KEY_ID`, `VIBE_BACKUP_R2_SECRET_ACCESS_KEY` y
`VIBE_BACKUP_KEY_HEX` (32 bytes aleatorios representados por64 dígitos hexadecimales).
La credencial debe tener lectura únicamente del bucket previsto. El script no
carga `.env`, no usa la clave de runtime y no imprime claves ni nombres de objetos.
Guardar la clave de cifrado por separado, fuera de este equipo y del respaldo;
si se pierde, esta copia no es recuperable. No colocar secretos en argumentos,
archivos del repositorio ni historial del terminal.

```powershell
node scripts/respaldar-r2-cifrado.mjs --execute --account <cuenta-verificada> --bucket <bucket-verificado> --out .wrangler/backups/<nombre-nuevo>
```

Sin `--execute` sólo muestra uso. Cuenta y bucket indicados deben coincidir con
las variables; el destino debe ser nuevo. Cada objeto y el manifiesto usan
AES-256-GCM con IV aleatorio independiente, cabecera autenticada y etiqueta.
El manifiesto cifrado conserva claves originales, SHA-256 del contenido, tamaños,
ETag, fechas, tipo, disposición, codificación, idioma, caché y metadatos de usuario.
Los nombres locales son aleatorios y no revelan rutas de usuarios. No se escribe
contenido sin cifrar en disco. En Windows, restringir además el acceso al directorio
con ACL del operador: los modos POSIX del script no sustituyen esas ACL.

`COMPLETE.json` se escribe al terminar todas las descargas y el manifiesto. Es un
marcador operativo, **no una firma ni evidencia de restauración**. Si falla, conserva
fragmentos cifrados y sale con error; no reutilizar esa carpeta para otra copia.
LIST+GET condicional por ETag detecta ciertos cambios concurrentes, pero no crea
una instantánea atómica de todo el bucket ni lo coordina con Postgres. Una copia
del servicio exige ventana de escrituras controlada y cotejo de `media_assets`.

Pendiente: ejecutar/verificar restauración de este formato, validar integridad
y metadatos, acordar custodia externa/retención, demostrar recuperación con la clave
custodiada y medir RTO/RPO. No activar programación hasta completar ese recorrido.

## Recuperación local preparada, sin ejecutar (2026-11-06)

`scripts/recuperar-r2-local.mjs` es la herramienta inversa preparada. No carga
`.env`, no necesita credenciales R2 y no hace peticiones de red. Requiere la clave
`VIBE_BACKUP_KEY_HEX` de la copia y confirmación explícita de cuenta y bucket:

```powershell
node scripts/recuperar-r2-local.mjs --execute --from .wrangler/backups/<copia> --out .wrangler/restores/<carpeta-nueva> --account <id> --bucket <nombre>
```

Sin `--execute`, sólo muestra las instrucciones. El destino debe ser un hijo
directo nuevo de `.wrangler/restores`; nunca reutiliza una carpeta. Autentica el
manifiesto cifrado antes de usarlo y exige la identidad indicada por el operador.
Los nombres de objetos originales no se usan como rutas: cada archivo recuperado
recibe un nombre aleatorio y `manifest.json` conserva su correspondencia y sus
metadatos. Esto evita interpretar claves de R2 como rutas del sistema operativo.

Cada objeto se descifra por streaming a un temporal. Sólo se convierte en archivo
final tras autenticar GCM y comparar tamaño y SHA-256 con el manifiesto. Ante un
fallo intenta retirar el temporal de esa operación; conserva los archivos ya
recuperados. Un cierre abrupto puede dejar temporales. **Esta carpeta contiene
datos descifrados**, incluidos nombres privados en el manifiesto: restringir sus
permisos/ACL antes de operar y custodiarla; los modos POSIX no sustituyen ACL de
Windows. No sincronizarla ni versionarla como documentación.

`RECOVERED.json` sólo se escribe al finalizar todos los objetos. Representa la
integridad local comprobada por la herramienta, no una restauración de Vibe:
no sube archivos a R2, no aplica metadatos a un bucket ni verifica propiedad,
permisos o correspondencia con filas SQL. La recuperación conjunta y los tiempos
se comprobarán en la etapa final. **Herramienta escrita, todavía sin ejecutar ni
validar; cierres 18/22 siguen pendientes.**

## RTO y RPO declarados (propuestas pendientes)

### Copia a R2 aislado preparada, no ejecutada

`scripts/restaurar-r2-aislado.mjs` completa el transporte desde una recuperación
local hacia un bucket existente cuyo nombre comienza por `vibe-restore-`. Rechaza
el bucket de origen, no crea recursos, no carga `.env`, no sobrescribe ni borra
objetos y no modifica SQL. Necesita credenciales específicas limitadas al bucket
de recuperación: LIST/GET/PUT, sin permisos de borrado ni acceso a producción.

Variables suministradas mediante gestor de secretos, nunca en argumentos ni en
el historial: `VIBE_RESTORE_R2_ACCOUNT_ID`, `VIBE_RESTORE_R2_BUCKET`,
`VIBE_RESTORE_R2_ACCESS_KEY_ID`, `VIBE_RESTORE_R2_SECRET_ACCESS_KEY`.

```powershell
node scripts/restaurar-r2-aislado.mjs --execute --from .wrangler/restores/<recuperacion> --source-account <cuenta-origen> --source-bucket <bucket-origen> --account <cuenta-destino-verificada> --bucket vibe-restore-<destino-aislado>
```

Sin `--execute` no lee archivos ni conecta. Antes del primer PUT exige manifiesto
y marcador de recuperación local, identidad de origen/destino explícita y coteja
tamaños/SHA-256 de todos los archivos. Rechaza enlaces simbólicos y objetos
inesperados en el destino. Mantener el destino privado y sin escritores ajenos
durante el ensayo; el prefijo del nombre no demuestra propiedad ni aislamiento.

Cada PUT usa `If-None-Match: *`; después descarga por streaming y compara tamaño,
SHA-256 y metadatos. Un reintento coteja objetos existentes sin reemplazarlos.
Un objeto diferente detiene el recorrido: conservarlo para investigar. No usa
ETag como checksum de contenido. Los tiempos máximos son30s para LIST y5min por
PUT/GET; los archivos grandes pueden exigir revisar estos límites antes del ensayo.

Escribe un informe local `R2-RESTORED-<fecha>.json` sólo al completar. Dicho informe
acredita, cuando se ejecute, correspondencia con el manifiesto local suministrado;
no autentica de nuevo el manifiesto cifrado original. Custodiar la recuperación
local contra modificaciones. No demuestra una instantánea conjunta con Postgres,
propiedad `media_assets`, referencias, reproducción, recuperación de la aplicación
ni RTO/RPO. Tampoco restaura fechas de creación o ETags originales del proveedor.

Estado actual: herramienta escrita, sin ejecución ni pruebas. Pendientes casos
de integridad/metadatos/vacíos, permisos, colisiones, interrupción/reintento,
destino indebido y recuperación conjunta. No se creó bucket ni amplió facturación.

- **RPO propuesto, no aceptado ni medido:** ≤ 24 h para Postgres; el intervalo
  real depende de plan y backups confirmados. El esquema versionado en Git no
  respalda por sí solo los datos.
- **RTO propuesto, no aceptado ni medido:** ≤ 2 h para restauración completa.
  Sustituirlo por cifras observadas tras probar base y objetos.

## Prueba de restauración — registro fechado

El 2026-11-05 se obtuvo un respaldo nuevo de esquema, datos y roles, cifrado
con DPAPI. Se restauró en `supabase_db_vibe-restauracion`, una base exclusiva
con escucha TCP desactivada antes de importar datos. No se conectó la app a
esta copia de datos reales. Se inicializó la extensión citext requerida por
el esquema, además de las extensiones disponibles en la imagen local.

Las 58 tablas respaldadas coincidieron con el origen en cantidad de filas y
SHA-256 del contenido JSONB ordenado. Después se ensayaron las migraciones
0018–0037: se conservaron 3 usuarios, 2 perfiles, 14 bloques y 63 registros de
Storage. Estos registros no sustituyen a los archivos físicos de Storage/R2.
Los artefactos y resúmenes están bajo `.wrangler/migracion-empresa-2026-11-04/`,
excluidos de Git. Evidencia: `restauracion-resumen.json`,
`restauracion-cotejo.json` y `ensayo-migraciones-resumen.json`.

| Fecha | Qué se restauró | Destino | Tiempo | Resultado | Quién |
|---|---|---|---|---|---|
| 2026-11-05 | Esquema, datos y roles de Postgres | Base local aislada, TCP desactivado | 1,36 s de importación SQL y conteo; no es el RTO completo | 58/58 tablas coincidentes; archivos no restaurados | Codex |

Pendiente para completar el cierre: copia recuperable fuera de esta máquina,
restauración de archivos y permisos, ensayo de recuperación del servicio y
medición/aceptación de RTO/RPO. La prueba local no necesitó contratar otro
proyecto Supabase. Ninguna copia ni retención de pago queda aprobada aquí.

## Checklist de estado

- [x] Procedimiento y pendientes documentados.
- [ ] Backups automáticos de Supabase confirmados activos y retención anotada — **humano**.
- [ ] Copia independiente de R2 aprobada y configurada; lifecycle no cuenta como backup — **decisión humana**.
- [x] Restauración aislada de Postgres ejecutada y cotejada con el origen.
- [ ] Restauración de archivos y servicio completo ejecutada y fechada.
- [ ] RTO/RPO acordados y sustituidos por cifras medidas — tras pruebas completas.

Runbooks relacionados: [`restaurar-base.md`](runbooks/restaurar-base.md),
[`perdida-de-archivos.md`](runbooks/perdida-de-archivos.md).
