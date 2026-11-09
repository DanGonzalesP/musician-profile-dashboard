import LayoutAdmin from "@/components/LayoutAdmin";
import MusicFeedForm from "@/components/music-feed-form";

export const metadata = {
  title: "Administrar Feed de Música",
};

export default function AdminMusicaPage() {
  return (
    <LayoutAdmin>
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Feed de Música</h1>
        <p className="mb-6 text-sm text-muted-foreground">Publica enlaces directos a tus canciones y administra las que aparecen en el feed. Puedes buscar las cargadas y consultar publicaciones anteriores.</p>
        <MusicFeedForm />
      </div>
    </LayoutAdmin>
  );
}
