import Link from "next/link";
import { PremiumContentShield } from "@/components/PremiumContentShield";

export const runtime = "edge";

export default function OraclePage() {
  return (
    <PremiumContentShield>
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-black overflow-hidden p-6">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_rgba(212,175,55,0.05)_0%,_#000_70%)]" />
        
        <div className="z-10 w-full max-w-4xl space-y-8">
          <div className="text-center gold-glow rounded-3xl border border-gold/20 bg-[#0a0a0a] p-12 backdrop-blur-xl">
            <h1 className="gold-text-glow font-serif text-4xl text-gold-light md:text-5xl">العرّاف (The Oracle)</h1>
            <p className="mt-6 text-lg leading-relaxed text-gold-muted/80">
              مرحباً بك في مستوى العرّاف. لوحة التحكم الفلسفية الخاصة بك.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="gold-glow rounded-3xl border border-gold/20 bg-[#0a0a0a] p-8 backdrop-blur-xl">
              <h2 className="font-serif text-2xl text-gold-light mb-6">متتبع الأفكار اليومي</h2>
              <div className="space-y-4">
                {/* CSS Gold/Black Chart Mockup */}
                <div className="flex items-end gap-2 h-32 border-b border-gold/20 pb-2">
                  {[40, 70, 45, 90, 60, 80, 50].map((h, i) => (
                    <div key={i} className="flex-1 bg-gold hover:bg-gold-light transition-all rounded-t-sm" style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gold-muted">
                  <span>السبت</span><span>الأحد</span><span>الاثنين</span><span>الثلاثاء</span><span>الأربعاء</span><span>الخميس</span><span>الجمعة</span>
                </div>
              </div>
            </div>

            <div className="gold-glow rounded-3xl border border-gold/20 bg-[#0a0a0a] p-8 backdrop-blur-xl flex flex-col justify-between">
              <div>
                <h2 className="font-serif text-2xl text-gold-light mb-4">المخطوطات (PDFs)</h2>
                <p className="text-gold-muted/80 mb-6">حمّل تقارير التحليل النفسي الخاصة بك والمستندات الفلسفية الحصرية.</p>
              </div>
              <button className="w-full rounded-xl bg-gold/10 border border-gold/50 px-6 py-4 text-gold hover:bg-gold hover:text-black transition-all">
                تحميل المخطوطة الأخيرة (PDF)
              </button>
            </div>
          </div>
        </div>
      </main>
    </PremiumContentShield>
  );
}
