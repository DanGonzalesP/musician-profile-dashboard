"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LayoutAdmin from "@/components/LayoutAdmin";
import { mensajeDeErrorDeConsulta } from "@/lib/errores-de-consulta";
import { ArrowUpRight, Loader2, Palette, Settings, Bell } from "lucide-react";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<number | null>(null);
  const [servicios, setServicios] = useState<number | null>(null);
  const [musica, setMusica] = useState<number | null>(null);
  const [sessionChanged, setSessionChanged] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState("");
  const [perfil, setPerfil] = useState<{ username: string; display_name: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let invalidated = false;
    let owner: string | null | undefined;
    const controller = new AbortController();
    const isCurrent = () => active && !invalidated;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isCurrent()) return;
      const nextOwner = session?.user.id ?? null;
      if (owner !== undefined && owner !== nextOwner) {
        invalidated = true;
        controller.abort();
        setPerfil(null);
        setProductos(null);
        setServicios(null);
        setMusica(null);
        setErrorMensaje("");
        setSessionChanged(true);
        setLoading(false);
      }
      owner = nextOwner;
    });
    async function cargarEstadisticas() {
      setLoading(true);
      setErrorMensaje("");
      setProductos(null);
      setServicios(null);
      setMusica(null);
      setPerfil(null);
      try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!isCurrent()) return;
      if (authError) throw new Error("Sesión no disponible");
      if (!user) {
        router.push("/login");
        return;
      }
      if (owner !== undefined && owner !== user.id) throw new Error("Sesión no disponible");
      owner = user.id;
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!isCurrent()) return;
      if (sessionError || sessionData.session?.user.id !== user.id) throw new Error("Sesión no disponible");
      const token = sessionData.session.access_token;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .eq("user_id", user.id)
        .abortSignal(controller.signal).maybeSingle()
        .setHeader("Authorization", `Bearer ${token}`);

      if (!isCurrent()) return;
      if (profileError) {
        // Nunca el texto de Postgres en pantalla: ver lib/errores-de-consulta.ts.
        setErrorMensaje(mensajeDeErrorDeConsulta(profileError, "tu perfil"));
        setLoading(false);
        return;
      }

      // Sin fila de perfil no se sigue: antes se caía al perfil semilla
      // PROFILE_ID, un buzón compartido entre cuentas (ver AUDITORIA.md 9).
      if (!profile) {
        setErrorMensaje("No se pudo cargar tu perfil. Vuelve a iniciar sesión e inténtalo de nuevo.");
        setLoading(false);
        return;
      }
      if (!isCurrent()) return;
      setPerfil(profile);
      const profileId = profile.id;

      const results = await Promise.allSettled([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("seller_id", profileId)
          .setHeader("Authorization", `Bearer ${token}`).abortSignal(controller.signal),
        supabase.from("services").select("id", { count: "exact", head: true }).eq("profile_id", profileId)
          .setHeader("Authorization", `Bearer ${token}`).abortSignal(controller.signal),
        supabase.from("music_feed").select("id", { count: "exact", head: true }).eq("profile_id", profileId)
          .setHeader("Authorization", `Bearer ${token}`).abortSignal(controller.signal),
      ]);
      if (!isCurrent()) return;
      const counts = results.map(result => result.status === "fulfilled" && !result.value.error
        && typeof result.value.count === "number" ? result.value.count : null);
      setProductos(counts[0] ?? null);
      setServicios(counts[1] ?? null);
      setMusica(counts[2] ?? null);
      if (counts.some(count => count === null)) setErrorMensaje("No pudimos cargar parte del resumen. Los datos disponibles se mantienen; puedes volver a intentarlo.");

      } catch {
        if (isCurrent()) setErrorMensaje("No pudimos cargar el resumen. Revisa tu conexión e inténtalo de nuevo.");
      } finally {
        if (isCurrent()) setLoading(false);
      }
    }
    void cargarEstadisticas();
    return () => { active = false; controller.abort(); listener.subscription.unsubscribe(); };
  }, [router, refresh]);

  if (sessionChanged) {
    return <LayoutAdmin><main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-bold">La cuenta cambió</h1>
      <p role="status">Cerramos el resumen de la cuenta anterior. Vuelve a cargar para continuar con la cuenta actual.</p>
      <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg border px-4">Cargar la cuenta actual</button>
    </main></LayoutAdmin>;
  }

  if (loading) {
    return (
      <LayoutAdmin>
        <div role="status" className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
          <Loader2 aria-hidden="true" className="w-8 h-8 animate-spin" />
          Cargando tu espacio…
        </div>
      </LayoutAdmin>
    );
  }

  return (
    <LayoutAdmin>
      <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div><p className="text-sm text-muted-foreground">Tu espacio en Vibe</p><h1 className="mt-1 text-3xl font-bold">{perfil?.display_name || "Tu panel"}</h1><p className="mt-2 text-sm text-muted-foreground">Da forma a tu perfil, comparte tu trabajo y gestiona tu actividad.</p></div>
          <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground"><Palette aria-hidden="true" className="size-4" />Editar mi página</Link>
        </header>
        <section aria-labelledby="acciones-heading" className="space-y-3">
          <h2 id="acciones-heading" className="text-lg font-semibold">¿Qué quieres hacer?</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { href: "/perfil/config", title: "Personalizar mi perfil", description: "Tu nombre, roles musicales y apariencia.", Icon: Settings },
              { href: "/perfil/preview", title: "Revisar mi borrador", description: "Mira cómo quedaría antes de publicar.", Icon: Palette },
              { href: "/perfil/notificaciones", title: "Ver mis notificaciones", description: "Preguntas y solicitudes de colaboración.", Icon: Bell },
            ].map(({ href, title, description, Icon }) => <Link key={href} href={href} className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"><Icon aria-hidden="true" className="mb-4 size-5 text-primary" /><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p></Link>)}
          </div>
        </section>
        {perfil?.username && <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5" aria-labelledby="perfil-publico-heading">
          <div className="min-w-0"><h2 id="perfil-publico-heading" className="font-semibold">Tu página pública</h2><p className="mt-1 break-all text-sm text-muted-foreground">@{perfil.username}</p><p className="mt-2 text-sm text-muted-foreground">Para mostrar cambios del editor, usa Publicar cuando estén listos.</p></div>
          <Link href={`/${encodeURIComponent(perfil.username)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold">Abrir perfil (otra pestaña)<ArrowUpRight aria-hidden="true" className="size-4" /></Link>
        </section>}
        <section aria-labelledby="actividad-heading" className="space-y-4">
          <h2 id="actividad-heading" className="text-lg font-semibold">Contenido de tu perfil</h2>
          {errorMensaje && <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm"><p>{errorMensaje}</p><button type="button" onClick={() => setRefresh(value => value + 1)} className="min-h-11 rounded-lg border border-border px-4 py-2 font-medium">Volver a cargar</button></div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Productos en catálogo", count: productos, href: "/perfil/admin-merch" },
              { label: "Servicios en catálogo", count: servicios, href: "/perfil/admin-servicios" },
              { label: "Entradas musicales", count: musica, href: "/perfil/admin-musica" },
            ].map(item => <Link href={item.href} key={item.label} className="rounded-xl border border-border bg-card p-5 focus-visible:outline-2 focus-visible:outline-primary"><span className="block text-sm text-muted-foreground">{item.label}</span><span className="mt-2 block text-2xl font-bold">{item.count === null ? "No disponible" : String(item.count)}</span><span className="mt-3 block text-sm text-primary underline">Gestionar</span></Link>)}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">Incluye los registros que puedes gestionar, también los ocultos. Los cambios pendientes del editor se incorporan al publicar. Este resumen no representa ventas, cobros ni saldo disponible.</p>
          <Link href="/perfil/pedidos" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">Cómo funcionan las ventas y pedidos</Link>
        </section>
      </div>
    </LayoutAdmin>
  );
}
