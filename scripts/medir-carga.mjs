// Adaptado del patrón scripts/load-staging.mjs de Bancary (solo lectura).
// GET público, sin sesiones ni modificaciones. Nunca toma el destino de .env.
const origin = new URL(process.env.VIBE_LOAD_ORIGIN ?? 'http://127.0.0.1:3070');
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
  throw new Error('Usa un origen sin credenciales, rutas ni parámetros.');
}
if (!['http:', 'https:'].includes(origin.protocol) || (!local && (
  origin.protocol !== 'https:' || process.env.VIBE_LOAD_CONFIRMED_STAGING_ORIGIN !== origin.origin
))) throw new Error('El destino remoto requiere declarar explícitamente el mismo origen de staging.');
function integer(name, fallback, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${name} fuera de rango (1–${maximum}).`);
  return value;
}
const requests = integer('VIBE_LOAD_REQUESTS', 30, 500);
const concurrency = Math.min(requests, integer('VIBE_LOAD_CONCURRENCY', 3, 20));
const budget = integer('VIBE_LOAD_P95_MS', 1000, 30000);
const times = [];
const statuses = {};
let cursor = 0;
let errors = 0;
const started = performance.now();
async function worker() {
  while (cursor++ < requests) {
    const start = performance.now();
    try {
      const response = await fetch(origin, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      statuses[response.status] = (statuses[response.status] ?? 0) + 1;
      if (response.status !== 200) errors++;
      await response.arrayBuffer();
    } catch { errors++; }
    times.push(performance.now() - start);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
times.sort((a, b) => a - b);
const percentile = p => Math.round(times[Math.ceil(times.length * p) - 1]);
const report = {
  environment: local ? 'local' : 'staging', scope: 'GET / sin sesión; no mide escrituras ni reproducción',
  requests, concurrency, statuses, errors, errorRate: errors / requests,
  durationMs: Math.round(performance.now() - started),
  p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), budgetP95Ms: budget,
};
console.log(JSON.stringify(report, null, 2));
if (report.errorRate > .01 || report.p95Ms > budget) process.exitCode = 1;
