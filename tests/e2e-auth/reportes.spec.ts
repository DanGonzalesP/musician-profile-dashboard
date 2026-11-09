import { test, expect } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { crearUsuarioE2E, borrarUsuarioE2E, exigirSupabaseLocal, type UsuarioE2E } from "./fixtures/sesion"

test.describe("reporte sin cuenta a través del runtime",()=>{
 let owner:UsuarioE2E
 test.beforeAll(async()=>{owner=await crearUsuarioE2E()})
 test.afterAll(async()=>{await borrarUsuarioE2E(owner)})
 test("recibe la denuncia sin sesión y rechaza el acceso directo o campos de revisión",async({request})=>{
  const report={reportedProfileId:owner.profileId,targetType:"perfil",reason:"derechos_de_autor",details:"Reclamo ficticio sobre una obra de prueba",swornStatement:true}
  const response=await request.post("/api/reportes",{data:report})
  expect(response.status()).toBe(201)
  expect(await response.json()).toEqual({accepted:true})
  expect(response.headers()["cache-control"]).toBe("no-store")
  expect((await request.post("/api/reportes",{data:{...report,status:"aceptado"}})).status()).toBe(400)
  const local=exigirSupabaseLocal()
  const anon=createClient(local.url,local.anonKey,{auth:{persistSession:false,autoRefreshToken:false}})
  expect((await anon.from("content_reports").insert({reported_profile_id:owner.profileId,target_type:"perfil",reason:"otro",details:report.details})).error).toBeTruthy()
  // Administrador solo inspecciona la fila ficticia; no realiza la operación probada.
  const admin=createClient(local.url,local.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const saved=await admin.from("content_reports").select("status,reporter_user_id,copyright_sworn_statement").eq("reported_profile_id",owner.profileId).single()
  expect(saved.error).toBeNull()
  expect(saved.data).toEqual({status:"pendiente",reporter_user_id:null,copyright_sworn_statement:true})
 })
})
