"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CREDIT_REQUESTS_PAGE_SIZE, fetchIncomingCreditRequests, resolveCreditRequest, type CreditRequest } from "@/lib/credit-requests";
import { fetchIncomingQuestions, INCOMING_QUESTIONS_PAGE_SIZE, markQuestionRead, type ProfileQuestion } from "@/lib/profile-questions";
import type { CursorFeed } from "@/lib/feed/keyset";
import { NOTIFICATIONS_CHANGED } from "@/lib/use-notification-count";
import LayoutAdmin from "@/components/LayoutAdmin";
import { ModerationNotice } from "@/components/moderation-notice";
import { SentProfileQuestions } from "@/components/sent-profile-questions";
import { SentCreditRequests } from "@/components/sent-credit-requests";
import { Loader2, Check, HelpCircle, X as XIcon } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  A: "Autor (Letra)",
  C: "Compositor (Música)",
  P: "Producción Musical",
  R: "Arreglista",
  M: "Músico de Sesión",
  V: "Vocalista",
  I: "Intérprete",
};

export default function NotificacionesPage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [questions, setQuestions] = useState<ProfileQuestion[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [requiresReload, setRequiresReload] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [hasOlderQuestions, setHasOlderQuestions] = useState(false);
  const [loadingOlderQuestions, setLoadingOlderQuestions] = useState(false);
  const [olderQuestionsFailed, setOlderQuestionsFailed] = useState(false);
  const questionCursor = useRef<CursorFeed | null>(null);
  const creditCursor = useRef<CursorFeed | null>(null);
  const [hasOlderCredits, setHasOlderCredits] = useState(false);
  const [loadingOlderCredits, setLoadingOlderCredits] = useState(false);
  const [olderCreditsFailed, setOlderCreditsFailed] = useState(false);
  const inboxProfileId = useRef<string | null>(null);
  const inboxOwnerId = useRef<string | null>(null);
  const actionInProgress = useRef(false);
  const sessionVersion = useRef(0);
  const router = useRouter();

  useEffect(() => {
    let previousUserId: string | null | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null;
      if (userId === previousUserId) return;
      previousUserId = userId;
      sessionVersion.current += 1;
      actionInProgress.current = false;
      setRequests([]); setQuestions([]);
      setResolvingId(null); setMarkingReadId(null);
      setErrorMessage(""); setSuccessMessage("");
      setLoadFailed(false); setRequiresReload(false);
      setSearch(""); setPendingOnly(false);
      questionCursor.current = null; inboxProfileId.current = null; inboxOwnerId.current = null;
      creditCursor.current = null;
      setHasOlderCredits(false); setLoadingOlderCredits(false); setOlderCreditsFailed(false);
      setHasOlderQuestions(false); setLoadingOlderQuestions(false); setOlderQuestionsFailed(false);
      setLoading(true);
      setRetryCount(count => count + 1);
    });
    return () => { sessionVersion.current += 1; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    const version = sessionVersion.current;
    async function cargarSolicitudes() {
      try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!active || version !== sessionVersion.current) return;
      if (authError) throw authError;
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: auth, error: sessionError } = await supabase.auth.getSession();
      if (!active || version !== sessionVersion.current) return;
      if (sessionError || !auth.session || auth.session.user.id !== user.id) throw new Error("Sesión no disponible");
      const token = auth.session.access_token;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .eq("profile_type", "artist")
        .maybeSingle()
        .setHeader("Authorization", `Bearer ${token}`);

      if (profileError) throw profileError;

      // Sin fila de perfil no se sigue: antes se caía al perfil semilla
      // PROFILE_ID, un buzón compartido entre cuentas (ver AUDITORIA.md 9).
      if (!profile) {
        throw new Error("Perfil no disponible");
      }
      const profileId = profile.id;
      if (!active || version !== sessionVersion.current) return;

        const [foundRequests, foundQuestions] = await Promise.all([
          fetchIncomingCreditRequests(profileId, null, token),
          fetchIncomingQuestions(profileId, null, token),
        ]);
        if (!active || version !== sessionVersion.current) return;
        setRequests(foundRequests);
        const lastCredit = foundRequests.at(-1);
        creditCursor.current = lastCredit ? { id: lastCredit.id, createdAt: lastCredit.createdAt } : null;
        setHasOlderCredits(foundRequests.length === CREDIT_REQUESTS_PAGE_SIZE);
        setOlderCreditsFailed(false);
        setQuestions(foundQuestions);
        inboxProfileId.current = profileId;
        inboxOwnerId.current = user.id;
        const lastQuestion = foundQuestions.at(-1);
        questionCursor.current = lastQuestion ? { id: lastQuestion.id, createdAt: lastQuestion.createdAt } : null;
        setHasOlderQuestions(foundQuestions.length === INCOMING_QUESTIONS_PAGE_SIZE);
        setOlderQuestionsFailed(false);
        setLoadFailed(false);
        setRequiresReload(false);
        window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      } catch {
        if (!active || version !== sessionVersion.current) return;
        setErrorMessage("No se pudieron cargar las notificaciones. Comprueba tu conexión e inténtalo de nuevo.");
        setLoadFailed(true);
      } finally {
        if (active && version === sessionVersion.current) setLoading(false);
      }
    }
    void cargarSolicitudes();
    return () => { active = false; };
  }, [router, retryCount]);

  async function captureInbox(version: number) {
    const profileId = inboxProfileId.current;
    const ownerId = inboxOwnerId.current;
    if (!profileId || !ownerId) throw new Error("Buzón no disponible");
    const { data, error } = await supabase.auth.getSession();
    if (version !== sessionVersion.current || profileId !== inboxProfileId.current ||
        ownerId !== inboxOwnerId.current || error || !data.session || data.session.user.id !== ownerId) {
      throw new Error("Sesión no disponible");
    }
    return { profileId, accessToken: data.session.access_token };
  }

  async function loadOlderQuestions() {
    const profileId = inboxProfileId.current;
    const cursor = questionCursor.current;
    if (actionInProgress.current || loading || loadFailed || requiresReload || !hasOlderQuestions || !profileId || !cursor) return;
    actionInProgress.current = true;
    const version = sessionVersion.current;
    setLoadingOlderQuestions(true);
    setOlderQuestionsFailed(false);
    try {
      const inbox = await captureInbox(version);
      if (version !== sessionVersion.current) return;
      const older = await fetchIncomingQuestions(inbox.profileId, cursor, inbox.accessToken);
      if (version !== sessionVersion.current) return;
      setQuestions(previous => {
        const existing = new Set(previous.map(question => question.id));
        return [...previous, ...older.filter(question => !existing.has(question.id))];
      });
      const last = older.at(-1);
      if (last) questionCursor.current = { id: last.id, createdAt: last.createdAt };
      setHasOlderQuestions(older.length === INCOMING_QUESTIONS_PAGE_SIZE);
    } catch {
      if (version === sessionVersion.current) setOlderQuestionsFailed(true);
    } finally {
      if (version === sessionVersion.current) {
        actionInProgress.current = false;
        setLoadingOlderQuestions(false);
      }
    }
  }

  async function loadOlderCredits() {
    const profileId = inboxProfileId.current;
    const cursor = creditCursor.current;
    if (actionInProgress.current || loading || loadFailed || requiresReload || !hasOlderCredits || !profileId || !cursor) return;
    actionInProgress.current = true;
    const version = sessionVersion.current;
    setLoadingOlderCredits(true);
    setOlderCreditsFailed(false);
    try {
      const inbox = await captureInbox(version);
      if (version !== sessionVersion.current) return;
      const older = await fetchIncomingCreditRequests(inbox.profileId, cursor, inbox.accessToken);
      if (version !== sessionVersion.current) return;
      setRequests(previous => {
        const existing = new Set(previous.map(request => request.id));
        return [...previous, ...older.filter(request => !existing.has(request.id))];
      });
      const last = older.at(-1);
      if (last) creditCursor.current = { id: last.id, createdAt: last.createdAt };
      setHasOlderCredits(older.length === CREDIT_REQUESTS_PAGE_SIZE);
    } catch {
      if (version === sessionVersion.current) setOlderCreditsFailed(true);
    } finally {
      if (version === sessionVersion.current) {
        actionInProgress.current = false;
        setLoadingOlderCredits(false);
      }
    }
  }

  const handleDecision = async (requestId: string, decision: "accepted" | "rejected") => {
    if (actionInProgress.current || requiresReload || loadFailed || loading) return;
    if (!requests.some(request => request.id === requestId && request.status === "pending")) return;
    actionInProgress.current = true;
    const version = sessionVersion.current;
    setResolvingId(requestId);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const inbox = await captureInbox(version);
      if (version !== sessionVersion.current) return;
      await resolveCreditRequest(requestId, decision, inbox);
      if (version !== sessionVersion.current) return;
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: decision } : r)));
      setSuccessMessage(decision === "accepted" ? "Solicitud aceptada." : "Solicitud rechazada.");
    } catch {
      if (version !== sessionVersion.current) return;
      setRequiresReload(true);
      setErrorMessage("No pudimos confirmar la decisión. Actualiza las notificaciones para conocer su estado antes de volver a decidir.");
    } finally {
      if (version === sessionVersion.current) {
        actionInProgress.current = false;
        setResolvingId(null);
      }
    }
  };

  const handleMarkRead = async (questionId: string) => {
    if (actionInProgress.current || requiresReload || loadFailed || loading) return;
    if (!questions.some(question => question.id === questionId && question.status === "unread")) return;
    actionInProgress.current = true;
    const version = sessionVersion.current;
    setMarkingReadId(questionId);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const inbox = await captureInbox(version);
      if (version !== sessionVersion.current) return;
      await markQuestionRead(questionId, inbox);
      if (version !== sessionVersion.current) return;
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      setQuestions((prev) => prev.map((q) => (q.id === questionId ? { ...q, status: "read" } : q)));
      setSuccessMessage("Pregunta marcada como leída.");
    } catch {
      if (version !== sessionVersion.current) return;
      setRequiresReload(true);
      setErrorMessage("No pudimos confirmar la lectura. Actualiza las notificaciones antes de repetir la acción.");
    } finally {
      if (version === sessionVersion.current) {
        actionInProgress.current = false;
        setMarkingReadId(null);
      }
    }
  };

  if (loading) {
    return (
      <LayoutAdmin>
        <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span>Cargando notificaciones…</span>
        </div>
      </LayoutAdmin>
    );
  }

  const query = search.trim().toLocaleLowerCase("es");
  const matches = (...values: string[]) => values.some(value => value.toLocaleLowerCase("es").includes(query));
  const filteredRequests = requests.filter(r => matches(r.songTitle, r.requesterDisplayName, ROLE_LABELS[r.role] ?? r.role));
  const filteredQuestions = questions.filter(q => (!pendingOnly || q.status === "unread") && matches(q.message, q.askerDisplayName, q.blockLabel));
  const pendientes = filteredRequests.filter((r) => r.status === "pending");
  const resueltas = pendingOnly ? [] : filteredRequests.filter((r) => r.status !== "pending");
  const preguntasSinLeer = questions.filter((q) => q.status === "unread");
  const actionsDisabled = requiresReload || resolvingId !== null || markingReadId !== null || loadingOlderQuestions || loadingOlderCredits;
  function reload() {
    if (actionInProgress.current) return;
    setErrorMessage(""); setSuccessMessage(""); setLoading(true); setRetryCount(count => count + 1);
  }

  return (
    <LayoutAdmin>
      <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
        <header className="border-b border-border pb-4">
          <h1 className="text-2xl font-bold text-foreground">Notificaciones</h1>
          <p className="text-muted-foreground text-xs mt-1">
            Solicitudes de crédito de otros artistas y preguntas de visitantes sobre tu perfil personal.
          </p>
        </header>
        <ModerationNotice refresh={retryCount} />
        <SentProfileQuestions />
        <SentCreditRequests />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            Buscar notificaciones
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Artista, canción o pregunta" className="min-h-11 rounded-lg border border-border bg-background px-3 text-foreground" />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={pendingOnly} onChange={event => setPendingOnly(event.target.checked)} />Solo pendientes</label>
          <button type="button" disabled={resolvingId !== null || markingReadId !== null || loadingOlderQuestions || loadingOlderCredits} onClick={reload} className="min-h-11 rounded-lg border border-border px-3 text-sm disabled:opacity-50">Actualizar</button>
          {(search || pendingOnly) && <button type="button" onClick={() => { setSearch(""); setPendingOnly(false); }} className="min-h-11 px-3 text-sm text-primary underline">Limpiar filtros</button>}
        </div>

        {errorMessage && (
          <div role="alert" className="p-4 rounded-md border bg-destructive/10 border-destructive/20 text-destructive text-sm">
            <p>{errorMessage}</p>
            {!loading && (loadFailed || requiresReload) && (
              <button
                type="button"
                onClick={reload}
                className="mt-3 rounded-lg border border-current px-3 py-1.5 text-xs font-bold hover:bg-destructive/10"
              >Reintentar carga</button>
            )}
          </div>
        )}
        {successMessage && <p role="status" aria-live="polite" className="text-sm text-emerald-600 dark:text-emerald-400">{successMessage}</p>}

        {!loadFailed && <>
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Preguntas de visitantes ({preguntasSinLeer.length} sin leer entre las cargadas)
          </h2>
          <p className="text-xs text-muted-foreground">La búsqueda y Solo pendientes se aplican a las preguntas cargadas. Actualiza para ver las nuevas.</p>
          {filteredQuestions.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8 bg-card rounded-xl border border-border">
              {questions.length === 0 ? "Nadie te ha preguntado nada todavía." : "No hay preguntas cargadas que coincidan con estos filtros."}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredQuestions.map((q) => (
                <div
                  key={q.id}
                  className={`flex flex-col sm:flex-row sm:items-start justify-between gap-3 rounded-xl border p-4 ${
                    q.status === "unread" ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <div className="min-w-0 flex items-start gap-2.5">
                    <HelpCircle aria-hidden="true" className="size-4 shrink-0 mt-0.5 text-primary" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {q.status === "unread" && <span className="mr-2 inline-flex rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">Nueva</span>}
                        <span className="font-semibold text-foreground">{q.askerDisplayName}</span> preguntó sobre{" "}
                        <span className="font-medium text-foreground">{q.blockLabel}</span>
                      </p>
                      <p className="text-sm text-foreground mt-1 whitespace-pre-wrap wrap-break-word">{q.message}</p>
                      <time dateTime={q.createdAt} className="mt-2 block text-xs text-muted-foreground">{new Date(q.createdAt).toLocaleString("es-PE")}</time>
                    </div>
                  </div>
                  {q.status === "unread" && (
                    <button
                      type="button"
                      disabled={actionsDisabled}
                      onClick={() => handleMarkRead(q.id)}
                      className="shrink-0 flex items-center gap-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-secondary-foreground text-xs font-bold px-3 py-2 transition-colors disabled:opacity-50"
                    >
                      {markingReadId === q.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      {markingReadId === q.id ? "Marcando…" : "Marcar leída"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p role="status" className="text-xs text-muted-foreground">{loadingOlderQuestions ? "Cargando preguntas anteriores…" : `${questions.length} preguntas cargadas${hasOlderQuestions ? "; puedes cargar las anteriores." : "."}`}</p>
          {olderQuestionsFailed && <p role="alert" className="text-sm text-destructive">No se pudieron cargar las preguntas anteriores. Conservamos las que ya tienes; vuelve a intentarlo.</p>}
          {hasOlderQuestions && <button type="button" disabled={actionsDisabled} onClick={() => void loadOlderQuestions()} className="min-h-11 rounded-lg border border-border px-3 text-sm disabled:opacity-50">
            {loadingOlderQuestions ? "Cargando anteriores…" : olderQuestionsFailed ? "Reintentar preguntas anteriores" : "Cargar preguntas anteriores"}
          </button>}
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Solicitudes de crédito pendientes entre las cargadas ({pendientes.length})
          </h2>
          <p className="text-xs text-muted-foreground">La búsqueda se aplica a las solicitudes cargadas. Carga las anteriores para consultar más pendientes y decisiones.</p>
          {pendientes.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8 bg-card rounded-xl border border-border">
              {query ? "No hay solicitudes pendientes cargadas que coincidan con tu búsqueda." : "No hay solicitudes de crédito pendientes entre las cargadas."}
            </p>
          ) : (
            <div className="space-y-3">
              {pendientes.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{r.songTitle}</p>
                    <time dateTime={r.createdAt} className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("es-PE")}</time>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-semibold text-foreground">{r.requesterDisplayName}</span> quiere aparecer como{" "}
                      <span className="font-medium">{ROLE_LABELS[r.role] ?? r.role}</span> en esta canción
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={actionsDisabled}
                      onClick={() => handleDecision(r.id, "accepted")}
                      className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {resolvingId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      {resolvingId === r.id ? "Procesando…" : "Aceptar"}
                    </button>
                    <button
                      type="button"
                      disabled={actionsDisabled}
                      onClick={() => handleDecision(r.id, "rejected")}
                      className="flex min-h-11 items-center gap-1.5 rounded-lg bg-secondary hover:bg-destructive/10 border border-border hover:border-destructive/40 text-foreground hover:text-destructive text-xs font-bold px-3 py-2 transition-colors disabled:opacity-50"
                    >
                      {resolvingId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <XIcon className="size-3.5" />}
                      {resolvingId === r.id ? "Procesando…" : "Rechazar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-2">
          <p role="status" className="text-xs text-muted-foreground">{loadingOlderCredits ? "Cargando solicitudes anteriores…" : `${requests.length} solicitudes cargadas${hasOlderCredits ? "; puedes consultar las anteriores." : "."}`}</p>
          {olderCreditsFailed && <p role="alert" className="text-sm text-destructive">No se pudieron cargar las solicitudes anteriores. Conservamos las ya cargadas.</p>}
          {hasOlderCredits && <button type="button" disabled={actionsDisabled} onClick={() => void loadOlderCredits()} className="min-h-11 rounded-lg border border-border px-3 text-sm disabled:opacity-50">
            {loadingOlderCredits ? "Cargando anteriores…" : olderCreditsFailed ? "Reintentar solicitudes anteriores" : "Cargar solicitudes anteriores"}
          </button>}
        </div>

        {resueltas.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Resueltas</h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-muted-foreground text-xs font-semibold uppercase">
                    <th className="p-4">Canción</th>
                    <th className="p-4">Solicitante</th>
                    <th className="p-4">Rol</th>
                    <th className="p-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {resueltas.map((r) => (
                    <tr key={r.id} className="hover:bg-accent/30 transition-colors">
                      <td className="p-4 font-medium text-foreground">{r.songTitle}</td>
                      <td className="p-4 text-foreground">{r.requesterDisplayName}</td>
                      <td className="p-4 text-muted-foreground text-xs">{ROLE_LABELS[r.role] ?? r.role}</td>
                      <td className="p-4">
                        <span
                          className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded border ${
                            r.status === "accepted"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                          }`}
                        >
                          {r.status === "accepted" ? "Aceptado" : "Rechazado"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        </>}
      </div>
    </LayoutAdmin>
  );
}
