# Observabilidad — Vibe

Cierra parte de **P-22** y **P-23**. Define qué se registra, qué **nunca** se
registra, cómo se consulta la salud del sistema y qué falta para cerrar el
resto (alertas y agregador), que depende de una decisión de proveedor.

## 1. Log estructurado

Todo el logging del servidor pasa por [`lib/log.ts`](../lib/log.ts). No hay
`console.error` sueltos en `app/api/*`: las 7 rutas lo adoptaron.

Cada evento es **una línea JSON** con campos estables:

| Campo | Qué es |
|---|---|
| `nivel` | `info` \| `warn` \| `error` |
| `ruta` | ruta lógica, p. ej. `api/health` |
| `mensaje` | texto fijo, sin datos variables sensibles |
| `request_id` | correlación; viene de `cf-ray` (el mismo id que busca el panel de Cloudflare), luego `x-request-id`, y si no se genera |
| `ts` | ISO 8601 |
| `duracionMs`, `resultado`, `userId` | opcionales |

`userId` **sí** se registra: es un UUID opaco, no PII por sí solo, y sin él no
se puede atender el reporte de un usuario concreto.

### Lo que NUNCA sale en un log

La redacción es una función con pruebas ([`lib/log.test.ts`](../lib/log.test.ts)),
no un consejo en un comentario. Se aplica a **cualquier profundidad** del objeto:

- Correos, DNI, nombres legales, teléfonos, direcciones.
- Tokens, claves, cookies, cabeceras `Authorization`.
- Contenido de bloques, borradores, bios, textos de comentarios, prompts.

Registrar de más no es mejor observabilidad: es una fuga de privacidad con
formato bonito (Ley 29733; GDPR art. 5.1.c, minimización).

## 2. Salud — `GET /api/health`

[`app/api/health/route.ts`](../app/api/health/route.ts). Verifica las dos
dependencias duras y responde sin filtrar nada interno:

```json
{ "estado": "ok", "version": "a1b2c3d", "dependencias": { "supabase": "ok", "r2": "ok" } }
```

- **200** si Supabase y R2 responden; **503** si alguna falla.
- No revela el nombre del bucket, la URL de Supabase ni el detalle del fallo:
  eso va al log privado. Un endpoint de salud es público por naturaleza.
- Rate-limitado (60/min por IP) y `Cache-Control: no-store`.
- Cada chequeo tiene timeout de 3 s: un health colgado es peor que uno que
  falla rápido.

Se consume desde `scripts/smoke-staging.mjs` y desde el uptime monitor externo.

## 2.bis · El registro que hay que leer ahora: la cuota de almacenamiento

La cuota de almacenamiento por usuario está desplegada **en modo observación**:
hoy no rechaza a nadie, sólo registra. Ese registro es el producto entero de la
funcionalidad, porque es de donde sale el número con el que después se
configura el límite real.

Buscar en los registros del Worker:

```
mensaje = "subida por encima de la cuota de almacenamiento"
```

Cada línea trae `userId`, `usadoBytes`, `limiteBytes`, `bytesPedidos`, `modo` y
`rechazada`. Con `modo: "observar"`, `rechazada` es siempre `false`: la subida
siguió adelante.

**Qué hacer con eso.** Si tras unas semanas casi nadie aparece, el límite por
defecto (5 GB) es holgado y se puede pasar a `rechazar` con tranquilidad. Si
aparecen artistas legítimos —perfiles con discografía larga, no scripts—, el
número está corto y hay que subirlo ANTES de activar el rechazo. Activarlo sin
mirar esto es exactamente lo que el modo observación existe para evitar.

## 3. Lo que falta (decisión de proveedor — §16 del plan)

- **Agregador de errores / drain.** Con la migración los logs viven en
  **Cloudflare Workers Logs** (`observability.enabled` ya está en
  `wrangler.jsonc`, así que se están recogiendo). Cloudflare los retiene unos
  días; para conservarlos más hay que sacarlos con un **Logpush** a un destino
  barato (R2 sirve, y ya se paga).

  Recomendación por defecto: **Logpush a R2** antes que Sentry; añadir Sentry
  sólo si el volumen de errores lo justifica. Sigue siendo una decisión de
  costo, no técnica. Lo que cambió respecto de la recomendación anterior —log
  drains de Vercel— es sólo el nombre del mecanismo.
- **Alertas.** Al menos una activa: tasa de 5xx sostenida, o `/api/health`
  devolviendo 503 más de N minutos. Se configura en el destino del drain o en
  el uptime monitor.

Ambas requieren credenciales/decisión y quedan fuera de lo accionable en el
repositorio. Todo lo demás (logger, redacción, health, smoke) está hecho y
probado.

## 4. Retención

Los logs se retienen según [`retencion-de-datos.md`](retencion-de-datos.md).
El logger no persiste nada por su cuenta: sólo emite a stdout/stderr, y la
retención la fija el drain de destino.
