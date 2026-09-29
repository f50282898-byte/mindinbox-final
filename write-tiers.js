const fs = require('fs');

const internalAdEngine = `"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { X } from "lucide-react";

export function InternalAdEngine() {
  const [isVisible, setIsVisible] = useState(false);
  const [adMessage, setAdMessage] = useState("");
  const { subscriptionTier } = useAppStore();

  useEffect(() => {
    // Only show ads to free users
    if (subscriptionTier !== 'free') return;

    const ads = [
      "عقول العظماء لا تنتظر أحداً. ارتقِ إلى طبقة 'العرّاف' (Oracle) الآن.",
      "الحكمة العميقة تتطلب التزاماً حقيقياً. افتح أبواب 'المحراب' (Sanctum) واكتشف ما وراء الحجاب.",
      "ما الفائدة من البصيرة إن لم تحولها إلى واقع؟ اكتشف التحليل الفلسفي اليومي الآن."
    ];

    const lastSeen = localStorage.getItem('lastAdSeen');
    const now = new Date().getTime();
    
    // Rotate every 3 days (3 * 24 * 60 * 60 * 1000)
    // For demo purposes, we'll show it if it hasn't been seen today
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    
    if (!lastSeen || now - parseInt(lastSeen) > THREE_DAYS) {
      const adIndex = Math.floor(now / THREE_DAYS) % ads.length;
      setAdMessage(ads[adIndex]);
      
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 5000); // Show after 5 seconds of loading the app
      
      return () => clearTimeout(timer);
    }
  }, [subscriptionTier]);

  const closeAd = () => {
    setIsVisible(false);
    localStorage.setItem('lastAdSeen', new Date().getTime().toString());
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-6 right-6 z-[50] max-w-sm rounded-lg border border-gold/30 bg-obsidian p-5 shadow-2xl"
        >
          <button onClick={closeAd} className="absolute top-2 left-2 text-gold-muted hover:text-gold">
            <X className="h-4 w-4" />
          </button>
          <p className="mt-2 text-sm font-serif leading-relaxed text-gold-light">
            {adMessage}
          </p>
          <button className="mt-4 w-full rounded border border-gold bg-gold/10 px-4 py-2 text-xs font-bold text-gold transition hover:bg-gold hover:text-obsidian">
            استكشف العضويات المتقدمة
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
`;

const oraclePage = `import { InternalAdEngine } from "@/components/InternalAdEngine";
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
`;

const sanctumPage = `import { InternalAdEngine } from "@/components/InternalAdEngine";
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
`;

fs.mkdirSync('components', { recursive: true });
fs.writeFileSync('components/InternalAdEngine.tsx', internalAdEngine, 'utf8');

fs.mkdirSync('app/oracle', { recursive: true });
fs.writeFileSync('app/oracle/page.tsx', oraclePage, 'utf8');

fs.mkdirSync('app/sanctum', { recursive: true });
fs.writeFileSync('app/sanctum/page.tsx', sanctumPage, 'utf8');
