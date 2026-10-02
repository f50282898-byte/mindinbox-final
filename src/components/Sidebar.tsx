"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BookOpen,
  Crown,
  Home,
  LogIn,
  LogOut,
  Menu,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { useAppStore } from "@/lib/store";
import { TIER_ORDER, tierSatisfies, type Tier } from "@/lib/tiers";
import { signOut } from "firebase/auth";

interface NavItem {
  name: string;
  href: string;
  icon: typeof Home;
  /** Minimum tier required to see this entry. */
  requires: Tier;
}

const NAV_ITEMS: NavItem[] = [
  { name: "ابدأ الآن", href: "/", icon: Home, requires: "free" },
  { name: "اسأل الحكيم", href: "/wisdom", icon: Sparkles, requires: "free" },
  { name: "متتبع الوعي", href: "/tracker", icon: Activity, requires: "free" },
  { name: "العرّاف", href: "/oracle", icon: Crown, requires: "oracle" },
  { name: "المحراب", href: "/sanctum", icon: BookOpen, requires: "sanctum" },
];

const TIER_LABEL: Record<Tier, string> = {
  free: "زائر",
  oracle: "العرّاف",
  sanctum: "المحراب",
};

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const tier = useAppStore((s) => s.tier);
  const uid = useAppStore((s) => s.uid);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer covers the screen.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const handleSignOut = async () => {
    if (!auth) return;
    await signOut(auth);
    useAppStore.getState().reset();
    setMobileOpen(false);
  };

  return (
    <>
      {/* ── Mobile: frosted trigger ─────────────────────────────── */}
      <button
        type="button"
        aria-label={mobileOpen ? "أغلق القائمة" : "افتح القائمة"}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((v) => !v)}
        className="glass-strong fixed end-3 top-3 z-[60] rounded-full p-3 text-gold-light md:hidden"
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 md:hidden"
          >
            <button
              type="button"
              aria-label="إغلاق القائمة"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 h-full w-full bg-volcanic/90 backdrop-blur-2xl"
            />
            <motion.nav
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="glass-strong relative mx-4 mt-20 rounded-3xl p-5"
            >
              <p className="display-arabic mb-5 text-center text-lg text-gold-muted">
                عقل في صندوق
              </p>
              <ul className="flex flex-col gap-1.5">
                {NAV_ITEMS.map((item) => (
                  <li key={item.href}>
                    <MobileRow
                      item={item}
                      active={isActive(item.href)}
                      unlocked={tierSatisfies(tier, item.requires)}
                      onNavigate={() => setMobileOpen(false)}
                    />
                  </li>
                ))}
              </ul>
              <div className="hairline my-4" />
              <AuthRow uid={uid} onSignOut={handleSignOut} />
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Desktop: hover/click expanding rail ──────────────────── */}
      <motion.nav
        initial={false}
        animate={{ width: desktopOpen ? 264 : 76 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        onMouseEnter={() => setDesktopOpen(true)}
        onMouseLeave={() => setDesktopOpen(false)}
        aria-label="التنقل الرئيسي"
        className="glass-strong fixed inset-y-0 end-0 z-40 hidden flex-col border-s border-gold/10 md:flex"
      >
        <div className="flex min-h-0 flex-1 flex-col py-6">
          <Wordmark expanded={desktopOpen} />

          <ul className="mt-8 flex min-h-0 flex-1 flex-col gap-1.5 px-3">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <DesktopRow
                  item={item}
                  active={isActive(item.href)}
                  expanded={desktopOpen}
                  unlocked={tierSatisfies(tier, item.requires)}
                />
              </li>
            ))}
          </ul>

          <div className="px-3">
            <div className="hairline mb-4" />
            <AuthRow uid={uid} expanded={desktopOpen} onSignOut={handleSignOut} />
            <TierBadge expanded={desktopOpen} tier={tier} />
          </div>
        </div>
      </motion.nav>
    </>
  );
}

function Wordmark({ expanded }: { expanded: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3">
      <Link
        href="/"
        className="gold-glow flex size-11 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-black text-gold-light transition-colors hover:border-gold/70"
        aria-label="عقل في صندوق — الصفحة الرئيسية"
      >
        <span className="display-arabic text-xl font-bold leading-none">ع</span>
      </Link>
      <AnimatePresence>
        {expanded && (
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.25 }}
            className="display-arabic whitespace-nowrap text-lg text-gold-light"
          >
            عقل في صندوق
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

interface RowProps {
  item: NavItem;
  active: boolean;
  unlocked: boolean;
}

function DesktopRow({ item, active, expanded, unlocked }: RowProps & { expanded: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={unlocked ? item.name : `${item.name} — يتطلب مستوى أعلى`}
      className={`group relative flex items-center gap-4 rounded-xl px-3 py-3 transition-colors duration-300 ${
        active ? "bg-gold/10 text-gold-light" : "text-gold-muted hover:bg-gold/5 hover:text-gold"
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-gold"
          transition={{ duration: 0.3 }}
        />
      )}
      <span className="relative shrink-0">
        <item.icon
          className={`size-5 transition-all ${
            active ? "text-gold-light drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]" : ""
          }`}
        />
        {!unlocked && (
          <span className="absolute -end-1.5 -top-1 size-2 rounded-full border border-gold/60 bg-volcanic" />
        )}
      </span>
      <AnimatePresence>
        {expanded && (
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className="display-arabic whitespace-nowrap text-base"
          >
            {item.name}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}

function MobileRow({ item, active, unlocked, onNavigate }: RowProps & { onNavigate: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between rounded-2xl px-4 py-3.5 transition-colors ${
        active ? "bg-gold/15 text-gold-light" : "text-gold-muted hover:bg-gold/5"
      }`}
    >
      <span className="display-arabic flex items-center gap-3 text-lg">
        <item.icon className="size-5" />
        {item.name}
      </span>
      {!unlocked && <span className="size-1.5 rounded-full bg-gold/50" />}
    </Link>
  );
}

function AuthRow({
  uid,
  expanded = true,
  onSignOut,
}: {
  uid: string | null;
  expanded?: boolean;
  onSignOut: () => void;
}) {
  if (!uid) {
    return (
      <Link
        href="/membership"
        className="btn-ghost w-full justify-center gap-2 text-sm"
        title="العضوية"
      >
        <LogIn className="size-4" />
        {expanded && <span>العضوية</span>}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onSignOut}
      title="تسجيل الخروج"
      className="btn-ghost w-full justify-center gap-2 text-sm"
    >
      <LogOut className="size-4" />
      {expanded && <span>خروج</span>}
    </button>
  );
}

function TierBadge({ expanded, tier }: { expanded: boolean; tier: Tier }) {
  const rank = TIER_ORDER[tier];
  return (
    <div className="mt-4 hidden justify-center md:flex">
      {expanded ? (
        <span className="chip chip-active">
          <Crown className="size-3" />
          {TIER_LABEL[tier]}
          {rank > 0 && <span className="opacity-60">· عضو</span>}
        </span>
      ) : (
        <span
          className="size-2 rounded-full"
          style={{
            background: rank > 0 ? "#D4AF37" : "rgba(212,175,55,0.25)",
            boxShadow: rank > 0 ? "0 0 8px rgba(212,175,55,0.8)" : "none",
          }}
          title={TIER_LABEL[tier]}
        />
      )}
    </div>
  );
}