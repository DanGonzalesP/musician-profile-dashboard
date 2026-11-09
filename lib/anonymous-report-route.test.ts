import { beforeEach, expect, it, vi } from "vitest"
const { submit } = vi.hoisted(() => ({ submit: vi.fn() }))
vi.mock("./anonymous-report",()=>({submitAnonymousReport:submit}))
import { POST } from "../app/api/reportes/route"
const report={reportedProfileId:"12345678-1234-4123-8123-123456789012",targetType:"perfil",reason:"otro",details:"Contenido ficticio reportado"}
const request=(body:unknown)=>new Request("https://example.test/api/reportes",{method:"POST",body:JSON.stringify(body)})
beforeEach(()=>vi.resetAllMocks())
it("rechaza el cuerpo sobredimensionado sin acceder a la base",async()=>{
 expect((await POST(request({details:"a".repeat(17000)}))).status).toBe(413)
 expect(submit).not.toHaveBeenCalled()
})
it("rechaza campos administrativos y el juramento ausente",async()=>{
 expect((await POST(request({...report,status:"aceptado"}))).status).toBe(400)
 expect((await POST(request({...report,reason:"derechos_de_autor"}))).status).toBe(400)
 expect(submit).not.toHaveBeenCalled()
})
it("normaliza y entrega únicamente campos válidos",async()=>{
 submit.mockResolvedValue("accepted")
 const response=await POST(request({...report,details:"  Contenido ficticio reportado  ",reporterEmail:""}))
 expect(response.status).toBe(201)
 expect(response.headers.get("cache-control")).toBe("no-store")
 expect(submit.mock.calls[0][1]).toEqual({...report,swornStatement:false})
})
it("el cupo agotado responde 429",async()=>{
 submit.mockResolvedValue({ retryAfter: 86400 })
 const response=await POST(request(report))
 expect(response.status).toBe(429)
 expect(response.headers.get("retry-after")).toBe("86400")
})
it("un proveedor no disponible no se presenta como reporte recibido",async()=>{
 submit.mockResolvedValue("unavailable")
 expect((await POST(request(report))).status).toBe(503)
})
it("rechaza JSON inválido",async()=>{
 expect((await POST(new Request("https://example.test/api/reportes",{method:"POST",body:"{"}))).status).toBe(400)
 expect(submit).not.toHaveBeenCalled()
})
