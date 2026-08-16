import { test, expect } from "@playwright/test"

// Las invariantes de seguridad que NUNCA deben cambiar, ejercitadas contra la
// aplicación de verdad (no leyendo el código fuente).
//
// Son las mismas que `scripts/smoke-staging.mjs` corre contra un despliegue.
// La diferencia es el alcance: el smoke necesita una URL desplegada (acción
// humana), y esto corre en cada `pnpm test:e2e`, en local y en CI. Así el día
// que alguien afloje una autorización, se entera antes del deploy, no después.

test("POST /api/cleanup-orphaned-files sin sesión → 401", async ({ request }) => {
  const res = await request.post("/api/cleanup-orphaned-files", {
    data: { folder: "audio" },
    failOnStatusCode: false,
  })
  expect(res.status()).toBe(401)

  // Y no filtra detalle interno.
  const texto = await res.text()
  expect(texto).not.toMatch(/supabase|postgres|r2\.dev|cloudflarestorage/i)
})

test("GET /api/image-proxy con host no permitido → 400", async ({ request }) => {
  const res = await request.get("/api/image-proxy?url=https://host-que-no-es-el-bucket.example.com/x.png", {
    failOnStatusCode: false,
  })
  expect(res.status()).toBe(400)
})

test("GET /api/image-proxy sin parámetro → 400", async ({ request }) => {
  const res = await request.get("/api/image-proxy", { failOnStatusCode: false })
  expect(res.status()).toBe(400)
})

test("POST /api/delete-file sin sesión → 401", async ({ request }) => {
  const res = await request.post("/api/delete-file", {
    data: { urls: ["https://ejemplo.r2.dev/images/x.png"] },
    failOnStatusCode: false,
  })
  expect(res.status()).toBe(401)
})

test("POST /api/upload-url sin sesión → 401", async ({ request }) => {
  const res = await request.post("/api/upload-url", {
    data: { folder: "images", fileName: "x.png", contentType: "image/png", size: 1000 },
    failOnStatusCode: false,
  })
  expect(res.status()).toBe(401)
})

test("POST /api/eliminar-cuenta sin sesión → 401", async ({ request }) => {
  const res = await request.post("/api/eliminar-cuenta", { data: {}, failOnStatusCode: false })
  expect(res.status()).toBe(401)
})

test("/robots.txt y /sitemap.xml responden", async ({ request }) => {
  const robots = await request.get("/robots.txt")
  expect(robots.ok()).toBeTruthy()

  const sitemap = await request.get("/sitemap.xml")
  expect(sitemap.ok()).toBeTruthy()
  expect(await sitemap.text()).toContain("<loc>")
})

test("las cabeceras de seguridad están puestas en una página pública", async ({ request }) => {
  const res = await request.get("/legal")
  const cabeceras = res.headers()

  expect(cabeceras["x-content-type-options"]).toBe("nosniff")
  expect(cabeceras["referrer-policy"]).toBeTruthy()
  expect(cabeceras["content-security-policy"]).toBeTruthy()
  // Ninguna respuesta debe anunciar el framework.
  expect(cabeceras["x-powered-by"]).toBeUndefined()
})
