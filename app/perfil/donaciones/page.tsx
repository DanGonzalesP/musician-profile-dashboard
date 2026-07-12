import { supabase } from "@/lib/supabase";
import FormularioDonacion from "@/components/FormularioDonacion";
import AccionPublica from "@/components/AccionPublica";

export default async function DonacionesPage() {
  const { data: artist } = await supabase
    .from("artist")
    .select("id, total_donations")
    .eq("username", "novareyes")
    .single();

  if (!artist) {
    return <div className="p-6 text-white text-center">No se encontró evidencia del artista requerido.</div>;
  }

  const [donationsResult, servicesResult, merchResult] = await Promise.all([
    supabase
      .from("donations")
      .select("*")
      .eq("artist_id", artist.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("services")
      .select("*")
      .eq("artist_id", artist.id),
    supabase
      .from("merch")
      .select("*")
      .eq("artist_id", artist.id),
  ]);

  const donations = donationsResult.data;
  const services = servicesResult.data;
  const merchItems = merchResult.data;

  return (
    <div className="p-8 max-w-2xl mx-auto text-white space-y-12">
      {/* CABECERA */}
      <header className="border-b border-zinc-800 pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold">Portal Público</h1>
          <p className="text-zinc-400 text-sm mt-1">Apoya directamente, contrata servicios o adquiere mercadería oficial.</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg text-right">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Total Recaudado</p>
          <p className="text-2xl font-bold text-emerald-400">${Number(artist.total_donations || 0).toFixed(2)}</p>
        </div>
      </header>

      {/* FORMULARIO DE ACCIÓN DE DONACIÓN */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-emerald-400">Enviar un Aporte al Artista</h2>
        <FormularioDonacion artistId={artist.id} />
      </section>

      {/* SECCIÓN: Donaciones Recibidas */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b border-zinc-800 pb-2 text-amber-500">Últimos Aportes del Feed</h2>
        {donations && donations.length > 0 ? (
          <div className="space-y-2">
            {donations.map((donation) => (
              <div key={donation.id} className="bg-zinc-900 p-4 rounded-lg border border-zinc-800 flex justify-between items-center">
                <div>
                  <p className="font-medium text-white">{donation.donor_name || "Donador Anónimo"}</p>
                  <p className="text-xs text-zinc-500">{donation.message || "Sin mensaje."}</p>
                </div>
                <span className="text-lg font-bold text-emerald-400">
                  +${Number(donation.amount).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-500 text-sm">No se registran donaciones en el historial.</p>
        )}
      </section>

      {/* SECCIÓN: Servicios Disponibles */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b border-zinc-800 pb-2 text-amber-500">Contratar Servicios</h2>
        {services && services.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {services.map((service) => (
              <div key={service.id} className="bg-zinc-900 p-5 rounded-lg border border-zinc-800 flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white">{service.title}</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">{service.description}</p>
                </div>
                <div className="flex flex-col items-end space-y-2 ml-4">
                  <span className="text-base font-bold text-emerald-400 whitespace-nowrap">
                    {service.currency === "PEN" ? "S/." : "$"} {Number(service.price).toFixed(2)}
                  </span>
                  <AccionPublica 
                    itemId={service.id} 
                    tipo="servicio" 
                    itemTitle={service.title}
                    itemPrice={Number(service.price)}
                    itemCurrency={service.currency}
                    artistId={artist.id}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-500 text-sm">No hay servicios profesionales disponibles en este momento.</p>
        )}
      </section>

      {/* SECCIÓN: Tienda Oficial (Merch) */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b border-zinc-800 pb-2 text-amber-500">Tienda de Productos</h2>
        {merchItems && merchItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {merchItems.map((item) => (
              <div key={item.id} className="bg-zinc-900 p-5 rounded-lg border border-zinc-800 flex justify-between items-center">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white">{item.title}</h3>
                  <p className="text-xs text-zinc-400">{item.description}</p>
                  <p className="text-[11px] text-zinc-500">Disponibles: {item.stock} uds.</p>
                </div>
                <div className="flex flex-col items-end space-y-2 ml-4">
                  <span className="text-base font-bold text-emerald-400 whitespace-nowrap">
                    {item.currency === "PEN" ? "S/." : "$"} {Number(item.price).toFixed(2)}
                  </span>
                  <AccionPublica 
                    itemId={item.id} 
                    tipo="merch" 
                    stockActual={item.stock} 
                    itemTitle={item.title}
                    itemPrice={Number(item.price)}
                    itemCurrency={item.currency}
                    artistId={artist.id}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-500 text-sm">No hay productos en stock Layos actualmente.</p>
        )}
      </section>
    </div>
  );
}