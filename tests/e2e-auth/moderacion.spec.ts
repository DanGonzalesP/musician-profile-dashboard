import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { mkdirSync } from "node:fs"
import { crearUsuarioE2E, borrarUsuarioE2E, iniciarSesion, exigirSupabaseLocal, type UsuarioE2E } from "./fixtures/sesion"

function moderatorFixture(): UsuarioE2E {
 exigirSupabaseLocal()
 const value = JSON.parse(process.env.SUPABASE_TEST_MODERATOR_JSON ?? "null")
 if (!value || typeof value.email !== "string" || !/^e2e-moderador-[0-9a-f]+@ejemplo[.]local$/.test(value.email) || typeof value.password !== "string") throw new Error("Falta el moderador local provisionado por el lanzador")
 return value as UsuarioE2E
}
test.describe("atención de reportes con sesión real",()=>{
 let artist:UsuarioE2E
 test.beforeAll(async()=>{artist=await crearUsuarioE2E()})
 test.afterAll(async()=>{await borrarUsuarioE2E(artist)})
 test("el borde no entrega la cola a visitantes ni a un artista",async({page})=>{
  await page.goto("/admin/reportes")
  await expect(page).toHaveURL(/login/)
  await iniciarSesion(page,artist)
  await page.goto("/admin/reportes")
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading",{name:"Revisión de reportes"})).toHaveCount(0)
 })
 test("revisa con teclado, retira el perfil público y lo restituye con historial",async({page,request},testInfo)=>{
  const report=await request.post("/api/reportes",{data:{reportedProfileId:artist.profileId,targetType:"perfil",reason:"otro",details:`Reporte ficticio de moderación ${artist.username}`,swornStatement:false}})
  expect(report.status()).toBe(201)
  expect((await request.get(`/${artist.username}`)).status()).toBe(200)
  await iniciarSesion(page,moderatorFixture(),"/admin/reportes")
  await expect(page.getByRole("heading",{name:"Revisión de reportes"})).toBeVisible()
  let row=page.getByRole("article").filter({hasText:artist.username})
  await expect(row).toHaveCount(1)
  const violations=(await new AxeBuilder({page}).include("main").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations
  expect(violations).toEqual([])
  mkdirSync(".wrangler/auditoria",{recursive:true})
  await page.screenshot({path:`.wrangler/auditoria/moderacion-${testInfo.project.name}.png`,fullPage:true})
  await row.getByRole("textbox").focus()
  await page.keyboard.type("Inicio de revision ficticia documentada")
  await page.keyboard.press("Tab")
  await expect(row.getByRole("button",{name:"Abrir revisión"})).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("status")).toContainText("Decisión guardada")
  await page.getByRole("link",{name:"En revisión",exact:true}).click()
  row=page.getByRole("article").filter({hasText:artist.username})
  await row.getByRole("textbox").fill("Retirada ficticia después de revisar el contenido")
  page.once("dialog",dialog=>dialog.accept())
  await row.getByRole("button",{name:"Aceptar y retirar todo el perfil"}).click()
  await expect(page.getByRole("status")).toContainText("Decisión guardada")
  expect((await request.get(`/${artist.username}`)).status()).toBe(404)
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(`/${artist.username}<`)
  await page.getByRole("link",{name:"Aceptados",exact:true}).click()
  row=page.getByRole("article").filter({hasText:artist.username})
  await row.getByRole("textbox").fill("Restitución ficticia tras revisar la decisión anterior")
  page.once("dialog",dialog=>dialog.accept())
  await row.getByRole("button",{name:"Restituir perfil y revocar la decisión"}).click()
  await expect(page.getByRole("status")).toContainText("Decisión guardada")
  expect((await request.get(`/${artist.username}`)).status()).toBe(200)
  await page.getByRole("link",{name:"Rechazados",exact:true}).click()
  row=page.getByRole("article").filter({hasText:artist.username})
  await row.getByRole("button",{name:"Ver historial"}).click()
  const history=row.getByRole("list",{name:"Historial de decisiones"})
  await expect(history.getByRole("listitem")).toHaveCount(3)
  await expect(history).toContainText("Restitución ficticia")
 })
})
