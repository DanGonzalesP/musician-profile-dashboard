"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { type Block, type BlockType, type TracksData, type CreditsData, BLOCK_LIBRARY, dbBlockToBlock, isKnownBlockType, mergePublicacionesEmbeds } from "@/lib/blocks";
import { type CatalogProduct, type CatalogService, fetchCatalog } from "@/lib/catalog";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import { AskAboutBlock } from "@/components/blocks/ask-about-block";
import { ProfileSkeleton } from "@/components/blocks/skeletons";
import { accentClassName, isAccentColor, type AccentColor } from "@/lib/theme";
import { AudioReactiveBackground } from "@/components/audio-reactive-background";
import { useLocale } from "@/components/locale-provider";
import { Store, ArrowLeft, Sparkles, Milestone, GalleryHorizontalEnd, Users, type LucideIcon } from "lucide-react";

type LoadingState = "idle" | "loading" | "error" | "empty" | "success";
type TabKey = "main" | "legado" | "publicaciones" | "store";

// Perfil "separado" (default): Hero, Single Destacado, Meta de Producción,
// Track List y Donaciones viven en la pestaña "Legado" (el catálogo de
// canciones). Trayectoria (historia/carrera), Publicaciones y Embeds son
// pestañas propias — cada una solo aparece si el artista tiene al menos un
// bloque de ese tipo. Merch y Servicios quedan en "Tienda", al final. Si el
// artista activa "Unificar perfil" (profiles.unified_profile), se muestran
// todos los bloques juntos en position_index, sin pestañas.
const MAIN_BLOCK_TYPES: BlockType[] = ["hero", "single", "crowdfunding", "tracks", "credits"];
const EXTRA_TAB_TYPES: BlockType[] = ["legado", "publicaciones", "embeds"];

export default function PerfilPublicoPage() {
  return <PerfilPublicoContent />;
}

function PerfilPublicoContent() {
  const { t } = useLocale();
  const params = useParams();
  const username = (params?.username as string)?.trim().toLowerCase();

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [state, setState] = useState<LoadingState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [unifiedProfile, setUnifiedProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("main");
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [isBand, setIsBand] = useState(false);
  const [profileAccent, setProfileAccent] = useState<AccentColor>("rojo");

  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setViewerUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!username) {
      setState("error");
      setErrorMessage("Perfil no especificado");
      return;
    }

    const controller = new AbortController();

    async function cargarPerfil() {
      try {
        setState("loading");
        setErrorMessage(null);

        // Convertir slug URL → formato de búsqueda
        // "nova-reyes" → "nova reyes"
        const displayNameSlug = username.replaceAll("-", " ");

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, unified_profile, user_id, profile_type")
          .ilike("display_name", displayNameSlug)
          .maybeSingle();

        if (controller.signal.aborted) return;

        if (profileError) {
          throw new Error(`Error al buscar perfil: ${profileError.message}`);
        }

        if (!profile) {
          setState("error");
          setErrorMessage("Artista no encontrado");
          return;
        }

        setUnifiedProfile(Boolean(profile.unified_profile));
        setOwnerUserId(profile.user_id ?? null);
        setProfileId(profile.id);
        setIsBand(profile.profile_type === "band");

        // Acento elegido por el artista para SU página. Consulta aparte y
        // tolerante: si la columna no existe (setup_vibra.sql sin correr),
        // simplemente queda el rojo por defecto.
        supabase
          .from("profiles")
          .select("accent_color")
          .eq("id", profile.id)
          .maybeSingle()
          .then(({ data: accentRow }) => {
            if (!controller.signal.aborted && accentRow && isAccentColor(accentRow.accent_color)) {
              setProfileAccent(accentRow.accent_color);
            }
          });

        // Cargar bloques del perfil
        const { data: dbBlocks, error: blocksError } = await supabase
          .from("profile_blocks")
          .select("id, block_type, content, position_index")
          .eq("profile_id", profile.id)
          .eq("is_visible", true)
          .order("position_index", { ascending: true });

        if (controller.signal.aborted) return;

        if (blocksError) {
          throw new Error(`Error al cargar bloques: ${blocksError.message}`);
        }

        const isBandProfile = profile.profile_type === "band";
        const parsedBlocks = mergePublicacionesEmbeds(
          (dbBlocks ?? [])
            .filter((b) => isKnownBlockType(b.block_type))
            .map((b) => dbBlockToBlock(b, { isBand: isBandProfile }))
        );

        const { products: catalogProducts, services: catalogServices } = await fetchCatalog(profile.id);

        if (controller.signal.aborted) return;

        setProducts(catalogProducts);
        setServices(catalogServices);

        if (parsedBlocks.length === 0) {
          setState("empty");
          setBlocks([]);
        } else {
          setState("success");
          setBlocks(parsedBlocks);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        const message =
          err instanceof Error ? err.message : "Error desconocido al cargar el perfil";
        setErrorMessage(message);
        setState("error");
      }
    }

    cargarPerfil();

    return () => controller.abort();
  }, [username]);

  // Solo el dueño del perfil lo ve — cierra el loop que abre "Vista previa"
  // en el editor: esa vista abre esta misma página pública en una pestaña
  // nueva, y hasta ahora no había forma de volver al panel desde ahí.
  const isOwner = Boolean(ownerUserId && viewerUserId && ownerUserId === viewerUserId);

  // Si es el propio artista viendo su portal público (ej. desde "Vista
  // previa" del editor), la flecha vuelve a su panel de edición en vez del
  // feed principal — a cualquier otro visitante sí lo manda al feed. Antes
  // había un segundo botón aparte ("Volver a panel de edición") que llevaba
  // al mismo lugar; se unificaron en este único botón.
  const backToFeedButton = (
    <Link
      href={isOwner ? "/dashboard" : "/"}
      className="fixed left-4 top-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-accent/40"
    >
      <ArrowLeft className="size-3.5" />
      {isOwner ? "Volver al panel de artista" : t("auth_back_to_feed")}
    </Link>
  );

  // UI States
  if (state === "loading") {
    return (
      <div className="min-h-screen bg-background text-foreground px-4 py-6 sm:px-6 sm:py-8">
        {backToFeedButton}
        <main className="mx-auto max-w-6xl">
          <ProfileSkeleton />
        </main>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        {backToFeedButton}
        <div className="text-center">
          <p className="text-sm font-semibold text-destructive">
            {errorMessage || "Artista no encontrado."}
          </p>
        </div>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        {backToFeedButton}
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">
            No hay contenido disponible todavía.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            El perfil se completará cuando haya datos en Supabase.
          </p>
        </div>
      </div>
    );
  }

  const tracksData = blocks.find((b) => b.type === "tracks")?.data as TracksData | undefined;
  const albumCovers = tracksData?.albums.map((a) => a.cover).filter(Boolean) ?? [];
  const creditsCount = (blocks.find((b) => b.type === "credits")?.data as CreditsData | undefined)?.credits.length ?? 0;

  // Orden estrictamente igual al de blocks[] (ya viene ordenado por
  // position_index desde la consulta) — nunca se fuerza un tipo de bloque
  // a una posición fija, para que el orden del editor/dashboard se respete
  // tal cual en el perfil público.
  const heroBlock = blocks.find((b) => b.type === "hero");
  const mainBlocks = blocks.filter((b) => MAIN_BLOCK_TYPES.includes(b.type) && b.type !== "hero");
  const legadoBlocks = blocks.filter((b) => b.type === "legado");
  const publicacionesBlocks = blocks.filter((b) => b.type === "publicaciones");
  const storeBlocks = blocks.filter(
    (b) => !MAIN_BLOCK_TYPES.includes(b.type) && !EXTRA_TAB_TYPES.includes(b.type)
  );

  // Cada pestaña extra (Legado/Publicaciones/Embeds/Tienda) solo existe si
  // el artista tiene contenido de ese tipo — "Inicio" siempre está presente.
  const tabs: { key: TabKey; label: string; icon: LucideIcon; blocks: Block[] }[] = [
    { key: "main", label: t("tab_home"), icon: Sparkles, blocks: mainBlocks },
    ...(legadoBlocks.length > 0 ? [{ key: "legado" as const, label: t("tab_legado"), icon: Milestone, blocks: legadoBlocks }] : []),
    ...(publicacionesBlocks.length > 0
      ? [{ key: "publicaciones" as const, label: t("tab_publicaciones"), icon: GalleryHorizontalEnd, blocks: publicacionesBlocks }]
      : []),
    ...(storeBlocks.length > 0 ? [{ key: "store" as const, label: t("tab_store"), icon: Store, blocks: storeBlocks }] : []),
  ];
  const showTabBar = !unifiedProfile && tabs.length > 1;
  const activeBlocks = tabs.find((tab) => tab.key === activeTab)?.blocks ?? mainBlocks;

  // A los visitantes (nunca al propio dueño) se les ofrece un botón flotante
  // sobre cada bloque para preguntarle al artista sobre ese elemento puntual
  // — llega a la barra de notificaciones del dueño (ver AskAboutBlock).
  const renderBlock = (block: Block) => {
    const rendered = (
      <BlockRenderer
        block={block}
        products={products}
        services={services}
        shareUrl={shareUrl}
        albumCovers={albumCovers}
        creditsCount={creditsCount}
      />
    );

    if (isOwner || !profileId) {
      return <div key={block.id}>{rendered}</div>;
    }

    const def = BLOCK_LIBRARY.find((b) => b.type === block.type);
    return (
      <AskAboutBlock
        key={block.id}
        profileId={profileId}
        blockType={block.type}
        blockLabel={def?.label ?? block.type}
        hasSession={Boolean(viewerUserId)}
      >
        {rendered}
      </AskAboutBlock>
    );
  };

  return (
    <div className={`min-h-screen text-foreground px-4 py-6 sm:px-6 sm:py-8 ${accentClassName(profileAccent)}`}>
      <AudioReactiveBackground />
      {backToFeedButton}
      {/* La pestaña de Trayectoria (CV) usa todo el espacio lateral disponible;
          el resto del perfil mantiene el ancho de lectura clásico. */}
      <main
        className={`mx-auto flex w-full flex-col gap-8 animate-fade-in ${
          !unifiedProfile && activeTab === "legado" ? "max-w-[88rem]" : "max-w-6xl"
        }`}
      >
        {/* El bloque hero (foto de perfil + portada) siempre va primero —
            la barra de tabs y el resto del contenido se acomodan debajo,
            nunca encima de él. */}
        {heroBlock && (
          <div className="relative">
            {renderBlock(heroBlock)}
            {isBand && (
              <span className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-black/60 px-3 py-1 text-xs font-semibold text-primary backdrop-blur">
                <Users className="size-3.5" />
                {t("profile_band_badge")}
              </span>
            )}
          </div>
        )}

        {unifiedProfile
          ? (
            <>
              {blocks.filter((b) => b.type !== "hero").map(renderBlock)}
            </>
          )
          : (
            <>
              {showTabBar && (
                <div className="sticky top-2 z-20 flex w-full overflow-x-auto rounded-xl border border-border bg-card/95 px-2 shadow-lg backdrop-blur [&::-webkit-scrollbar]:hidden">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex flex-1 min-w-fit items-center justify-center gap-1 whitespace-nowrap border-b-2 px-2 py-2.5 text-xs font-medium transition-colors sm:gap-1.5 sm:px-3 sm:py-3 sm:text-sm ${
                          activeTab === tab.key
                            ? "border-primary text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className="hidden size-4 sm:block" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {activeBlocks.map(renderBlock)}
            </>
          )}
      </main>
    </div>
  );
}
