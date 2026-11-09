import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import { clienteAnonimo, crearUsuario, limpiarUsuarios, type UsuarioDePrueba } from "./helpers"
import { signAnonymousReport } from "../../lib/anonymous-report"
import type { ReportInput } from "../../lib/report-schema"

describe("reportes anónimos atestiguados", () => {
 const secret=randomBytes(32).toString("hex"), keyId=`test_${randomUUID()}`
 let user: UsuarioDePrueba
 const subjects=new Set<string>()
 function sql(input:string) {
  try { execFileSync("docker",["exec","-i","supabase_db_vibe","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q"],{input,stdio:["pipe","pipe","pipe"]}) }
  catch { throw new Error("No se pudo preparar reportes ficticios") }
 }
 function report():ReportInput { return {reportedProfileId:user.profileId!,targetType:"perfil",reason:"otro",details:"Reporte ficticio para comprobar los permisos",swornStatement:false,reporterEmail:`${randomUUID()}@ejemplo.local`} }
 function proof(identity=randomUUID(),value=report()) {
  const signed=signAnonymousReport(value,identity,secret,keyId)
  subjects.add(JSON.parse(signed.p_payload).subject)
  return signed
 }
 const submit=(signed:ReturnType<typeof proof>)=>clienteAnonimo().rpc("submit_anonymous_report",signed)
 beforeAll(async()=>{
  const label=execFileSync("docker",["inspect","--format",'{{ index .Config.Labels "com.supabase.cli.project" }}',"supabase_db_vibe"],{encoding:"utf8"}).trim()
  if(label!=="vibe"||process.env.SUPABASE_TEST_URL!=="http://127.0.0.1:54421")throw new Error("Solo Vibe local")
  user=await crearUsuario()
  sql(`insert into private.anonymous_gateway_keys values('${keyId}','${secret}');`)
 })
 afterAll(async()=>{
  sql(`delete from private.anonymous_gateway_keys where key_id='${keyId}';`)
  if(subjects.size)sql(`delete from public.write_rate_limit_windows where bucket='reportes_gateway' and sujeto in (${[...subjects].map(s=>`'${s}'`).join(",")});`)
  if(user)await limpiarUsuarios(user)
 })
 it("recibe un reporte firmado y no expone datos del reportante",async()=>{
  expect((await submit(proof())).data).toEqual({accepted:true,retry_after:0})
  const result=await clienteAnonimo().from("content_reports").select("*")
  expect(result.error || result.data?.length===0).toBeTruthy()
 })
 it("no permite insertar directamente aunque se conozca la anon key",async()=>{
  expect((await clienteAnonimo().from("content_reports").insert({reported_profile_id:user.profileId,target_type:"perfil",reason:"otro",details:"Reporte directo que debe ser rechazado"})).error).toBeTruthy()
 })
 it("cambiar veinte correos concurrentemente no renueva el cupo de red",async()=>{
  const identity=randomUUID()
  const results=await Promise.all(Array.from({length:20},()=>submit(proof(identity))))
  expect(results.every(r=>!r.error)).toBe(true)
  expect(results.filter(r=>r.data?.accepted)).toHaveLength(15)
  expect(results.filter(r=>r.data?.accepted===false)).toHaveLength(5)
 })
 it("no acepta contenido manipulado con una firma de otro reporte",async()=>{
  const signed=proof();const data=JSON.parse(signed.p_payload);data.report.details="Este contenido no estaba en la firma original"
  expect((await submit({...signed,p_payload:JSON.stringify(data)})).error?.code).toBe("42501")
 })
 it("rechaza comprobantes vencidos con firma correcta",async()=>{
  const data=JSON.parse(proof().p_payload);data.issuedAt-=120
  const p_payload=JSON.stringify(data)
  const p_signature=createHmac("sha256",Buffer.from(secret,"hex")).update("vibe-anonymous-report\n"+p_payload).digest("hex")
  expect((await submit({p_payload,p_signature})).error?.code).toBe("42501")
 })
 it("la base exige juramento y no admite campos administrativos",async()=>{
  expect((await submit(proof(randomUUID(),{...report(),reason:"derechos_de_autor",swornStatement:false}))).error?.code).toBe("22023")
  const forged={...report(),status:"aceptado"}
  expect((await submit(proof(randomUUID(),forged))).error?.code).toBe("22023")
  expect((await user.supabase.from("content_reports").insert({reporter_user_id:user.id,reported_profile_id:user.profileId,target_type:"perfil",reason:"otro",details:"Intento de resolver mi propio reporte",status:"aceptado"})).error).toBeTruthy()
 })
 it("repetir un comprobante consume cupo y revocar la clave impide usarlo",async()=>{
  const signed=proof()
  expect((await submit(signed)).data?.accepted).toBe(true)
  expect((await submit(signed)).data?.accepted).toBe(true)
  sql(`delete from private.anonymous_gateway_keys where key_id='${keyId}';`)
  expect((await submit(signed)).error).toBeTruthy()
 })
})
