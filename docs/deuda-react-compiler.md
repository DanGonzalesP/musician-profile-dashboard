# Deuda de warnings de lint — inventario y trinquete

Este archivo es el registro de las advertencias de ESLint que el proyecto acepta
**a propósito y de forma temporal**, con su plan de retiro. Lo exige F1/F9 del
[`PLAN_VIBE_EMPRESARIAL.md`](../PLAN_VIBE_EMPRESARIAL.md) y lo referencia
[`linea-base.md`](linea-base.md).

## Por qué un trinquete y no `--max-warnings=0` de golpe

La mayoría de estas advertencias son del React Compiler
(`react-hooks/set-state-in-effect`, `react-hooks/refs`). Arreglarlas de golpe
significa refactorizar los hooks del editor y del reproductor, que es justo el
código más frágil del proyecto y el que más veces se ha roto. Un CI en rojo que
nadie puede arreglar se aprende a ignorar, y con él se ignoran los errores que sí
importan.

El mecanismo es un **trinquete** (`eslint . --max-warnings=<N>`):

1. Se fija `N` en el número exacto de hoy. El CI/`pnpm qa` falla si alguien
   **añade** una advertencia nueva.
2. Cuando se toca un componente por otro motivo, se arreglan sus advertencias y
   se **baja** `N`. El techo solo baja, nunca sube (regla de `AGENTS.md`).
3. Al llegar a 0, el flag pasa a `--max-warnings=0` permanente.

## Techo vigente

**2026-11-09: `N = 0`.** Las13 advertencias medidas ese día se corrigieron sin
apagar reglas: reinicio de estado por cambio de props durante el render
(CommentsPanel, AskAboutBlock, grupo), `useEffectEvent` para cargas iniciales
(productos, servicios), `useSyncExternalStore` para la URL de compartir, lectura de
Auth antes del primer `setState` (grupos), microtarea en el fallo síncrono de
suscripción (FeedHeader) y alias del objeto ref en limpiezas de contadores de
generación (no nodos DOM). `npx eslint .`: 0 problemas. Pendiente confirmarlo en
`pnpm qa` final y CI. El texto de abajo es historia.

Perfil público y tienda (2026-11-06): la nueva sesión de datos inicializa su estado
de carga/error; ya no lo establece síncronamente desde el efecto de carga.
Reintentos nacen de eventos. Se mantiene el techo18 hasta la medición final.

TrackListSession (2026-11-06) usa la notificación inicial de ResizeObserver en
vez de medir y actualizar estado síncronamente en el efecto. También escucha
el breakpoint móvil para actualizar la presentación si el ancho del contenedor
no cambia. Sin ejecución de lint todavía; el techo permanece en18.

El handler generarBannerConIA queda conectado al inspector del bloque principal
(2026-11-06), con vista previa y aceptación del archivo antes de la subida normal.
Ya no es una función deliberadamente desconectada. Pendiente medir lint al final;
no se reduce el techo ni se declara la advertencia resuelta por ejecución.

Implementación del 2026-11-06, pendiente de validación final: ThemeToggle,
AppAccentCard y LocaleProvider sustituyen la recuperación de preferencias con
setState en efectos por un almacén externo con snapshot de servidor estable.
Conserva claves anteriores, notifica cambios en la misma pestaña y entre pestañas,
y conserva una elección en memoria si localStorage rechaza la escritura.
ThemePreferences sincroniza las clases del documento fuera de Configuración.
No se ejecutó lint ni se reduce el techo hasta medir el resultado. Pendientes:
hidratación, preferencias previas, almacenamiento bloqueado/lleno, borrar claves,
cambio entre pestañas, desmontaje, teclado y axe. El switch de tema ahora tiene
nombre accesible explícito.

**Histórico `N = 18`** — antes declarado en `package.json`. El 2026-11-05 se retiraron los tres `any` de la pantalla de limpieza con validación de su respuesta, sin desactivar reglas.

> Historia del techo:
> - **18** — respuesta de limpieza tipada y validada; errores capturados como `unknown`.
> - **21** — eliminado el binding sin uso de `FeedContainer`; se preservan las actualizaciones de estado.
> - **28** — línea base medida sobre el árbol commiteado `6ffa555` (ver `linea-base.md`).
> - **22** — tras aplicar el trabajo de seguridad/validación no commiteado de esta
>   tanda (F2/F3/F5 + adopción de `lib/log.ts`), que retiró 6 advertencias de paso
>   (varios `catch (error: any)` pasaron a `catch (error)` tipado). El techo se
>   ratchetea a la cifra realmente alcanzada por el árbol entregado.

## Inventario previo (22)

Medido con `npx eslint . -f json`. Reproducible con:

```powershell
pnpm lint
```

### `react-hooks/set-state-in-effect` — 16

`setState()` síncrono dentro de un `useEffect`. Patrón de hidratación (leer
`localStorage`/tema/estado del reproductor al montar). Retiro: cuando se toque
cada componente, mover la lectura a `useState(() => ...)` o a un evento.

| Archivo | Línea |
|---|---|
| `app/[username]/profile-client.tsx` | 63 |
| `app/[username]/profile-client.tsx` | 87 |
| `app/[username]/tienda/tienda-client.tsx` | 65 |
| `components/accent-picker.tsx` | 57 |
| `components/block-inspector.tsx` | 1244 |
| `components/block-inspector.tsx` | 1853 |
| `components/blocks/track-list-block.tsx` | 81 |
| `components/blocks/track-list-block.tsx` | 117 |
| `components/feed/CommentsPanel.tsx` | 66 |
| `components/inspector/image-adjust-modal.tsx` | 58 |
| `components/inspector/image-adjust-modal.tsx` | 95 |
| `components/inspector/item-pager.tsx` | 45 |
| `components/inspector/location-fields.tsx` | 77 |
| `components/legal/license-history-panel.tsx` | 14 |
| `components/locale-provider.tsx` | 24 |
| `components/theme-toggle.tsx` | 11 |

### `@typescript-eslint/no-explicit-any` — 3

Todas en `app/cleanup/page.tsx` (líneas 15, 50, 126), la página interna de
mantenimiento manual de R2. Retiro: tipar la respuesta de la limpieza cuando se
toque esa pantalla en F2/F14.

### `react-hooks/refs` — 1

`components/blocks/track-list-block.tsx:450`. Lectura de un ref durante el render.
Retiro: junto con los `set-state-in-effect` del mismo archivo.

### `@typescript-eslint/no-unused-vars` — 2

| Archivo | Línea | Símbolo |
|---|---|---|
| `components/profile-editor.tsx` | 556 | `generarBannerConIA` |

En la revisión del 2026-11-04 se retiró la advertencia de variable sin usar de
`FeedContainer`: su valor no se leía, pero se conservó el setter y sus
actualizaciones para evitar cambiar comportamiento. La ejecución actual de
`pnpm lint` muestra 21 advertencias; el inventario histórico restante se
mantiene por archivo hasta retirar cada warning de forma segura.

`generarBannerConIA` es un handler definido pero no cableado a ningún botón hoy;
se conserva porque la lógica de generación con IA sigue siendo funcional. Retiro:
al cablearlo de nuevo o al retirar la generación de banner, lo que ocurra primero.

## Regla de oro

Nunca subir `N`. Si un cambio necesita añadir una advertencia, o se arregla otra
en el mismo PR para compensar, o se justifica por escrito aquí y se decide
explícitamente — nunca en silencio.

Implementación adicional 2026-11-06: ImageAdjustModal deriva el desplazamiento
válido sin efecto de setState y reinicia su sesión por imagen/proporción. Se retira
su desactivación de exhaustive-deps; carga de imagen sólo actualiza desde eventos.
Pendiente medir lint en la etapa final; techo de 18 sin cambios.

LocationSelect (2026-11-06): selección derivada del valor recibido y catálogo
cargado asíncronamente; retirados setState síncronos del efecto de departamentos
y la desactivación de exhaustive-deps. Resultado de lint pendiente; techo intacto.

TracksFields (2026-11-06): lectura inicial de duraciones con trabajos estables y
useEffectEvent para aplicar al borrador vigente, sin desactivar exhaustive-deps.
Sin medición de lint ni pruebas todavía; techo18 intacto.
