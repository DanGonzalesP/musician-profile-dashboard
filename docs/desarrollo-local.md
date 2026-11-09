# Vibe local mientras se completa la migración

La vista de desarrollo se sirve en `http://127.0.0.1:3070`, sólo en esta laptop.
Usa la base **local** Vibe (`54421`), no la empresarial. No contiene una copia
de los perfiles de producción. Los ejemplos del feed son contenido de muestra.
No está configurado R2 ni Together AI en esta vista: sus operaciones sensibles
fallan cerradas. La publicación de bloques sin archivos usa Supabase local.

## Arranque reproducible

Desde la raíz del repositorio, con el Supabase local de Vibe ya en marcha:

```powershell
node scripts/preparar-verificacion.mjs vista-local
cd .wrangler/auditoria/vista-local
pnpm install --frozen-lockfile
node scripts/abrir-vibe-local.mjs
```

El lanzador consulta `supabase status` sin imprimir sus claves, exige el puerto
54421 y sólo entrega la anon key al servidor Next. Rechaza `.env.local`, retira
credenciales de R2/IA del proceso hijo y escucha en loopback, puerto 3070.
La copia tiene raíz Git propia, sin remoto ni commits. Sus cambios no sustituyen
al código fuente: para actualizarla, volver a ejecutar la copia desde la raíz.

### Si Windows bloquea binarios (Smart App Control, 2026-11-09)

Smart App Control bloquea `supabase.exe` (CLI) y `workerd.exe` ("Una directiva de
Control de aplicaciones bloqueó este archivo"). No se cambia esa configuración.
`scripts/supabase-local.mjs` lee la conexión con la CLI y, si falla, la reconstruye
desde los contenedores `vibe` activos (Kong 54421, Postgres 54422, claves locales
firmadas con el secreto del GoTrue local) y comprueba que la API las acepta antes
de usarlas; lo usan el lanzador, `probar-supabase-local.mjs` y
`probar-mantenimiento-local.mjs`. Si `workerd.exe` está bloqueado, el lanzador fija
`VIBE_DEV_SIN_WORKERD=1` y Next arranca sin emular bindings de Cloudflare (sólo la
vista local). Siguen bloqueados en esta laptop los comandos que necesitan la CLI
o workerd: `db:verify`/`db:reset`/`db:lint`, `cf:test` y el preview del Worker. El
trabajo `base-de-datos` del CI los ejecuta en Linux.

## Actualizar código y esquema local juntos

Cuando el código nuevo requiere migraciones, copiar componentes por separado
deja incompleta la integración. Está preparado este comando desde la raíz:

```powershell
node scripts/actualizar-vibe-local.mjs --aplicar-local
```

Primero guardar los cambios y cerrar el editor para evitar ediciones durante la
actualización. El comando exige el contenedor `supabase_db_vibe` con etiqueta de
proyecto `vibe`, prepara una copia aislada de las migraciones, guarda un respaldo
Postgres en formato custom y ejecuta únicamente `migration up --local`. Sólo si
termina correctamente copia el código principal a `vista-local`. No ejecuta
reset, semillas, pruebas, despliegues ni migraciones remotas; tampoco reinicia
el servidor de desarrollo ni instala dependencias.

El respaldo y los registros permanecen bajo
`.wrangler/auditoria/actualizacion-local-<fecha>/`, fuera de Git. Pueden contener
datos locales de cuentas: no subirlos ni compartirlos. Si falla una migración,
el código local se conserva, pero las migraciones anteriores pueden estar
aplicadas; consultar el registro antes de continuar y corregir hacia adelante.
Un respaldo generado no equivale a una restauración comprobada. Este flujo
está implementado y pendiente de ejecución; no constituye evidencia de gates.

En esta máquina se instaló con el store existente de pruebas:
`--store-dir C:/Users/Poliguag/Downloads/musician-profile-dashboard/.pnpm-store`.
Si pnpm pide reconstruir módulos por otro store, conservar el mismo parámetro;
no borrar directorios de dependencias de otros proyectos.

Con pnpm 11, mantener también esa opción para los scripts y sus hijos durante
la sesión de PowerShell (no cambia configuración global):

```powershell
$env:PNPM_CONFIG_STORE_DIR = 'C:/Users/Poliguag/Downloads/musician-profile-dashboard/.pnpm-store'
```

`npm_config_store_dir` y la opción `store-dir` en `.npmrc` no configuran este
ajuste en pnpm 11; usar la variable anterior evita que el chequeo automático
intente reinstalar módulos desde otro store. Ver [cambios de pnpm 11](https://pnpm.io/blog/releases/11.0).

Los correos de registro/recuperación locales se consultan en
`http://127.0.0.1:54424`; no se envían a Gmail. La base local también es usada
por los fixtures de pruebas, que crean/borran sus propios usuarios efímeros.
**No ejecutar reset ni reconstrucción de esa base mientras se use esta vista**.
Los datos locales no se migran automáticamente a producción.

El arranque del 2026-11-05 quedó en segundo plano, con logs ignorados:
`.wrangler/auditoria/vista-local.stdout.log` y `vista-local.stderr.log`.
Se comprobó HTTP 200 y el feed visible en el navegador. Al terminar la sesión,
detener sólo el proceso de esta vista; no detener Docker Desktop ni contenedores
de otros proyectos. La advertencia de Durable Objects del modo Next dev no
equivale a probar Cloudflare: para eso existe `pnpm cf:test:auth`.
