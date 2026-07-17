"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LayoutAdmin from "@/components/LayoutAdmin";
import {
  createBand,
  fetchBandMembers,
  fetchMyPendingInvites,
  inviteMember,
  removeMember,
  respondToInvite,
  setActiveBandId,
  type BandMember,
  type PendingInvite,
} from "@/lib/bands";
import { Loader2, Plus, Trash2, Check, X as XIcon, Pencil, Sparkles, Users } from "lucide-react";

type OwnedBand = { id: string; displayName: string };

const ROLE_LABELS: Record<"admin" | "editor", string> = {
  admin: "Administrador Total",
  editor: "Editor / Community Manager",
};

export default function BandaPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [ownedBands, setOwnedBands] = useState<OwnedBand[]>([]);
  const [membersByBand, setMembersByBand] = useState<Record<string, BandMember[]>>({});
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [newBandName, setNewBandName] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  async function reload(currentUserId: string) {
    const { data: bands, error: bandsError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("owner_user_id", currentUserId)
      .eq("profile_type", "band");

    if (bandsError) {
      setErrorMessage(bandsError.message);
      return;
    }

    const owned = (bands ?? []).map((b) => ({ id: b.id as string, displayName: (b.display_name as string) || "Banda sin nombre" }));
    setOwnedBands(owned);

    const membersEntries = await Promise.all(
      owned.map(async (b) => [b.id, await fetchBandMembers(b.id)] as const)
    );
    setMembersByBand(Object.fromEntries(membersEntries));

    setPendingInvites(await fetchMyPendingInvites(currentUserId));
  }

  useEffect(() => {
    async function init() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);
      try {
        await reload(user.id);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "No se pudo cargar la información de bandas.");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  const handleCreateBand = async () => {
    if (!userId || !newBandName.trim()) return;
    setCreating(true);
    setErrorMessage("");
    try {
      await createBand(userId, newBandName.trim());
      setNewBandName("");
      await reload(userId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo crear la banda.");
    } finally {
      setCreating(false);
    }
  };

  const handleInviteResponse = async (membershipId: string, decision: "accepted" | "declined") => {
    if (!userId) return;
    try {
      await respondToInvite(membershipId, decision);
      await reload(userId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo responder la invitación.");
    }
  };

  const handleEditBand = (bandId: string) => {
    if (!userId) return;
    setActiveBandId(userId, bandId);
    router.push("/dashboard");
  };

  if (loading) {
    return (
      <LayoutAdmin>
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </LayoutAdmin>
    );
  }

  return (
    <LayoutAdmin>
      <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-8">
        <header className="gradient-border relative rounded-2xl bg-card/40 p-6 sm:p-8">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="size-3.5" />
            Página de empresa
          </span>
          <h1 className="mt-3 font-display text-2xl font-bold text-foreground sm:text-3xl">Tus bandas</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Como una página de negocio: varios integrantes, un solo perfil, gestionado en equipo. Crea la página
            de tu banda, invita a tus compañeros con un rol y edítenla juntos desde el mismo editor de bloques.
          </p>
        </header>

        {errorMessage && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {pendingInvites.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Invitaciones recibidas ({pendingInvites.length})
            </h2>
            <div className="space-y-3">
              {pendingInvites.map((inv) => (
                <div
                  key={inv.membershipId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-card/60 p-4"
                >
                  <p className="text-sm text-foreground/90">
                    <span className="font-semibold text-foreground">{inv.bandDisplayName}</span> te invitó como{" "}
                    <span className="font-medium text-primary">{ROLE_LABELS[inv.role]}</span>
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleInviteResponse(inv.membershipId, "accepted")}
                      className="flex items-center gap-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold px-3 py-2 transition-opacity"
                    >
                      <Check className="size-3.5" /> Aceptar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInviteResponse(inv.membershipId, "declined")}
                      className="flex items-center gap-1.5 rounded-lg bg-card hover:bg-destructive/10 border border-border text-muted-foreground hover:text-destructive text-xs font-bold px-3 py-2 transition-colors"
                    >
                      <XIcon className="size-3.5" /> Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Crear página de banda</h2>
          <div className="gradient-border rounded-xl bg-card/40 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newBandName}
                onChange={(e) => setNewBandName(e.target.value)}
                placeholder="Nombre de la banda o proyecto"
                className="flex-1 rounded-lg border border-input bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                disabled={creating || !newBandName.trim()}
                onClick={handleCreateBand}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold px-4 py-2.5 transition-opacity disabled:opacity-50"
              >
                <Plus className="size-3.5" /> {creating ? "Creando..." : "Crear página de banda"}
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Tus bandas ({ownedBands.length})
          </h2>
          {ownedBands.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-10 bg-card/40 rounded-xl border border-dashed border-border">
              Todavía no creaste ninguna página de banda.
            </p>
          ) : (
            <div className="space-y-4">
              {ownedBands.map((band) => (
                <BandCard
                  key={band.id}
                  band={band}
                  members={membersByBand[band.id] ?? []}
                  onEdit={() => handleEditBand(band.id)}
                  onChanged={() => userId && reload(userId)}
                  onError={setErrorMessage}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </LayoutAdmin>
  );
}

function BandCard({
  band,
  members,
  onEdit,
  onChanged,
  onError,
}: {
  band: OwnedBand;
  members: BandMember[];
  onEdit: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"admin" | "editor">("editor");
  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    if (!username.trim()) return;
    setInviting(true);
    try {
      await inviteMember(band.id, username, role);
      setUsername("");
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo enviar la invitación.");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (membershipId: string) => {
    try {
      await removeMember(membershipId);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo quitar al miembro.");
    }
  };

  const activeCount = members.filter((m) => m.status === "accepted").length;

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/25 via-card to-background text-primary">
            <Users className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-bold text-foreground">{band.displayName}</h3>
            <p className="text-xs text-muted-foreground">
              {activeCount} {activeCount === 1 ? "integrante activo" : "integrantes activos"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold px-3 py-2 transition-opacity"
        >
          <Pencil className="size-3.5" /> Editar página
        </button>
      </div>

      <div className="space-y-2">
        {members.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todavía no invitaste a nadie.</p>
        ) : (
          members.map((m) => (
            <div key={m.membershipId} className="flex items-center justify-between gap-2 rounded-lg bg-background/50 border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{m.displayName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {ROLE_LABELS[m.role]} —{" "}
                  <span
                    className={
                      m.status === "accepted"
                        ? "text-primary"
                        : m.status === "declined"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }
                  >
                    {m.status === "accepted" ? "Activo" : m.status === "declined" ? "Rechazada" : "Pendiente"}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(m.membershipId)}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                title="Quitar miembro"
                aria-label="Quitar miembro"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-border">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="@usuario a invitar"
          className="flex-1 rounded-lg border border-input bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "editor")}
          className="rounded-lg border border-input bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="editor">Editor / Community Manager</option>
          <option value="admin">Administrador Total</option>
        </select>
        <button
          type="button"
          disabled={inviting || !username.trim()}
          onClick={handleInvite}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold px-4 py-2.5 transition-opacity disabled:opacity-50"
        >
          <Plus className="size-3.5" /> {inviting ? "Invitando..." : "Invitar"}
        </button>
      </div>
    </div>
  );
}
