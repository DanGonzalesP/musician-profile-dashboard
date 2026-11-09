import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import { signMediaReceipt as sign, type MediaReceipt } from "../../lib/media-receipt"
import { claveDeMedio, clienteAnonimo, crearUsuario, limpiarUsuarios, prepararMedioHistorico, type UsuarioDePrueba } from "./helpers"

describe("reservas verificadas y finalización de medios", () => {
  const users: UsuarioDePrueba[] = []
  let ana: UsuarioDePrueba
  let beto: UsuarioDePrueba
  const keyId = `test_${randomUUID()}`
  const secret = randomBytes(32).toString("hex")
  let provisioned = false
  const signMediaReceipt = (receipt: MediaReceipt) => sign(receipt,secret,keyId)
  function sql(input: string) {
    // Sólo administración de esta clave efímera. Todas las aserciones usan JWT
    // reales. stdin y salida capturada impiden exponer material en argumentos/logs.
    try {
      execFileSync("docker",["exec","-i","supabase_db_vibe","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q"],
        {input,stdio:["pipe","pipe","pipe"]})
    } catch { throw new Error("No se pudo configurar la clave efímera de pruebas") }
  }
  beforeAll(async () => {
    ana = await crearUsuario(); users.push(ana)
    beto = await crearUsuario(); users.push(beto)
    const project = execFileSync("docker",["inspect","--format",'{{ index .Config.Labels "com.supabase.cli.project" }}',"supabase_db_vibe"],{encoding:"utf8"}).trim()
    if (project !== "vibe" || process.env.SUPABASE_TEST_URL !== "http://127.0.0.1:54421") throw new Error("Solo Vibe local")
    sql(`insert into private.media_runtime_keys(key_id,secret_hex) values('${keyId}','${secret}');`)
    provisioned = true
  })
  afterAll(async () => {
    await limpiarUsuarios(...users)
    if (provisioned) sql(`delete from private.media_runtime_keys where key_id='${keyId}';`)
  })
  async function user() { const value = await crearUsuario(); users.push(value); return value }
  function reservation(owner: UsuarioDePrueba, overrides: Partial<MediaReceipt> = {}): MediaReceipt {
    return { action: "reserve", actor: owner.id, key: claveDeMedio(owner,"images"), bytes: 100,
      contentType: "image/webp", profileId: owner.profileId, limitBytes: 1000, quotaMode: "rechazar", ...overrides }
  }
  const reserve = (owner: UsuarioDePrueba, receipt: MediaReceipt) => owner.supabase.rpc("reserve_media_upload",signMediaReceipt(receipt))
  const finalize = (owner: UsuarioDePrueba, receipt: MediaReceipt) => owner.supabase.rpc("finalize_media_upload",
    signMediaReceipt({ ...receipt, action: "finalize", etag: '"verified"' }))

  it("rechaza recibos falsificados, anónimos y el JWT de otro propietario", async () => {
    const receipt = reservation(ana)
    const proof = signMediaReceipt(receipt)
    expect((await ana.supabase.rpc("reserve_media_upload", { ...proof, p_payload: proof.p_payload.replace('"bytes":100','"bytes":1') })).error).toBeTruthy()
    expect((await beto.supabase.rpc("reserve_media_upload",proof)).error).toBeTruthy()
    expect((await clienteAnonimo().rpc("reserve_media_upload",proof)).error).toBeTruthy()
    expect((await ana.supabase.from("media_assets").select("key").eq("key",receipt.key)).data).toEqual([])
  })
  it("rechaza propósito incorrecto y recibos vencidos aunque su firma sea válida", async () => {
    const receipt = reservation(ana)
    expect((await ana.supabase.rpc("finalize_media_upload",signMediaReceipt(receipt))).error).toBeTruthy()
    const json = JSON.parse(signMediaReceipt(receipt).p_payload)
    json.issuedAt -= 120
    const p_payload = JSON.stringify(json)
    const p_signature = createHmac("sha256",Buffer.from(secret,"hex")).update(p_payload).digest("hex")
    expect((await ana.supabase.rpc("reserve_media_upload",{p_payload,p_signature})).error).toBeTruthy()
  })
  it("dos reservas simultáneas no pueden gastar el mismo espacio", async () => {
    const owner = await user()
    const requests = [reservation(owner,{bytes:700}),reservation(owner,{bytes:700})]
    const results = await Promise.all(requests.map(receipt => reserve(owner,receipt)))
    expect(results.filter(r => !r.error)).toHaveLength(1)
    expect(results.filter(r => r.error?.code === "PT413")).toHaveLength(1)
    expect((await owner.supabase.from("media_assets").select("key")).data).toHaveLength(1)
  })
  it("reintentar la misma reserva no cobra dos veces ni renueva su firma PUT", async () => {
    const owner = await user()
    const receipt = reservation(owner,{bytes:700})
    const first = await reserve(owner,receipt)
    const second = await reserve(owner,receipt)
    expect(first.error).toBeNull(); expect(second.error).toBeNull()
    expect(second.data.expiresAt).toBe(first.data.expiresAt)
    expect((await reserve(owner,reservation(owner,{bytes:300}))).error).toBeNull()
    expect((await reserve(owner,{...receipt,bytes:1})).error?.code).toBe("PT409")
  })
  it("la reserva no publica hasta verificar el objeto, y la finalización es idempotente", async () => {
    const owner = await user(); const receipt = reservation(owner)
    expect((await reserve(owner,receipt)).error).toBeNull()
    const patch = { avatar_url: `https://media.example/${receipt.key}` }
    expect((await owner.supabase.from("profiles").update(patch).eq("id",owner.profileId!)).error?.code).toBe("PT409")
    expect((await finalize(owner,{...receipt,bytes:101})).error?.code).toBe("PT409")
    expect((await finalize(owner,receipt)).data).toBe(true)
    expect((await finalize(owner,receipt)).data).toBe(true)
    expect((await owner.supabase.from("profiles").update(patch).eq("id",owner.profileId!)).error).toBeNull()
    expect((await owner.supabase.rpc("finalize_media_upload",signMediaReceipt({...receipt,action:"finalize",etag:'"changed"'}))).error?.code).toBe("PT409")
  })
  it("publicar una key al mismo tiempo que se reserva no deja un archivo pendiente publicado", async () => {
    const owner = await user()
    for (let attempt = 0; attempt < 5; attempt++) {
      const receipt = reservation(owner)
      const [reserved,published] = await Promise.all([
        reserve(owner,receipt),
        owner.supabase.from("profiles").update({avatar_url:`https://media.example/${receipt.key}`}).eq("id",owner.profileId!),
      ])
      expect([reserved,published].filter(r => !r.error)).toHaveLength(1)
      expect([reserved,published].filter(r => r.error?.code === "PT409")).toHaveLength(1)
      expect((await owner.supabase.from("profiles").update({avatar_url:null}).eq("id",owner.profileId!)).error).toBeNull()
    }
  })
  it("incluye inventario histórico, y un tamaño desconocido bloquea el modo estricto", async () => {
    const owner = await user()
    await prepararMedioHistorico({key:claveDeMedio(owner,"images"),owner_user_id:owner.id,
      folder:"images",content_type:"image/webp",bytes:900})
    expect((await reserve(owner,reservation(owner,{bytes:200}))).error?.code).toBe("PT413")
    expect((await reserve(owner,reservation(owner,{bytes:100}))).error).toBeNull()
    const unknown = await user()
    await prepararMedioHistorico({key:claveDeMedio(unknown,"images"),owner_user_id:unknown.id,
      folder:"images",content_type:"image/webp",bytes:null})
    expect((await reserve(unknown,reservation(unknown))).error?.code).toBe("PT413")
  })
  it("una retirada requiere reclamación y recibo del servidor antes de liberar cuota", async () => {
    const owner = await user(); const receipt = reservation(owner,{bytes:900})
    expect((await reserve(owner,receipt)).error).toBeNull()
    const proof = signMediaReceipt({...receipt,action:"retire",bytes:0,etag:'"empty"'})
    expect((await owner.supabase.rpc("retire_media_upload",proof)).error?.code).toBe("PT409")
    expect((await owner.supabase.rpc("claim_media_deletion",{p_key:receipt.key})).data).toBe(true)
    expect((await reserve(owner,reservation(owner,{bytes:200}))).error?.code).toBe("PT413")
    expect((await owner.supabase.rpc("retire_media_upload",proof)).data).toBe(true)
    expect((await owner.supabase.rpc("retire_media_upload",proof)).data).toBe(true)
    expect((await owner.supabase.from("media_assets").select("bytes").eq("key",receipt.key).single()).data?.bytes).toBe(0)
    expect((await finalize(owner,receipt)).error?.code).toBe("PT409")
    expect((await reserve(owner,receipt)).error?.code).toBe("PT409")
    expect((await reserve(owner,reservation(owner,{bytes:1000}))).error).toBeNull()
  })
  it("borrar inventario histórico a la vez que se reserva no libera cuota", async () => {
    const owner = await user()
    const key = claveDeMedio(owner, "images")
    await prepararMedioHistorico({key,owner_user_id:owner.id,folder:"images",bytes:900})
    const receipt = reservation(owner,{bytes:200})
    const [removed,reserved] = await Promise.all([
      owner.supabase.from("media_assets").delete().eq("key",key),
      reserve(owner,receipt),
    ])
    expect(removed.error?.code).toBe("42501")
    expect(reserved.error?.code).toBe("PT413")
    expect((await owner.supabase.from("media_assets").select("bytes").eq("key",key).single()).data?.bytes).toBe(900)
    expect((await owner.supabase.from("media_assets").select("key").eq("key",receipt.key)).data).toEqual([])
  })
  it("el cliente no puede borrar ni alterar el inventario de una reserva", async () => {
    const owner = await user(); const receipt = reservation(owner,{bytes:900})
    expect((await reserve(owner,receipt)).error).toBeNull()
    const inventory = () => owner.supabase.from("media_assets").select("*").eq("key",receipt.key).single()
    const before = await inventory()
    expect(before.error).toBeNull()
    expect(before.data).toMatchObject({ bytes: 900, content_type: "image/webp", owner_user_id: owner.id })
    expect((await owner.supabase.from("media_assets").delete().eq("key",receipt.key)).error?.code).toBe("42501")
    expect(await inventory()).toMatchObject({ error: null, data: before.data })
    // 0035 retira también el privilegio UPDATE: ya no basta un éxito con cero
    // filas. Se exige denegación explícita y se verifica el estado persistido.
    for (const patch of [{ bytes: 1 }, { content_type: "image/png" }]) {
      const updated = await owner.supabase.from("media_assets").update(patch).eq("key",receipt.key).select("*")
      expect(updated.error?.code).toBe("42501")
      expect(await inventory()).toMatchObject({ error: null, data: before.data })
    }
    expect((await reserve(owner,reservation(owner,{bytes:200}))).error?.code).toBe("PT413")
    expect((await owner.supabase.rpc("claim_media_deletion",{p_key:receipt.key})).data).toBe(true)
    expect((await finalize(owner,receipt)).error?.code).toBe("PT409")
  })
  it("retira un archivo histórico atribuido solo tras reclamarlo y conserva el marcador", async () => {
    const owner = await user(); const receipt = reservation(owner,{bytes:900})
    await prepararMedioHistorico({ key: receipt.key, owner_user_id: owner.id,
      folder: "images", content_type: "image/webp", bytes: 900 })
    const proof = signMediaReceipt({ ...receipt, action: "retire", bytes: 0, etag: '"empty"' })
    expect((await owner.supabase.rpc("retire_media_upload",proof)).error?.code).toBe("PT409")
    expect((await owner.supabase.rpc("claim_media_deletion",{ p_key: receipt.key })).data).toBe(true)
    expect((await owner.supabase.rpc("retire_media_upload",proof)).data).toBe(true)
    expect((await owner.supabase.rpc("retire_media_upload",proof)).data).toBe(true)
    expect((await owner.supabase.from("media_assets").select("bytes,owner_user_id").eq("key",receipt.key).single()).data)
      .toEqual({ bytes: 0, owner_user_id: owner.id })
    expect((await reserve(owner,receipt)).error?.code).toBe("PT409")
    expect((await reserve(owner,reservation(owner,{bytes:1000}))).error).toBeNull()
    expect((await owner.supabase.from("profiles").update({avatar_url:`https://media.example/${receipt.key}`}).eq("id",owner.profileId!)).error?.code).toBe("PT409")
  })
  it("un recibo firmado no permite retirar inventario ajeno o ausente", async () => {
    const owner = await user(); const stranger = await user(); const receipt = reservation(owner)
    expect((await reserve(owner,receipt)).error).toBeNull()
    expect((await owner.supabase.rpc("claim_media_deletion",{ p_key: receipt.key })).data).toBe(true)
    const wrongActor = signMediaReceipt({ ...receipt, actor: stranger.id, action: "retire", bytes: 0, etag: '"empty"' })
    expect((await stranger.supabase.rpc("retire_media_upload",wrongActor)).error?.code).toBe("PT409")
    const absent = signMediaReceipt({ ...reservation(owner), action: "retire", bytes: 0, etag: '"empty"' })
    expect((await owner.supabase.rpc("retire_media_upload",absent)).error?.code).toBe("PT409")
    expect((await owner.supabase.from("media_assets").select("bytes").eq("key",receipt.key).single()).data?.bytes).toBe(100)
  })
  it("finalizar tiene cupo independiente, compartido y limitado por usuario", async () => {
    const owner = await user()
    for (let i = 0; i < 360; i++) {
      const result = await owner.supabase.rpc("consume_authenticated_rate_limit",{ p_bucket: "upload-finalize" })
      expect(result.error).toBeNull()
      expect(result.data[0].is_allowed).toBe(true)
    }
    expect((await owner.supabase.rpc("consume_authenticated_rate_limit",{ p_bucket: "upload-finalize" })).data[0].is_allowed).toBe(false)
    expect((await owner.supabase.rpc("consume_authenticated_rate_limit",{ p_bucket: "upload" })).data[0].is_allowed).toBe(true)
  })
  it("la congelación impide reservar y finalizar; el propietario puede reintentarla", async () => {
    const owner = await user(); const receipt = reservation(owner)
    expect((await reserve(owner,receipt)).error).toBeNull()
    expect((await owner.supabase.rpc("begin_media_account_closure")).data).toBe(true)
    expect((await owner.supabase.rpc("begin_media_account_closure")).data).toBe(true)
    expect((await reserve(owner,reservation(owner))).error?.code).toBe("PT409")
    expect((await finalize(owner,receipt)).error?.code).toBe("PT409")
    expect((await clienteAnonimo().rpc("begin_media_account_closure")).error).toBeTruthy()
  })
  it("una finalización concurrente al cierre no queda abierta después del cierre", async () => {
    const owner = await user(); const receipt = reservation(owner)
    expect((await reserve(owner,receipt)).error).toBeNull()
    const [finished,closed] = await Promise.all([finalize(owner,receipt),owner.supabase.rpc("begin_media_account_closure")])
    expect(closed.data).toBe(true)
    expect(finished.error === null || finished.error.code === "PT409").toBe(true)
    expect((await finalize(owner,receipt)).error?.code).toBe("PT409")
  })
  it("no cambia de dueño ni se asocia a un perfil ajeno aunque el servidor firme mal", async () => {
    expect((await reserve(ana,reservation(ana,{key:claveDeMedio(beto,"images")}))).error).toBeTruthy()
    expect((await reserve(ana,reservation(ana,{profileId:beto.profileId}))).error).toBeTruthy()
  })
  it("observar conserva su semántica, pero suma las reservas al medir el exceso", async () => {
    const owner = await user()
    const a = await reserve(owner,reservation(owner,{bytes:700,quotaMode:"observar"}))
    const b = await reserve(owner,reservation(owner,{bytes:700,quotaMode:"observar"}))
    expect(a.error).toBeNull(); expect(a.data.exceeded).toBe(false)
    expect(b.error).toBeNull(); expect(b.data.exceeded).toBe(true)
    expect(b.data.usedBytes).toBe(700)
  })
})
