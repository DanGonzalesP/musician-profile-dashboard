import { describe, expect, it } from "vitest"
import { sessionIsDefinitelyInvalid } from "./auth-session-health"

describe("salud de la sesión guardada", () => {
  it("una cuenta borrada o una sesión revocada invalidan la sesión", () => {
    expect(sessionIsDefinitelyInvalid({ status: 403, code: "user_not_found" })).toBe(true)
    expect(sessionIsDefinitelyInvalid({ status: 403, code: "session_not_found" })).toBe(true)
    expect(sessionIsDefinitelyInvalid({ status: 401 })).toBe(true)
    expect(sessionIsDefinitelyInvalid({ code: "bad_jwt" })).toBe(true)
  })

  it("sin error, sin red, con 5xx o con 429 no se cierra la sesión", () => {
    expect(sessionIsDefinitelyInvalid(null)).toBe(false)
    expect(sessionIsDefinitelyInvalid({ name: "AuthRetryableFetchError", status: 0 })).toBe(false)
    expect(sessionIsDefinitelyInvalid({ status: 500 })).toBe(false)
    expect(sessionIsDefinitelyInvalid({ status: 503, code: "unexpected_failure" })).toBe(false)
    expect(sessionIsDefinitelyInvalid({ status: 429, code: "over_request_rate_limit" })).toBe(false)
  })
})
