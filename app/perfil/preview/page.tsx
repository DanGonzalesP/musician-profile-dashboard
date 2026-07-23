"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PerfilPreviewContent } from "@/components/perfil-preview-content";

export default function PerfilPreviewPage() {
  return (
    <Suspense fallback={null}>
      <PerfilPreviewPageInner />
    </Suspense>
  );
}

function PerfilPreviewPageInner() {
  const searchParams = useSearchParams();
  // ?embed=1: se está mostrando dentro del modal "Vista previa" del editor
  // (renderizado directo, ver editor-header.tsx) — la barra superior con
  // "Volver al editor" no aplica ahí (el modal ya tiene su propio "Cerrar").
  const embedded = searchParams.get("embed") === "1";
  return <PerfilPreviewContent embedded={embedded} />;
}
