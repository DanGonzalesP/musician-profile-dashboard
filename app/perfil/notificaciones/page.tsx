"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PROFILE_ID } from "@/lib/blocks";
import { fetchIncomingCreditRequests, resolveCreditRequest, type CreditRequest } from "@/lib/credit-requests";
import { fetchIncomingQuestions, markQuestionRead, type ProfileQuestion } from "@/lib/profile-questions";
import LayoutAdmin from "@/components/LayoutAdmin";
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
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function cargarSolicitudes() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.push("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        setErrorMessage(profileError.message);
        setLoading(false);
        return;
      }

      const profileId = profile?.id ?? PROFILE_ID;

      try {
        const [foundRequests, foundQuestions] = await Promise.all([
          fetchIncomingCreditRequests(profileId),
          fetchIncomingQuestions(profileId),
        ]);
        setRequests(foundRequests);
        setQuestions(foundQuestions);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "No se pudieron cargar las notificaciones.");
      } finally {
        setLoading(false);
      }
    }
    cargarSolicitudes();
  }, [router]);

  const handleDecision = async (requestId: string, decision: "accepted" | "rejected") => {
    setResolvingId(requestId);
    setErrorMessage("");
    try {
      await resolveCreditRequest(requestId, decision);
      setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: decision } : r)));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo procesar la solicitud.");
    } finally {
      setResolvingId(null);
    }
  };

  const handleMarkRead = async (questionId: string) => {
    try {
      await markQuestionRead(questionId);
      setQuestions((prev) => prev.map((q) => (q.id === questionId ? { ...q, status: "read" } : q)));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo marcar la pregunta como leída.");
    }
  };

  if (loading) {
    return (
      <LayoutAdmin>
        <div className="flex items-center justify-center p-12 text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </LayoutAdmin>
    );
  }

  const pendientes = requests.filter((r) => r.status === "pending");
  const resueltas = requests.filter((r) => r.status !== "pending");
  const preguntasSinLeer = questions.filter((q) => q.status === "unread");

  return (
    <LayoutAdmin>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <header className="border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-bold text-white">Notificaciones</h1>
          <p className="text-zinc-400 text-xs mt-1">
            Solicitudes de crédito de otros artistas y preguntas de visitantes sobre tu perfil.
          </p>
        </header>

        {errorMessage && (
          <div className="p-4 rounded-md border bg-red-500/10 border-red-500/20 text-red-400 text-sm">{errorMessage}</div>
        )}

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Preguntas de visitantes ({preguntasSinLeer.length} sin leer)
          </h2>
          {questions.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8 bg-zinc-950 rounded-xl border border-zinc-800">
              Nadie te ha preguntado nada todavía.
            </p>
          ) : (
            <div className="space-y-3">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className={`flex flex-col sm:flex-row sm:items-start justify-between gap-3 rounded-xl border p-4 ${
                    q.status === "unread" ? "border-amber-500/30 bg-amber-500/5" : "border-zinc-800 bg-zinc-950"
                  }`}
                >
                  <div className="min-w-0 flex items-start gap-2.5">
                    <HelpCircle className="size-4 shrink-0 mt-0.5 text-amber-400" />
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-400">
                        <span className="font-medium text-amber-400">{q.askerDisplayName}</span> preguntó sobre{" "}
                        <span className="font-medium text-white">{q.blockLabel}</span>
                      </p>
                      <p className="text-sm text-white mt-1 whitespace-pre-wrap break-words">{q.message}</p>
                    </div>
                  </div>
                  {q.status === "unread" && (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(q.id)}
                      className="shrink-0 flex items-center gap-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold px-3 py-2 transition-colors"
                    >
                      <Check className="size-3.5" /> Marcar leída
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Solicitudes de crédito pendientes ({pendientes.length})
          </h2>
          {pendientes.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8 bg-zinc-950 rounded-xl border border-zinc-800">
              No tienes solicitudes de crédito pendientes.
            </p>
          ) : (
            <div className="space-y-3">
              {pendientes.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{r.songTitle}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      <span className="font-medium text-amber-400">{r.requesterDisplayName}</span> quiere aparecer como{" "}
                      <span className="font-medium">{ROLE_LABELS[r.role] ?? r.role}</span> en esta canción
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={resolvingId === r.id}
                      onClick={() => handleDecision(r.id, "accepted")}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 text-xs font-bold px-3 py-2 transition-colors disabled:opacity-50"
                    >
                      <Check className="size-3.5" /> Aceptar
                    </button>
                    <button
                      type="button"
                      disabled={resolvingId === r.id}
                      onClick={() => handleDecision(r.id, "rejected")}
                      className="flex items-center gap-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/40 border border-zinc-800 hover:border-red-900/40 text-zinc-300 hover:text-red-300 text-xs font-bold px-3 py-2 transition-colors disabled:opacity-50"
                    >
                      <XIcon className="size-3.5" /> Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {resueltas.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Resueltas</h2>
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400 text-xs font-semibold uppercase">
                    <th className="p-4">Canción</th>
                    <th className="p-4">Solicitante</th>
                    <th className="p-4">Rol</th>
                    <th className="p-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {resueltas.map((r) => (
                    <tr key={r.id} className="hover:bg-zinc-900/30 transition-colors">
                      <td className="p-4 font-medium text-white">{r.songTitle}</td>
                      <td className="p-4 text-zinc-300">{r.requesterDisplayName}</td>
                      <td className="p-4 text-zinc-400 text-xs">{ROLE_LABELS[r.role] ?? r.role}</td>
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
      </div>
    </LayoutAdmin>
  );
}
