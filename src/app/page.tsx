import { LandingHero } from "@/components/LandingHero";

export const runtime = "edge";

export default function Home() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-obsidian">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.15),_transparent_40%)]" />
      <LandingHero />
    </main>
  );
}
