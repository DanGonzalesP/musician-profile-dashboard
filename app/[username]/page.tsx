"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { type Block } from "@/lib/blocks";
import { PreviewCanvas } from "@/components/preview-canvas";

export default function PerfilPublicoPage() {
  const params = useParams();
  const username = params?.username as string;

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function cargarPerfil() {
      if (!username) return;

      // Buscamos al artista por su nombre de usuario y traemos sus bloques configurados
      const { data, error } = await supabase
        .from("artist")
        .select("blocks")
        .eq("username", username)
        .single();

      if (error || !data) {
        setError(true);
      } else {
        // Asignamos los bloques recuperados de Supabase (si no hay, lista vacía)
        setBlocks((data.blocks as Block[]) || []);
      }
      setLoading(false);
    }

    cargarPerfil();
  }, [username]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm font-medium">Cargando portafolio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm font-semibold text-destructive">Artista no encontrado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 lg:p-8">
      <main className="mx-auto max-w-2xl">
        {/* Reutilizamos el PreviewCanvas en modo solo lectura (sin funciones de edición) */}
        <PreviewCanvas
          blocks={blocks}
          selectedId={null}
          isDragging={false}
          onSelect={() => {}}
          onDelete={() => {}}
          onMove={() => {}}
          onDropAt={() => {}}
          onReorderStart={() => {}}
          onDragEnd={() => {}}
        />
      </main>
    </div>
  );
}