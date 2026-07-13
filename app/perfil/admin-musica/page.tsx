import LayoutAdmin from "@/components/LayoutAdmin";
import MusicFeedForm from "@/components/music-feed-form";

export const metadata = {
  title: "Administrar Feed de Música",
};

export default function AdminMusicaPage() {
  return (
    <LayoutAdmin>
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <h1 className="text-2xl font-bold text-white mb-6">Feed de Música</h1>
        <MusicFeedForm />
      </div>
    </LayoutAdmin>
  );
}
