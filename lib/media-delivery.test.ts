import { describe, expect, it } from "vitest"
import { mediaRange, safeMediaType, validMediaKey } from "./media-delivery"

describe("rangos de reproducción", () => {
  it.each([
    [null, null], ["bytes=0-2", { start: 0, end: 2 }], ["bytes=7-", { start: 7, end: 9 }],
    ["bytes=-3", { start: 7, end: 9 }], ["bytes=0-99", { start: 0, end: 9 }],
    ["bytes=-99", { start: 0, end: 9 }], ["bytes=10-", false], ["bytes=3-2", false],
    ["bytes=-0", false], ["bytes=-", false], ["bytes=0-1,3-4", false],
    ["bytes=9007199254740993-", false], ["items=0-1", false],
  ])("%s", (header, result) => { expect(mediaRange(header as string | null, 10)).toEqual(result) })
})
it("sólo permite keys canónicas dentro de las carpetas de medios", () => {
  expect(validMediaKey("audio/owner/song.mp3")).toBe(true)
  for (const key of ["../audio/owner/song.mp3", "audio/../secret.png", "audio//song.mp3", "audio/a%2Fb.mp3", "other/test.png", "images/a.svg?x=1"]) {
    expect(validMediaKey(key)).toBe(false)
  }
})
it("preserva formatos aceptados al subir y rechaza contenido activo", () => {
  for (const type of ["audio/x-m4a", "audio/wave", "audio/x-flac", "audio/aiff", "image/png", "video/mp4"]) expect(safeMediaType(type)).toBe(true)
  for (const type of ["image/svg+xml", "text/html", "application/javascript", null]) expect(safeMediaType(type)).toBe(false)
})
