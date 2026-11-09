import { createHmac, randomBytes } from "node:crypto"
import { afterEach, expect, it, vi } from "vitest"
import { signMediaReceipt } from "./media-receipt"

afterEach(() => vi.useRealTimers())
it("firma el contenido exacto con actor, propósito y tiempo para Postgres", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-05T18:00:00Z"))
  const secret = randomBytes(32).toString("hex")
  const receipt = { action: "retire" as const, actor: "usuario", key: "audio/key.mp3", bytes: 0 }
  const signed = signMediaReceipt(receipt, secret)
  expect(JSON.parse(signed.p_payload)).toEqual({ ...receipt, version: 1, keyId: "runtime", issuedAt: 1793901600 })
  expect(signed.p_signature).toBe(createHmac("sha256", Buffer.from(secret,"hex")).update(signed.p_payload).digest("hex"))
  expect(signed.p_payload).not.toContain(secret)
  expect(signMediaReceipt({ ...receipt, actor: "otro" }, secret).p_signature).not.toBe(signed.p_signature)
  expect(signMediaReceipt({ ...receipt, action: "finalize" }, secret).p_signature).not.toBe(signed.p_signature)
})
it.each(["", "abc", "z".repeat(64)])("falla cerrado sin clave válida (%s)", key => {
  expect(() => signMediaReceipt({ action: "reserve", actor: "a", key: "b", bytes: 1 }, key)).toThrow("configurada")
})
