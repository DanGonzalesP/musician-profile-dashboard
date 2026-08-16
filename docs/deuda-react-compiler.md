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

**`N = 22`** — declarado en `package.json` (`"lint": "eslint . --max-warnings=22"`).

> Historia del techo:
> - **28** — línea base medida sobre el árbol commiteado `6ffa555` (ver `linea-base.md`).
> - **22** — tras aplicar el trabajo de seguridad/validación no commiteado de esta
>   tanda (F2/F3/F5 + adopción de `lib/log.ts`), que retiró 6 advertencias de paso
>   (varios `catch (error: any)` pasaron a `catch (error)` tipado). El techo se
>   ratchetea a la cifra realmente alcanzada por el árbol entregado.

## Inventario actual (22)

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
| `components/feed/FeedContainer.tsx` | 31 | variable sin usar |
| `components/profile-editor.tsx` | 556 | `generarBannerConIA` |

`generarBannerConIA` es un handler definido pero no cableado a ningún botón hoy;
se conserva porque la lógica de generación con IA sigue siendo funcional. Retiro:
al cablearlo de nuevo o al retirar la generación de banner, lo que ocurra primero.

## Regla de oro

Nunca subir `N`. Si un cambio necesita añadir una advertencia, o se arregla otra
en el mismo PR para compensar, o se justifica por escrito aquí y se decide
explícitamente — nunca en silencio.
