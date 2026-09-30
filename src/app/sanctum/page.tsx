import Link from "next/link";
import { PremiumContentShield } from "@/components/PremiumContentShield";

export const runtime = "edge";

export default function SanctumPage() {
  return (
    <PremiumContentShield>
      <main className="relative flex min-h-screen flex-col items-center py-20 px-6 bg-black overflow-hidden">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_rgba(212,175,55,0.08)_0%,_#000_80%)]" />
        
        <div className="z-10 w-full max-w-5xl space-y-12">
          <div className="text-center gold-glow rounded-3xl border border-gold/30 bg-[#0a0a0a] p-12 md:p-16 backdrop-blur-xl">
            <h1 className="gold-text-glow font-serif text-5xl text-gold-light md:text-7xl mb-6">المحراب</h1>
            <p className="text-xl leading-relaxed text-gold-muted/90">
              أهلاً بك في أعلى درجات الوعي. (The Sanctum)
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Masterclass Video */}
            <div className="lg:col-span-2 gold-glow rounded-3xl border border-gold/40 bg-[#0a0a0a] p-2 backdrop-blur-xl relative">
              <div className="absolute -inset-1 border border-gold/20 rounded-3xl pointer-events-none" />
              <div className="aspect-video w-full rounded-2xl bg-black overflow-hidden relative border-2 border-gold/20">
                <iframe 
                  className="w-full h-full"
                  src="https://www.youtube.com/embed/dQw4w9WgXcQ" 
                  title="Masterclass Video" 
                  frameBorder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                ></iframe>
              </div>
              <div className="p-6">
                <h2 className="font-serif text-2xl text-gold-light">الجلسة الحصرية (Masterclass)</h2>
                <p className="text-gold-muted/80 mt-2">كيف تتلاعب بالواقع وتصنع واقعك الخاص - الفلسفة التطبيقية.</p>
              </div>
            </div>

            {/* AI Deep Analysis & Community */}
            <div className="space-y-8">
              <div className="gold-glow rounded-3xl border border-gold/20 bg-[#0a0a0a] p-8 backdrop-blur-xl">
                <h2 className="font-serif text-xl text-gold-light mb-4">التحليل النفسي العميق</h2>
                <p className="text-sm text-gold-muted/80 mb-6">
                  الذكاء الاصطناعي يحلل نمط تفكيرك خلال آخر 14 يوماً. أنت تميل إلى النزعة الرواقية مع لمحات من التفكير الوجودي.
                </p>
                <button className="w-full rounded-xl bg-gold text-black font-bold py-3 hover:bg-gold-light transition-all">
                  عرض التقرير المفصل
                </button>
              </div>

              <div className="gold-glow rounded-3xl border border-gold/20 bg-[#0a0a0a] p-8 backdrop-blur-xl">
                <h2 className="font-serif text-xl text-gold-light mb-4">مجتمع النخبة (Portal)</h2>
                <p className="text-sm text-gold-muted/80 mb-6">
                  تواصل مع العقول التي تشاركك نفس مستوى الوعي.
                </p>
                <button className="w-full rounded-xl border border-gold/50 bg-transparent text-gold py-3 hover:bg-gold/10 transition-all">
                  دخول البوابة
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </PremiumContentShield>
  );
}
