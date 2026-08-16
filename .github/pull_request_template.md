## Qué cambia

<!-- Una fase = un PR. Describe el comportamiento, no los archivos. -->

Fase del plan: <!-- F0…F14, o "fuera de plan" con justificación -->
Hallazgos que cierra: <!-- P-01…P-34, o ninguno -->

## Evidencia reproducible

<!-- No "debería funcionar". Pega la salida real. -->

- [ ] `pnpm qa` limpio
- [ ] `pnpm build` verde
- [ ] `pnpm test:db` (si tocó base o RLS)
- [ ] `pnpm test:e2e` (si tocó render, editor, feed o reproductor)
- [ ] `pnpm test:visual` (si tocó cualquier superficie visible)

```
<!-- salida de los comandos -->
```

## Preservación de la UX

- [ ] Cero diferencias visuales, **o** diferencia aprobada explícitamente con la captura al lado.
- [ ] Las pruebas E2E existentes **no** se modificaron. (Si hubo que tocarlas, la UX cambió:
      explica por qué es intencional o revierte.)
- [ ] Ninguna función existente se eliminó.

## Base de datos

- [ ] No se editó ninguna migración ya aplicada.
- [ ] La migración nueva es idempotente (`if not exists`, `create or replace`, `drop … if exists`).
- [ ] Si el cambio es destructivo, va en dos despliegues (expandir → contraer).
- [ ] Probada en local (`db:verify`) → CI (`test:db`) → staging, en ese orden.

## Seguridad

- [ ] No se introdujo la service role key en ningún camino de la aplicación.
- [ ] Ninguna ruta nueva devuelve `error.message` al cliente.
- [ ] Las escrituras nuevas tienen límite aplicado en la base.
- [ ] Ningún log nuevo contiene PII, tokens ni contenido de bloques.

## Rollback

<!-- Paso a paso. Si la migración es destructiva, di qué backup hace falta. -->

## Estado del árbol

```
HEAD:
git status --short:
Pruebas antes → después:
```
