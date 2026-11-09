"use client"

import { useEffect, useState } from "react"

/** Mount once per edited item; no drafts are persisted to shared browser storage. */
export function useUnsavedForm(value: unknown, pending: boolean, busy: boolean) {
  const [initialValue] = useState(() => JSON.stringify(value))
  const dirty = pending || JSON.stringify(value) !== initialValue

  useEffect(() => {
    if (!dirty && !busy) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty, busy])

  function canDiscard() {
    if (busy) return false
    return !dirty || window.confirm("Hay cambios sin guardar. ¿Descartarlos y cerrar el formulario?")
  }

  return { dirty, canDiscard }
}
