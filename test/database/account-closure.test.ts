import { afterAll, beforeAll, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import { signMediaReceipt, type MediaReceipt } from "../../lib/media-receipt"
import { claveDeMedio, clienteAnonimo, crearUsuario, limpiarUsuarios, prepararMedioHistorico, type UsuarioDePrueba } from "./helpers"

const users: UsuarioDePrueba[] = []
const keyId = `closure_${randomUUID()}`
const secret = randomBytes(32).toString("hex")
let provisioned = false
function sql(input: string): string {
  try {
    return execFileSync("docker", ["exec", "-i", "supabase_db_vibe", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"],
      { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
  } catch { throw new Error("Falló la preparación SQL local de supresión") }
}
beforeAll(() => {
  const project = execFileSync("docker",["inspect","--format",'{{ index .Config.Labels "com.supabase.cli.project" }}',"supabase_db_vibe"],{encoding:"utf8"}).trim()
  if (project !== "vibe" || process.env.SUPABASE_TEST_URL !== "http://127.0.0.1:54421") throw new Error("Sólo Vibe local")
  if (sql("select legacy_puts_drained_at is null from private.media_storage_safety;") !== "t") throw new Error("La prueba requiere drenaje local sin habilitar")
  sql(`insert into private.media_runtime_keys(key_id,secret_hex) values('${keyId}','${secret}');`)
  provisioned = true
})
afterAll(async () => {
  await limpiarUsuarios(...users)
  if (provisioned) sql(`delete from private.media_runtime_keys where key_id='${keyId}';
    update private.media_storage_safety set legacy_puts_drained_at=null,evidence_ref=null;`)
})
async function user() { const owner = await crearUsuario(); users.push(owner); return owner }
const sign = (receipt: MediaReceipt) => signMediaReceipt(receipt,secret,keyId)
async function reserve(owner: UsuarioDePrueba) {
  const receipt: MediaReceipt = { action:"reserve",actor:owner.id,key:claveDeMedio(owner,"images"),
    bytes:100,contentType:"image/webp",profileId:owner.profileId,limitBytes:1000,quotaMode:"rechazar" }
  expect((await owner.supabase.rpc("reserve_media_upload",sign(receipt))).error).toBeNull()
  return receipt
}
const begin = (owner: UsuarioDePrueba) => owner.supabase.rpc("begin_media_account_closure")
const batch = (owner: UsuarioDePrueba) => owner.supabase.rpc("get_media_account_closure_batch")
const retire = (owner: UsuarioDePrueba, key: string) => owner.supabase.rpc("retire_media_upload",
  sign({action:"retire",actor:owner.id,key,bytes:0,etag:'"verified-empty"'}))

it("la RPC antigua y un visitante no pueden saltar la congelación", async () => {
  const owner = await user()
  expect((await owner.supabase.rpc("eliminar_mi_cuenta")).error?.code).toBe("PT409")
  expect((await owner.supabase.rpc("media_account_exists")).data).toBe(true)
  for (const name of ["begin_media_account_closure","get_media_account_closure_batch","eliminar_mi_cuenta"]) {
    expect((await clienteAnonimo().rpc(name)).error).toBeTruthy()
  }
})

it("congela perfil, borrador, catálogo, miembros y nuevas escrituras del actor", async () => {
  const owner = await user(); const member = await user(); const other = await user()
  expect((await owner.supabase.from("profiles").update({owner_user_id:owner.id,profile_type:"band"}).eq("id",owner.profileId!)).error).toBeNull()
  expect((await owner.supabase.from("band_members").insert({band_profile_id:owner.profileId,member_user_id:member.id,role:"admin",status:"accepted"})).error).toBeNull()
  const product = await owner.supabase.from("products").insert({seller_id:owner.profileId,type:"merch",title:"Antes",price:10}).select("id").single()
  expect(product.error).toBeNull()
  expect((await member.supabase.from("profiles").update({bio:"Antes del cierre"}).eq("id",owner.profileId!).select("bio")).data).toEqual([{bio:"Antes del cierre"}])
  expect((await begin(owner)).data).toBe(true)
  expect((await begin(owner)).data).toBe(true)
  for (const actor of [owner,member]) {
    expect((await actor.supabase.from("profiles").update({bio:"No debe guardarse"}).eq("id",owner.profileId!)).error?.code).toBe("PT409")
    expect((await actor.supabase.from("products").update({title:"Después"}).eq("id",product.data!.id)).error?.code).toBe("PT409")
    expect((await actor.supabase.from("services").insert({profile_id:owner.profileId,title:"No permitido"})).error?.code).toBe("PT409")
    expect((await actor.supabase.from("profile_private").upsert({profile_id:owner.profileId,draft_content:{blocks:[]}})).error?.code).toBe("PT409")
  }
  expect((await owner.supabase.from("profile_questions").insert({profile_id:other.profileId,asker_user_id:owner.id,block_type:"hero",block_label:"Pregunta",message:"No debe guardarse"})).error?.code).toBe("PT409")
  expect((await owner.supabase.from("band_members").delete().eq("band_profile_id",owner.profileId!)).error?.code).toBe("PT409")
  expect((await member.supabase.from("profiles").update({bio:"Mi perfil sigue editable"}).eq("id",member.profileId!)).error).toBeNull()
  expect((await owner.supabase.from("products").select("title").eq("id",product.data!.id)).data).toEqual([{title:"Antes"}])
})

it("impide nuevas reservas de un colaborador sobre un perfil en eliminación", async () => {
  const owner = await user(); const member = await user()
  expect((await owner.supabase.from("profiles").update({owner_user_id:owner.id,profile_type:"band"}).eq("id",owner.profileId!)).error).toBeNull()
  expect((await owner.supabase.from("band_members").insert({band_profile_id:owner.profileId,member_user_id:member.id,role:"admin",status:"accepted"})).error).toBeNull()
  expect((await begin(owner)).data).toBe(true)
  const proof = sign({action:"reserve",actor:member.id,key:claveDeMedio(member,"images"),bytes:100,
    contentType:"image/webp",profileId:owner.profileId,limitBytes:1000,quotaMode:"rechazar"})
  expect((await member.supabase.rpc("reserve_media_upload",proof)).error?.code).toBe("PT409")
  expect((await member.supabase.from("media_assets").select("key")).data).toEqual([])
})

it("una reserva pendiente puede retirarse durante el cierre, sin publicar ni perder propiedad", async () => {
  const owner = await user(); const other = await user(); const receipt = await reserve(owner)
  expect((await begin(owner)).data).toBe(true)
  expect((await batch(owner)).data).toMatchObject({keys:[receipt.key],remaining:1,blocked:false})
  expect((await owner.supabase.rpc("finalize_media_upload",sign({...receipt,action:"finalize",etag:'"uploaded"'}))).error?.code).toBe("PT409")
  expect((await owner.supabase.rpc("eliminar_mi_cuenta")).error?.code).toBe("PT409")
  expect((await other.supabase.rpc("retire_media_upload",sign({action:"retire",actor:owner.id,key:receipt.key,bytes:0,etag:'"x"'}))).error).toBeTruthy()
  expect((await retire(owner,receipt.key)).data).toBe(true)
  expect((await batch(owner)).data).toMatchObject({keys:[],remaining:0,total:1,blocked:false})
  expect((await owner.supabase.rpc("eliminar_mi_cuenta")).error).toBeNull()
  expect((await owner.supabase.rpc("media_account_exists")).data).toBe(false)
  // Auditoría estructural de la fila duradera; la privacidad se prueba con JWT abajo.
  expect(sql(`select count(*) from public.media_assets where key='${receipt.key}' and owner_user_id='${owner.id}' and bytes=0 and profile_id is null;`)).toBe("1")
  expect((await owner.supabase.from("media_assets").select("key")).data).toEqual([])
  expect((await other.supabase.from("media_assets").select("key").eq("key",receipt.key)).data).toEqual([])
})

it("cierra catálogo y comentarios sin cascada sólo después de completar el protocolo", async () => {
  const owner = await user(); const other = await user()
  const block = await owner.supabase.from("profile_blocks").insert({profile_id:owner.profileId,block_type:"publicaciones",position_index:0,content:{items:[]}}).select("id").single()
  expect(block.error).toBeNull()
  const postId = `${block.data!.id}:item`
  expect((await other.supabase.from("feed_post_comments").insert({post_id:postId,user_id:other.id,content:"Comentario"})).error).toBeNull()
  expect((await owner.supabase.from("services").insert({profile_id:owner.profileId,title:"Servicio"})).error).toBeNull()
  expect((await owner.supabase.from("products").insert({seller_id:owner.profileId,type:"merch",title:"Producto",price:10})).error).toBeNull()
  expect((await begin(owner)).data).toBe(true)
  expect((await other.supabase.from("feed_post_comments").insert({post_id:postId,user_id:other.id,content:"Comentario tardío"})).error?.code).toBe("PT409")
  expect((await owner.supabase.rpc("eliminar_mi_cuenta")).error).toBeNull()
  expect((await owner.supabase.rpc("media_account_exists")).data).toBe(false)
  expect((await other.supabase.from("feed_post_comments").select("id").eq("post_id",postId)).data).toEqual([])
  expect((await other.supabase.rpc("media_account_exists")).data).toBe(true)
})

it("los históricos requieren drenaje y una atestación posterior: bytes=0 o replay no bastan", async () => {
  const owner = await user(); const key = claveDeMedio(owner,"images")
  await prepararMedioHistorico({key,owner_user_id:owner.id,folder:"images",bytes:0})
  expect((await begin(owner)).data).toBe(true)
  expect((await batch(owner)).data).toMatchObject({keys:[],blocked:true})
  expect((await owner.supabase.rpc("eliminar_mi_cuenta")).error?.code).toBe("PT409")
  const proof = sign({action:"retire",actor:owner.id,key,bytes:0,etag:'"empty"'})
  expect((await owner.supabase.rpc("retire_media_upload",proof)).data).toBe(true)
  sql("update private.media_storage_safety set legacy_puts_drained_at=clock_timestamp(),evidence_ref='fixture local sin firmas anteriores';")
  // Aunque el mismo recibo aún esté dentro de sus 60 s, no rejuvenece el HEAD/PUT.
  expect((await owner.supabase.rpc("retire_media_upload",proof)).data).toBe(true)
  expect((await batch(owner)).data).toMatchObject({keys:[key],remaining:1,blocked:false})
  expect((await owner.supabase.rpc("eliminar_mi_cuenta")).error?.code).toBe("PT409")
  sql("update private.media_storage_safety set legacy_puts_drained_at=null,evidence_ref=null;")
})

it("cierre y escritura simultáneos se serializan: tras cierre no se reabre el perfil", async () => {
  const owner = await user()
  const [closing,writing] = await Promise.all([begin(owner),owner.supabase.from("profiles").update({bio:"Carrera"}).eq("id",owner.profileId!)])
  // Un deadlock aborta una transacción completa; el reintento de cierre es seguro.
  if (closing.error) {
    expect(closing.error.code).toBe("40P01")
    expect((await begin(owner)).data).toBe(true)
  } else expect(closing.data).toBe(true)
  if (writing.error) expect(["PT409","40P01"]).toContain(writing.error.code)
  expect((await owner.supabase.from("profiles").update({bio:"Posterior"}).eq("id",owner.profileId!)).error?.code).toBe("PT409")
})
