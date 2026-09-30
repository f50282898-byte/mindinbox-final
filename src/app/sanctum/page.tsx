import Link from "next/link";
import { PremiumContentShield } from "@/components/PremiumContentShield";

export const runtime = "edge";

export default function SanctumPage() {
  return (
    <PremiumContentShield>
      <main className="relative flex min-h-screen items-center justify-center bg-black overflow-hidden p-6">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_rgba(212,175,55,0.08)_0%,_#000_80%)]" />
        <div className="z-10 w-full max-w-4xl text-center gold-glow rounded-3xl border border-gold/30 bg-[#0a0a0a] p-8 md:p-16 backdrop-blur-xl">
          <h1 className="gold-text-glow font-serif text-4xl text-gold-light md:text-6xl">المحراب (The Sanctum)</h1>
          <p className="mt-6 text-lg leading-relaxed text-gold-muted/80">
            أنت الآن في المحراب. الطبقة العليا من العقول المشتركة.
            <br/>
            استكشف الجلسات الحصرية (Masterclasses) ونقاشات مجتمع النخبة.
          </p>
          
          <div className="mt-12 aspect-video w-full rounded-2xl border-2 border-gold/20 bg-black flex items-center justify-center text-gold-muted/50 overflow-hidden relative">
            <div className="absolute inset-0 bg-[url('/temple.jpg')] bg-cover bg-center opacity-10 mix-blend-screen" style={{ filter: 'invert(1) sepia(1)' }} />
            <span>[YouTube Masterclass Embed Placeholder]</span>
          </div>

          <div className="mt-10 flex justify-center">
            <Link href="/utopia" className="rounded-full border border-gold/50 px-8 py-3 text-gold transition hover:bg-gold/10">
              العودة للمدينة الفاضلة
            </Link>
          </div>
        </div>
      </main>
    </PremiumContentShield>
  );
}
