import { UtopiaUI } from "@/components/UtopiaUI";

export const runtime = "edge";

export default function UtopiaPage() {
  return (
    <main className="relative h-screen w-full overflow-hidden bg-obsidian">
      <UtopiaUI />
    </main>
  );
}
