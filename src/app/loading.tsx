export const runtime = 'edge';

import { Logo } from "@/components/Logo";

export default function Loading() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      role="status"
      aria-label="جارٍ التحميل"
    >
      <Logo size={64} />
    </div>
  );
}
