"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface FormularioProps {
  artistId: number;
}

export default function FormularioDonacion({ artistId }: FormularioProps) {
  const [donorName, setDonorName] = useState("");
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  const formatearDecimales = () => {
    if (amount && !isNaN(Number(amount))) {
      setAmount(Number(amount).toFixed(2));
    }
  };

  const procesarDonacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;

    setSending(true);
    setStatus("");

    const montoNum = parseFloat(amount);
    if (isNaN(montoNum) || montoNum <= 0) {
      setStatus("Por favor, ingresa un monto válido.");
      setSending(false);
      return;
    }

    try {
      const { data: artistData, error: errorArtist } = await supabase
        .from("artist")
        .select("total_donations")
        .eq("id", artistId)
        .single();

      if (errorArtist) throw new Error("No se pudo conectar con el servidor.");

      const nuevoTotal = (artistData?.total_donations || 0) + montoNum;

      const { error: errorDonation } = await supabase
        .from("donations")
        .insert([
          {
            artist_id: artistId,
            donor_name: donorName.trim() || "Donador Anónimo",
            message: message.trim() || null,
            amount: montoNum,
          },
        ]);

      if (errorDonation) throw new Error("No se pudo procesar el aporte.");

      await supabase
        .from("artist")
        .update({ total_donations: nuevoTotal })
        .eq("id", artistId);

      setDonorName("");
      setMessage("");
      setAmount("");
      
      window.location.reload();
    } catch (err: any) {
      setStatus(err.message || "Ocurrió un inconveniente temporal.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={procesarDonacion} className="space-y-4 bg-zinc-950 p-6 rounded-xl border border-zinc-800">
      <div>
        <label className="block text-xs font-medium text-zinc-300 mb-1">Tu Nombre (Opcional)</label>
        <input
          type="text"
          value={donorName}
          onChange={(e) => setDonorName(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          placeholder="Ej. Juan Pérez"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-300 mb-1">Monto a apoyar ($ USD)</label>
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={formatearDecimales}
          className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          placeholder="10.00"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-300 mb-1">Mensaje de aliento</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none"
          placeholder="Deja un mensaje al artista..."
        />
      </div>

      <button
        type="submit"
        disabled={sending}
        className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-sm p-2 rounded transition-colors disabled:opacity-50"
      >
        {sending ? "Procesando..." : "Enviar Aporte Directo"}
      </button>

      {status && (
        <p className="text-center text-xs font-semibold mt-1 text-red-400">
          {status}
        </p>
      )}
    </form>
  );
}