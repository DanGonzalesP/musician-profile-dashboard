"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { type Block, type TracksData, type CreditsData, createBlock, dbBlockToBlock, isKnownBlockType, mergePublicacionesEmbeds } from "@/lib/blocks";
import { type CatalogProduct, type CatalogService, fetchCatalog, normalizeDraftProduct, normalizeDraftService } from "@/lib/catalog";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import { ProfileSkeleton } from "@/components/blocks/skeletons";
import { readEditorState } from "@/lib/editor-persistence";
import { getActiveBandId, getEffectiveBandRole } from "@/lib/bands";
import { ArrowLeft } from "lucide-react";

type LoadingState = "loading" | "error" | "success";
export type PreviewContent = { blocks: Block[]; products: CatalogProduct[]; services: CatalogService[] };

// Contenido de la vista previa del borrador — se usa tanto en la página
// standalone (/perfil/preview) como embebido DIRECTAMENTE (sin iframe) en el
// modal "Vista previa" del editor (ver editor-header.tsx). Antes el modal
// usaba un <iframe>, pero eso quedaba bloqueado por el navegador ("Este
// contenido está bloqueado") en cualquier contexto donde la propia app ya
// esté dentro de otro iframe (frame-ancestors/X-Frame-Options revisan TODA
// la cadena de ancestros, no solo el padre inmediato) — renderizar el mismo
// componente en el propio documento evita el problema de raíz.
export function PerfilPreviewContent({ embedded = false, content }: { embedded?: boolean; content?: PreviewContent }) {
  const router = useRouter();
  const [loadedBlocks, setBlocks] = useState<Block[]>([]);
  const [loadedProducts, setProducts] = useState<CatalogProduct[]>([]);
  const [loadedServices, setServices] = useState<CatalogService[]>([]);
  const [state, setState] = useState<LoadingState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [profileName, setProfileName] = useState("");
  const blocks = content?.blocks ?? loadedBlocks;
  const products = content?.products ?? loadedProducts;
  const services = content?.services ?? loadedServices;

  useEffect(() => {
    // El modal usa el contenido vivo del editor: incluye cambios pendientes,
    // archivos locales y el grupo activo, sin releer otro perfil de la base.
    if (content) return;
    let active = true;
    async function cargarBorrador() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (!active) return;
        if (authError) throw authError;
        if (!user) {
          router.replace("/login");
          return;
        }

        // Misma resolución que el editor: el perfil real del usuario. Sin
        // fila propia no hay borrador que previsualizar — antes se caía al
        // perfil semilla PROFILE_ID, compartido entre cuentas.
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, display_name")
          .eq("user_id", user.id)
          .eq("profile_type", "artist")
          .maybeSingle();

        if (profileError) throw profileError;
        if (!profile) {
          throw new Error("No se pudo cargar tu perfil. Vuelve a iniciar sesión e inténtalo de nuevo.");
        }

        let profileId = profile.id;
        let name = profile.display_name || "Mi perfil";
        const selectedBandId = getActiveBandId(user.id);
        if (selectedBandId) {
          const role = await getEffectiveBandRole(selectedBandId, user.id);
          if (!role) throw new Error("Sin acceso al grupo seleccionado");
          const { data: band, error: bandError } = await supabase.from("profiles")
            .select("id, display_name").eq("id", selectedBandId).eq("profile_type", "band").maybeSingle();
          if (bandError || !band) throw new Error("No se pudo cargar el grupo seleccionado");
          profileId = band.id;
          name = band.display_name || "Mi grupo";
        }

        type PreviewDraft = { blocks: Block[]; products: CatalogProduct[]; services: CatalogService[] };
        const { draft_content } = await readEditorState(profileId);
        const draft = draft_content as PreviewDraft | null;
        let nextContent: PreviewContent;

        if (draft) {
          nextContent = {
            blocks: mergePublicacionesEmbeds((draft.blocks ?? []).filter((b) => isKnownBlockType(b.type))),
            products: (draft.products ?? []).map(normalizeDraftProduct),
            services: (draft.services ?? []).map(normalizeDraftService),
          };
        } else {
          const { data: dbBlocks, error: blocksError } = await supabase
            .from("profile_blocks")
            .select("id, block_type, content, position_index")
            .eq("profile_id", profileId)
            .order("position_index", { ascending: true });

          if (blocksError) throw blocksError;

          const validDbBlocks = (dbBlocks ?? []).filter((b) => isKnownBlockType(b.block_type));
          const nextBlocks =
            validDbBlocks.length > 0
              ? mergePublicacionesEmbeds(validDbBlocks.map((b) => dbBlockToBlock(b)))
              : [createBlock("hero"), createBlock("tracks"), createBlock("merch")];

          const { products: catalogProducts, services: catalogServices } = await fetchCatalog(profileId);
          nextContent = { blocks: nextBlocks, products: catalogProducts, services: catalogServices };
        }

        if (!active) return;
        setBlocks(nextContent.blocks);
        setProducts(nextContent.products);
        setServices(nextContent.services);
        setProfileName(name);
        setState("success");
      } catch {
        if (!active) return;
        setErrorMessage("No pudimos cargar la vista previa del perfil seleccionado. Revisa tu conexión y tu acceso al grupo, o vuelve al editor para elegir otro perfil.");
        setState("error");
      }
    }
    void cargarBorrador();
    return () => { active = false; };
  }, [router, content, retry]);

  if (!content && state === "loading") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {!embedded && (
          <div className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-amber-500/10 px-4 py-2 backdrop-blur">
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300">
              <ArrowLeft className="size-3.5" /> Volver al editor
            </Link>
            <span className="text-xs font-semibold text-amber-400">Vista previa — cambios sin publicar</span>
          </div>
        )}
        <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
          <ProfileSkeleton />
        </main>
      </div>
    );
  }

  if (!content && state === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-foreground">
        <h1 className="text-xl font-semibold">Vista previa no disponible</h1>
        <p role="alert" className="max-w-lg text-sm text-destructive">{errorMessage}</p>
        <button type="button" className="min-h-11 rounded-lg border px-4" onClick={() => { setState("loading"); setErrorMessage(null); setRetry(value => value + 1); }}>Reintentar</button>
        <Link href="/dashboard" className="inline-flex min-h-11 items-center text-primary underline">Volver al editor</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!embedded && (
        <div className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-amber-500/10 px-4 py-2 backdrop-blur">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300">
            <ArrowLeft className="size-3.5" /> Volver al editor
          </Link>
          <span className="text-xs font-semibold text-amber-400">Vista previa — cambios sin publicar</span>
        </div>
      )}
      <main className="mx-auto flex max-w-5xl flex-col gap-8 p-4 sm:p-6 lg:p-8 animate-fade-in">
        {!embedded && <p className="text-sm text-muted-foreground">{profileName} · Esta vista muestra el contenido guardado. Para ver cambios pendientes y archivos locales, abre la vista previa dentro del editor.</p>}
        {blocks.map((block) => {
          const tracksData = blocks.find((b) => b.type === "tracks")?.data as TracksData | undefined;
          const creditsData = blocks.find((b) => b.type === "credits")?.data as CreditsData | undefined;
          return (
            <BlockRenderer
              key={block.id}
              block={block}
              allowSupportDemo
              products={products}
              services={services}
              albumCovers={tracksData?.albums.map((a) => a.cover).filter(Boolean) ?? []}
              creditsCount={creditsData?.credits.length ?? 0}
            />
          );
        })}
      </main>
    </div>
  );
}
