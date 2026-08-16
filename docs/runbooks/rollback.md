# Runbook — Rollback de un despliegue

Basado en §7 del `PLAN_VIBE_EMPRESARIAL.md`. La regla de oro, ya aprendida en
`DESPLIEGUE.md`: **el código antiguo no funciona contra una base ya migrada**.
Por eso las migraciones destructivas van en dos pasos (expandir → contraer): es
lo que mantiene posible el rollback de código solo.

## Tabla de decisión

| Qué falló | Acción | Tiempo |
|---|---|---|
| **Sólo código** | Promover el despliegue anterior en Vercel | < 2 min |
| **Código + migración aditiva** | Promover el anterior; la migración se queda (es compatible hacia atrás) | < 5 min |
| **Código + migración destructiva** | Restaurar el backup **y** promover el anterior (ver `restaurar-base.md`) | Según backup |
| **Sólo datos corruptos** | Restaurar sólo las tablas afectadas (`restaurar-base.md`, sección B) | Variable |

## Procedimiento (sólo código — el caso común)

1. Vercel → Deployments → localizar el último deploy sano (antes del fallido).
2. **Promote to Production**.
3. Verificar: `pnpm smoke <url-produccion>` → todo verde.
4. Confirmar `GET /api/health` → `200`.
5. Observar métricas/errores 15–30 min (F12).
6. Registrar el rollback y abrir el arreglo con una prueba que fije la regresión.

## Antes de cada despliegue (para que el rollback sea posible)

- Migraciones **aditivas** siempre que se pueda; las destructivas, en dos pasos.
- Backup de producción **antes** de aplicar migraciones (paso 4 de §7 del plan).
- Nunca aplicar migraciones a mano en el SQL Editor de producción: se pierde el
  rastro de qué se aplicó y el rollback se vuelve adivinanza.

## Simulacro

El rollback se **ensaya** al menos una vez (desplegar → revertir → verificar)
antes de necesitarlo de verdad. Se registra el tiempo real, que pasa a ser el
RTO de "sólo código".
