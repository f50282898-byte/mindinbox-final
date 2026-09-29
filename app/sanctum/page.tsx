import { InternalAdEngine } from "@/components/InternalAdEngine";
export const runtime = 'edge';

export default function SanctumPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-obsidian text-gold-muted p-10 pt-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <h1 className="mb-4 font-serif text-5xl text-gold">المحراب (The Sanctum)</h1>
          <p className="text-lg text-gold-muted/80">
            النخبة فقط. وصول غير مقيد للعقول العظيمة، ومجتمع النخبة.
          </p>
        </div>

        <div className="grid gap-12 md:grid-cols-[1fr_300px]">
          {/* Main Content: Video Masterclasses */}
          <div className="space-y-8">
            <h2 className="text-3xl text-gold-light border-b border-gold/20 pb-4">الجلسات الحصرية (Masterclasses)</h2>
            <div className="aspect-video w-full rounded-2xl border-2 border-gold/30 bg-black overflow-hidden gold-glow">
              <div className="flex h-full items-center justify-center text-gold/50">
                [YouTube Embed Placeholder - Masterclass 1]
              </div>
            </div>
            <p className="text-gold-muted/80 leading-relaxed">
              تحليل كتاب "الجريمة والعقاب" من منظور الذكاء الاصطناعي وبناء العادات.
            </p>
          </div>

          {/* Sidebar: Elite Community */}
          <div className="space-y-6">
            <div className="rounded-xl border border-gold/20 bg-[#121212] p-6 gold-glow">
              <h3 className="mb-4 text-xl text-gold">مجتمع المحراب</h3>
              <ul className="space-y-4 text-sm text-gold-muted/70">
                <li className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  أفلاطون_99 (متصل)
                </li>
                <li className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  باحث_الحقيقة (متصل)
                </li>
                <li className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-gold/20" />
                  المتأمل (غائب)
                </li>
              </ul>
              <button className="mt-6 w-full rounded border border-gold/50 bg-gold/5 py-2 text-gold transition hover:bg-gold/20">
                دخول النقاش الفلسفي
              </button>
            </div>
          </div>
        </div>
      </div>
      <InternalAdEngine />
    </main>
  );
}
