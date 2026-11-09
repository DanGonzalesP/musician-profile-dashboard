"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { fetchSentQuestions, SENT_QUESTIONS_PAGE_SIZE, type SentProfileQuestion } from "@/lib/profile-questions"
import type { CursorFeed } from "@/lib/feed/keyset"

export function SentProfileQuestions() {
  const [page, setPage] = useState(0)
  const [pageCursors, setPageCursors] = useState<(CursorFeed | null)[]>([null])
  const cursor = pageCursors[page] ?? null
  const [revision, setRevision] = useState(0)
  const [rows, setRows] = useState<SentProfileQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const generation = useRef(0)

  useEffect(() => {
    let previousUserId: string | null | undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null
      if (userId === previousUserId) return
      previousUserId = userId
      generation.current += 1
      setRows([])
      setLoading(true)
      setFailed(false)
      setPage(0)
      setPageCursors([null])
      setRevision(value => value + 1)
    })
    return () => { generation.current += 1; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    const currentGeneration = generation.current
    void fetchSentQuestions(cursor).then(result => {
      if (!active || currentGeneration !== generation.current) return
      setRows(result)
      setFailed(false)
      setLoading(false)
    }).catch(() => {
      if (!active || currentGeneration !== generation.current) return
      setRows([])
      setFailed(true)
      setLoading(false)
    })
    return () => { active = false }
  }, [cursor, revision])

  function navigate(next: number) {
    if (loading || next < 0 || next > page + 1) return
    if (next > page) {
      const last = rows.at(-1)
      if (failed || rows.length < SENT_QUESTIONS_PAGE_SIZE || !last) return
      setPageCursors(previous => [...previous.slice(0, next), { id: last.id, createdAt: last.createdAt }])
    } else if (next === 0) {
      setPageCursors([null])
    }
    generation.current += 1
    setLoading(true)
    setRows([])
    setFailed(false)
    setPage(next)
    setRevision(value => value + 1)
  }

  return (
    <section aria-labelledby="sent-questions-heading" className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sent-questions-heading" className="font-semibold">Preguntas que enviaste</h2>
        <button type="button" disabled={loading} onClick={() => navigate(0)} className="min-h-11 rounded-lg border border-border px-3 text-sm disabled:opacity-50">Actualizar enviadas</button>
      </div>
      <p className="text-xs text-muted-foreground">Consulta tus mensajes antes de repetir un envío. Que una pregunta esté marcada como leída no significa que haya recibido respuesta.</p>
      {loading ? <p role="status" className="text-sm">Cargando preguntas enviadas…</p> : failed ? (
        <div role="alert" className="text-sm text-destructive">
          <p>No se pudieron cargar tus preguntas enviadas. Esto no confirma si un envío anterior se guardó.</p>
          <button type="button" onClick={() => navigate(page)} className="mt-2 min-h-11 rounded-lg border border-current px-3">Reintentar</button>
        </div>
      ) : rows.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">{page === 0 ? "Todavía no aparecen preguntas enviadas por tu cuenta." : "No hay más preguntas en esta página."}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(question => (
            <li key={question.id} className="rounded-lg border border-border p-3">
              <p className="mb-2 text-sm">
                Para: {question.recipient?.username ? (
                  <Link href={`/${encodeURIComponent(question.recipient.username)}`} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">
                    {question.recipient.displayName} (@{question.recipient.username})
                  </Link>
                ) : question.recipient?.displayName ?? "Perfil no disponible"}
              </p>
              <p className="text-sm font-medium wrap-break-word">Sobre: {question.blockLabel}</p>
              <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm">{question.message}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <time dateTime={question.createdAt}>{new Date(question.createdAt).toLocaleString("es-PE")}</time>
                <span>{question.status === "read" ? "Marcada como leída" : "Sin marcar como leída"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Páginas de preguntas enviadas" className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" disabled={loading || page === 0} onClick={() => navigate(page - 1)} className="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50">Anterior</button>
        <span aria-live="polite">Página {page + 1}</span>
        <button type="button" disabled={loading || failed || rows.length < SENT_QUESTIONS_PAGE_SIZE} onClick={() => navigate(page + 1)} className="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50">Siguiente</button>
      </nav>
    </section>
  )
}
