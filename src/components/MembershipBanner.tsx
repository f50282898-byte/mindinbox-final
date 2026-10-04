"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { db, paths } from "@/lib/firebase";
import { useAppStore } from "@/lib/store";

interface BannerContent {
  headline: string;
  detail: string;
  href: string;
}

/** Shipped defaults; the Admin Console may override via `siteConfig/ads`. */
const FALLBACK: BannerContent[] = [
  {
    headline: "خمسة أسئلة تفصل بين السائل والعبث.",
    detail: "العضوية تفتح التتبّع غير المحدود وتحليل الفيلسوف اليومي.",
    href: "/membership",
  },
  {
    headline: "العادات تُبنى في الصمت، لا أمام الحضور.",
    detail: "ارسم بيانيك الذهبي اليوم، واقرأ انحسارك الأسبوعي.",
    href: "/tracker",
  },
  {
    headline: "المحراب أربعة عشر مقعداً.",
    detail: "محاضرات بإطارات ذهبية، وتحليل نفسي عميق لنمط تفكيرك.",
    href: "/sanctum",
  },
];

/** Rotation period: every three days, anchored to an epoch bucket. */
const ROTATION_MS = 3 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = "miab_ad_cycle";
const DISMISS_KEY = "miab-ad-dismissed";

function currentCycle(now: number): number {
  return Math.floor(now / ROTATION_MS);
}

/**
 * Internal upgrade banner.
 *
 * Rebuild of the previous engine, which depended on CSS class names that no
 * longer existed (`.membership-note`) and therefore rendered unstyled.
 * Rotation is derived from a time bucket rather than a counter so every
 * visitor sees the same message for the same three-day window.
 */
export function MembershipBanner() {
  const tier = useAppStore((s) => s.tier);
  const pathname = usePathname();
  const [items, setItems] = useState<BannerContent[]>(FALLBACK);
  const [dismissedCycle, setDismissedCycle] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  const cycle = useMemo(() => currentCycle(Date.now()), []);

  // The landing page is a cinematic single-call-to-action surface, the chat
  // surface owns a full-width composer, and the membership page *is* the pitch.
  // An upgrade card floating over any of them adds nothing and covers content.
  // On `/wisdom` the Gate is the conversion moment.
  const suppressed =
    pathname === "/" ||
    pathname === "/wisdom" ||
    // `/dialogue` for the same reason as `/wisdom`: it ends in a primary CTA
    // ("ابدأ الحوار") that sits low on a short page, and a fixed overlay lands
    // squarely on it. Playwright caught this by reporting that the banner
    // "intercepts pointer events" — a real visitor on a phone could not have
    // started the dialogue either.
    pathname === "/dialogue" ||
    pathname === "/membership" ||
    pathname?.startsWith("/admin");

  useEffect(() => {
    if (suppressed) return;
    setMounted(true);
    try {
      setDismissedCycle(Number(sessionStorage.getItem(DISMISS_KEY)));
    } catch {
      // Private mode: treat as not dismissed.
    }

    // Keep the cookie bucket in sync so the dismissal survives reloads.
    document.cookie = `${COOKIE_NAME}=${cycle}; Max-Age=${Math.floor(
      ROTATION_MS / 1000
    )}; Path=/; SameSite=Lax`;

    if (!db) return;
    return onSnapshot(
      doc(db, paths.adsDoc),
      (snapshot) => {
        const configured = snapshot.data()?.items;
        if (!Array.isArray(configured)) return;
        const valid = configured.filter(
          (item): item is BannerContent =>
            typeof item?.headline === "string" &&
            typeof item?.detail === "string" &&
            typeof item?.href === "string"
        );
        if (valid.length) setItems(valid);
      },
      () => undefined
    );
  }, [cycle, suppressed]);

  const visible =
    !suppressed && mounted && tier === "free" && dismissedCycle !== cycle && items.length > 0;
  const active = visible ? items[cycle % items.length] : null;

  const dismiss = () => {
    setDismissedCycle(cycle);
    try {
      sessionStorage.setItem(DISMISS_KEY, String(cycle));
    } catch {
      // Non-fatal.
    }
  };

  return (
    <AnimatePresence>
      {active && (
        <motion.aside
          key={`${cycle}-${active.headline}`}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          aria-label="رسالة العضوية"
          /*
           * Sits ABOVE the mobile bottom bar, never on it.
           *
           * `bottom-4` at z-70 put this 92vw panel directly over the fixed
           * 5-item navigation (bottom-0, z-40). At 360px it covered the entire
           * bar and swallowed every tap on it — the "More" trigger could not be
           * clicked at all, which made the primary navigation unusable.
           *
           * `bottom-20` clears the bar and its safe-area inset; `md:bottom-6`
           * restores the original offset where there is no bar, and `md:ms`
           * clears the desktop rail.
           */
          className="glass-strong fixed bottom-20 start-4 z-[70] flex w-[min(92vw,26rem)] items-start gap-3 rounded-2xl p-4 ps-16 md:bottom-6 md:ms-[6.5rem]"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[9px] tracking-[0.32em] text-ink-3">A NOTE ON MEMBERSHIP</p>
            <p className="display-arabic mt-1.5 text-base leading-snug text-gold-light">
              {active.headline}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-gold-muted/70">{active.detail}</p>
            <Link
              href={active.href}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-gold transition-colors hover:text-gold-light"
            >
              <span>اعرف المزيد</span>
              <span aria-hidden="true">↗</span>
            </Link>
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="إخفاء الرسالة"
            className="absolute start-3 top-3 rounded-full p-1.5 text-ink-3 transition-colors hover:text-gold"
          >
            <X className="size-4" />
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}