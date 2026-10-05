import { Logo } from "@/components/Logo";

export default function Loading() {
  return (
    <main
      className="flex min-h-[60vh] items-center justify-center"
      role="status"
      aria-label="جارٍ التحميل"
    >
      <Logo size={64} />
    </main>
  );
}
