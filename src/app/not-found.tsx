import Link from "next/link";
import { Compass } from "lucide-react";

export const runtime = "edge";

/**
 * 404.
 *
 * Bilingual and useful rather than a dead end: it offers the five primary
 * destinations instead of only saying "not found".
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-5 text-center">
      <p className="display-latin text-xs tracking-[0.4em] text-ink-3">404</p>
      <h1 className="display-arabic mt-4 text-3xl font-bold text-gold-light">
        هذه الصفحة ليست هنا
      </h1>
      <p className="mt-3 leading-relaxed text-gold-muted/70">
        Perhaps the path was mistyped, or the page has moved.
      </p>

      <ul className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
        {[
          { href: "/", ar: "البداية", en: "Home" },
          { href: "/enter", ar: "المدخل", en: "Enter" },
          { href: "/dialogue", ar: "الحوار", en: "Dialogue" },
          { href: "/wisdom", ar: "الحكمة", en: "Wisdom" },
          { href: "/journal", ar: "المفكرة", en: "Journal" },
        ].map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex items-center gap-2 rounded-full border border-gold/25 px-4 py-2 text-sm text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light"
            >
              <Compass className="size-3.5" aria-hidden="true" />
              <span className="display-arabic">{l.ar}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
