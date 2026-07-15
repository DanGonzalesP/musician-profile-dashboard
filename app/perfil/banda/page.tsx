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
import { Loader2, Plus, Trash2, Check, X as XIcon, Pencil } from "lucide-react";

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
        <div className="flex items-center justify-center p-12 text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </LayoutAdmin>
    );
  }

  return (
    <LayoutAdmin>
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <header className="border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-bold text-white">Mis Bandas</h1>
          <p className="text-zinc-400 text-xs mt-1">
            Crea páginas de banda, invita colaboradores y gestiona sus roles de edición.
          </p>
        </header>

        {errorMessage && (
          <div className="p-4 rounded-md border bg-red-500/10 border-red-500/20 text-red-400 text-sm">{errorMessage}</div>
        )}

        {pendingInvites.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              Invitaciones recibidas ({pendingInvites.length})
            </h2>
            <div className="space-y-3">
              {pendingInvites.map((inv) => (
                <div
                  key={inv.membershipId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <p className="text-sm text-zinc-300">
                    <span className="font-semibold text-white">{inv.bandDisplayName}</span> te invitó como{" "}
                    <span className="font-medium text-amber-400">{ROLE_LABELS[inv.role]}</span>
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleInviteResponse(inv.membershipId, "accepted")}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 text-xs font-bold px-3 py-2 transition-colors"
                    >
                      <Check className="size-3.5" /> Aceptar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInviteResponse(inv.membershipId, "declined")}
                      className="flex items-center gap-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/40 border border-zinc-800 text-zinc-300 text-xs font-bold px-3 py-2 transition-colors"
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
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Crear página de banda</h2>
          <div className="flex gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <input
              type="text"
              value={newBandName}
              onChange={(e) => setNewBandName(e.target.value)}
              placeholder="Nombre de la banda"
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
            />
            <button
              type="button"
              disabled={creating || !newBandName.trim()}
              onClick={handleCreateBand}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 text-xs font-bold px-4 py-2 transition-colors disabled:opacity-50"
            >
              <Plus className="size-3.5" /> {creating ? "Creando..." : "Crear Banda"}
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Tus bandas ({ownedBands.length})
          </h2>
          {ownedBands.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8 bg-zinc-950 rounded-xl border border-zinc-800">
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

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white">{band.displayName}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold px-3 py-2 transition-colors"
        >
          <Pencil className="size-3.5" /> Editar página
        </button>
      </div>

      <div className="space-y-2">
        {members.length === 0 ? (
          <p className="text-xs text-zinc-500">Todavía no invitaste a nadie.</p>
        ) : (
          members.map((m) => (
            <div key={m.membershipId} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-900/60 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{m.displayName}</p>
                <p className="text-[11px] text-zinc-500">
                  {ROLE_LABELS[m.role]} —{" "}
                  <span
                    className={
                      m.status === "accepted"
                        ? "text-emerald-400"
                        : m.status === "declined"
                          ? "text-red-400"
                          : "text-amber-400"
                    }
                  >
                    {m.status === "accepted" ? "Activo" : m.status === "declined" ? "Rechazada" : "Pendiente"}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(m.membershipId)}
                className="flex size-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-950/40 hover:text-red-400 transition-colors shrink-0"
                title="Quitar miembro"
                aria-label="Quitar miembro"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-zinc-800">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="@usuario a invitar"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "editor")}
          className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
        >
          <option value="editor">Editor / Community Manager</option>
          <option value="admin">Administrador Total</option>
        </select>
        <button
          type="button"
          disabled={inviting || !username.trim()}
          onClick={handleInvite}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 text-xs font-bold px-4 py-2 transition-colors disabled:opacity-50"
        >
          <Plus className="size-3.5" /> {inviting ? "Invitando..." : "Invitar"}
        </button>
      </div>
    </div>
  );
}
