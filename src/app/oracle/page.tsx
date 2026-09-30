import Link from "next/link";
import { PremiumContentShield } from "@/components/PremiumContentShield";

export const runtime = "edge";

export default function OraclePage() {
  return (
    <PremiumContentShield>
      <main className="relative flex min-h-screen items-center justify-center bg-black overflow-hidden p-6">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_rgba(212,175,55,0.05)_0%,_#000_70%)]" />
        <div className="z-10 max-w-2xl text-center gold-glow rounded-3xl border border-gold/20 bg-[#0a0a0a] p-12 backdrop-blur-xl">
          <h1 className="gold-text-glow font-serif text-4xl text-gold-light md:text-5xl">العرّاف (The Oracle)</h1>
          <p className="mt-6 text-lg leading-relaxed text-gold-muted/80">
            مرحباً بك في مستوى العرّاف. هنا يتم تحليل أفكارك اليومية وتقديم تقارير نفسية وفلسفية عميقة تعكس صدى وعيك.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row justify-center">
            <button className="rounded-full bg-gold px-8 py-3 text-black font-bold transition hover:bg-gold-light">
              استخراج تقرير اليوم
            </button>
            <Link href="/utopia" className="rounded-full border border-gold/50 px-8 py-3 text-gold transition hover:bg-gold/10">
              العودة للمدينة الفاضلة
            </Link>
          </div>
        </div>
      </main>
    </PremiumContentShield>
  );
}
