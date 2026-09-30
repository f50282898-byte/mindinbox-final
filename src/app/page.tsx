import { UtopiaHero } from "@/components/UtopiaHero";

export const runtime = "edge";

export default function Home() {
  return (
    <main className="bg-black">
      <UtopiaHero />
    </main>
  );
}
