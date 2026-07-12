"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface AccionProps {
  itemId: number;
  tipo: "merch" | "servicio";
  stockActual?: number;
  itemTitle: string;
  itemPrice: number;
  itemCurrency: string;
  artistId: number;
}

export default function AccionPublica({ itemId, tipo, stockActual = 0, itemTitle, itemPrice, itemCurrency, artistId }: AccionProps) {
  const [procesando, setProcesando] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [estadoPago, setEstadoPago] = useState("");
  
  const [tarjeta, setTarjeta] = useState("");
  const [nombre, setNombre] = useState("");

  const ejecutarTransaccion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tarjeta || !nombre) return;

    setProcesando(true);
    setEstadoPago("");

    try {
      if (tipo === "merch" && stockActual <= 0) {
        throw new Error("Agotado");
      }

      if (tipo === "merch") {
        await supabase.from("merch").update({ stock: stockActual - 1 }).eq("id", itemId);
      }

      await supabase.from("orders").insert([
        {
          artist_id: artistId,
          customer_name: nombre.trim(),
          item_type: tipo,
          item_title: itemTitle,
          price_paid: itemPrice,
          currency: itemCurrency || "USD"
        }
      ]);

      setEstadoPago("✔ ¡Pago procesado con éxito!");
      setTimeout(() => {
        setMostrarModal(false);
        window.location.reload();
      }, 1500);

    } catch (err: any) {
      setEstadoPago(err.message || "Error al procesar tarjeta.");
      setProcesando(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={() => setMostrarModal(true)}
        disabled={tipo === "merch" && stockActual <= 0}
        className={`text-xs font-bold py-1.5 px-3 rounded transition-colors ${
          tipo === "merch" && stockActual <= 0
            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700"
            : "bg-amber-500 hover:bg-amber-600 text-zinc-950"
        }`}
      >
        {tipo === "merch" ? (stockActual <= 0 ? "Agotado" : "Comprar") : "Contratar"}
      </button>

      {/* VENTANA FLOTANTE DE CHECKOUT (MODAL) */}
      {mostrarModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-xl max-w-sm w-full space-y-4 shadow-2xl text-left">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Checkout Seguro</h3>
              <p className="text-base font-bold text-white mt-0.5">{itemTitle} — ${itemPrice.toFixed(2)}</p>
            </div>

            <form onSubmit={ejecutarTransaccion} className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Nombre del tarjetahabiente</label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Carlos Mendoza"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Número de Tarjeta</label>
                <input
                  type="text"
                  maxLength={16}
                  required
                  value={tarjeta}
                  onChange={(e) => setTarjeta(e.target.value.replace(/\D/g, ""))}
                  placeholder="4000 1234 5678 9010"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {estadoPago && (
                <p className={`text-xs font-bold text-center ${estadoPago.includes("✔") ? "text-emerald-400" : "text-red-400"}`}>
                  {estadoPago}
                </p>
              )}

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  disabled={procesando}
                  onClick={() => setMostrarModal(false)}
                  className="w-1/2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-700 text-xs font-bold py-2 rounded transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando}
                  className="w-1/2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 text-xs font-bold py-2 rounded transition-colors disabled:opacity-50"
                >
                  {procesando ? "Verificando..." : "Pagar Ahora"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}