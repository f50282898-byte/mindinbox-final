import { InternalAdEngine } from "@/components/InternalAdEngine";
export const runtime = 'edge';

export default function OraclePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-obsidian text-gold-muted p-10 pt-24">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 font-serif text-5xl text-gold">العرّاف (The Oracle)</h1>
        <p className="mb-12 text-lg text-gold-muted/80">
          تحليل فلسفي ونفسي عميق لبياناتك اليومية.
        </p>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Feature 1 */}
          <div className="gold-glow rounded-xl border border-gold/20 bg-[#121212] p-8">
            <h2 className="mb-4 text-2xl text-gold-light">الفيلسوف اليومي</h2>
            <p className="text-sm leading-relaxed text-gold-muted/70">
              يقرأ الذكاء الاصطناعي مدخلات يومك، ويقدم لك تقريراً يعكس صدى أفكارك كما لو كان دوستويفسكي يحلل شخصيتك.
            </p>
            <button className="mt-6 w-full rounded-full border border-gold/50 py-3 text-sm text-gold hover:bg-gold/10 transition">
              استخراج تقرير اليوم
            </button>
          </div>

          {/* Feature 2 */}
          <div className="gold-glow rounded-xl border border-gold/20 bg-[#121212] p-8">
            <h2 className="mb-4 text-2xl text-gold-light">مكتبة الحكمة</h2>
            <p className="text-sm leading-relaxed text-gold-muted/70">
              وصول حصري إلى ملفات PDF مصممة بعناية تحتوي على اقتباسات وتأملات فلسفية نادرة.
            </p>
            <button className="mt-6 w-full rounded-full border border-gold/50 py-3 text-sm text-gold hover:bg-gold/10 transition">
              تحميل المخطوطات
            </button>
          </div>
        </div>
      </div>
      <InternalAdEngine />
    </main>
  );
}
