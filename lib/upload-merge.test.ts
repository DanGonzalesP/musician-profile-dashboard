import { expect, it } from "vitest"
import { mergeUploadedUrls } from "./upload-merge"

it("no pierde edición, reordenación o archivos nuevos mientras una subida termina", () => {
  const before = [{ id: "a", title: "viejo", image: "blob:a" }, { id: "b", image: "blob:b" }]
  const uploaded = [{ id: "a", title: "viejo", image: "https://r2/a" }, { id: "b", image: "https://r2/b" }]
  const current = [{ id: "b", image: "blob:b" }, { id: "a", title: "nuevo", image: "blob:c" }]
  expect(mergeUploadedUrls(current, before, uploaded)).toEqual([{ id: "b", image: "https://r2/b" }, { id: "a", title: "nuevo", image: "blob:c" }])
  expect(current[0].image).toBe("blob:b")
})
it("no resucita bloques borrados durante la subida", () => {
  expect(mergeUploadedUrls([], [{ image: "blob:a" }], [{ image: "https://r2/a" }])).toEqual([])
})
