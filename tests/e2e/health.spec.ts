import { test, expect } from "@playwright/test"

// El endpoint de salud (F12). En E2E no hay Supabase ni R2 reales, así que se
// espera "degradado" (503) con el detalle por dependencia. Lo que se verifica
// es el CONTRATO de la respuesta —forma estable, sin filtrar internos—, no que
// las dependencias estén sanas.

test("GET /api/health responde con la forma esperada y sin filtrar internos", async ({ request }) => {
  const res = await request.get("/api/health")

  // 200 (sano) o 503 (degradado): ambos son "el endpoint funciona".
  expect([200, 503]).toContain(res.status())

  const cuerpo = await res.json()
  expect(cuerpo).toHaveProperty("estado")
  expect(["ok", "degradado"]).toContain(cuerpo.estado)
  expect(cuerpo).toHaveProperty("dependencias.supabase")
  expect(cuerpo).toHaveProperty("dependencias.r2")

  // No debe filtrar el nombre del bucket, la URL de Supabase ni credenciales.
  const texto = JSON.stringify(cuerpo)
  expect(texto).not.toMatch(/supabase\.co/i)
  expect(texto).not.toMatch(/r2\.dev|cloudflarestorage/i)
  expect(texto).not.toMatch(/secret|access[_-]?key|token/i)

  // Nunca se cachea.
  expect(res.headers()["cache-control"]).toContain("no-store")
})
