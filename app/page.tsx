import { MainHero } from "@/components/MainHero";

export const runtime = 'edge';

export default function Home() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-obsidian text-gold-muted">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.18),_transparent_30%)]" />
      <MainHero />
    </main>
  );
}
