/**
 * Navigation model — single source for the shell, sitemap and the design page.
 *
 * Reads from `siteConfig/nav` with a **static** fallback baked in below. The
 * fallback is the shipped default; the admin console will later make the
 * Firestore document authoritative and drag-to-reorder it (prompt 14).
 *
 * Because this must render identically on the server and the client, it is a
 * plain typed module with no Firestore import. `NavSource` receives the
 * resolved document; `FALLBACK_NAV` is used until one arrives.
 */

export type Locale = "ar" | "en";

export interface NavLabel {
  ar: string;
  en: string;
}

export interface NavItem {
  id: string;
  href: string;
  label: NavLabel;
  /** Short label for the mobile bottom bar. */
  short: NavLabel;
  /** Lucide icon name, resolved in the shell. */
  icon: string;
  /** Shown in the bottom bar on mobile (first 5). */
  primaryMobile?: boolean;
  /** Shown in the desktop rail (first 6). */
  primaryDesktop?: boolean;
  /** Minimum tier. */
  requires: "free" | "oracle" | "sanctum";
  /** Where this belongs in the sidebar. */
  group: NavGroupId;
}

export type NavGroupId = "practice" | "library" | "account" | "legal";

export interface NavGroup {
  id: NavGroupId;
  label: NavLabel;
}

export const NAV_GROUPS: NavGroup[] = [
  { id: "practice", label: { ar: "الممارسة", en: "Practice" } },
  { id: "library", label: { ar: "المكتبة", en: "Library" } },
  { id: "account", label: { ar: "الحساب", en: "Account" } },
  { id: "legal", label: { ar: "قانوني", en: "Legal" } },
];

/**
 * Shipped default. Ordered; the first five `primaryMobile` items become the
 * mobile bottom bar, and the rest are folded into the "More" sheet.
 *
 * Desktop rail shows the first six items with `primaryDesktop: true`.
 * Mobile bottom bar shows the first five items with `primaryMobile: true`.
 */
export const FALLBACK_NAV: NavItem[] = [
  {
    id: "wisdom",
    href: "/wisdom",
    label: { ar: "الحكمة", en: "Wisdom" },
    short: { ar: "الحكمة", en: "Wisdom" },
    icon: "Sparkles",
    primaryMobile: true,
    primaryDesktop: true,
    requires: "free",
    group: "practice",
  },
  {
    id: "dialogue",
    href: "/dialogue",
    label: { ar: "الحوار", en: "Dialogue" },
    short: { ar: "الحوار", en: "Dialogue" },
    icon: "MessagesSquare",
    primaryMobile: true,
    primaryDesktop: true,
    requires: "free",
    group: "practice",
  },
  {
    id: "journal",
    href: "/journal",
    label: { ar: "المفكرة", en: "Journal" },
    short: { ar: "المفكرة", en: "Journal" },
    icon: "NotebookPen",
    primaryMobile: true,
    primaryDesktop: true,
    requires: "free",
    group: "practice",
  },
  {
    id: "tracker",
    href: "/tracker",
    label: { ar: "المتتبع", en: "Tracker" },
    short: { ar: "المتتبع", en: "Tracker" },
    icon: "Activity",
    primaryMobile: true,
    primaryDesktop: true,
    requires: "free",
    group: "practice",
  },
  {
    id: "quotes",
    href: "/quotes",
    label: { ar: "الأقوال", en: "Quotes" },
    short: { ar: "الأقوال", en: "Quotes" },
    icon: "Quote",
    primaryMobile: true,
    primaryDesktop: true,
    requires: "free",
    group: "library",
  },
  {
    id: "paths",
    href: "/paths",
    label: { ar: "المسارات", en: "Paths" },
    short: { ar: "المسارات", en: "Paths" },
    icon: "Compass",
    primaryMobile: false,
    primaryDesktop: true,
    requires: "free",
    group: "library",
  },
  {
    id: "enter",
    href: "/enter",
    label: { ar: "المدخل", en: "Enter" },
    short: { ar: "المدخل", en: "Enter" },
    icon: "DoorOpen",
    primaryMobile: false,
    primaryDesktop: false,
    requires: "free",
    group: "practice",
  },
  {
    id: "pricing",
    href: "/pricing",
    label: { ar: "العضويات", en: "Pricing" },
    short: { ar: "العضويات", en: "Pricing" },
    icon: "Crown",
    requires: "free",
    group: "account",
  },
  {
    id: "account",
    href: "/account",
    label: { ar: "الحساب", en: "Account" },
    short: { ar: "الحساب", en: "Account" },
    icon: "User",
    requires: "free",
    group: "account",
  },
  {
    id: "privacy",
    href: "/privacy",
    label: { ar: "الخصوصية", en: "Privacy" },
    short: { ar: "الخصوصية", en: "Privacy" },
    icon: "Shield",
    requires: "free",
    group: "legal",
  },
  {
    id: "terms",
    href: "/terms",
    label: { ar: "الشروط", en: "Terms" },
    short: { ar: "الشروط", en: "Terms" },
    icon: "FileText",
    requires: "free",
    group: "legal",
  },
  {
    id: "refund",
    href: "/refund",
    label: { ar: "الاسترداد", en: "Refund" },
    short: { ar: "الاسترداد", en: "Refund" },
    icon: "Undo2",
    requires: "free",
    group: "legal",
  },
];

/** Routes that exist but must never appear in navigation or the sitemap. */
export const HIDDEN_ROUTES = ["/god-mode-admin", "/admin", "/_design"] as const;

/**
 * Routes rendered without the navigation chrome.
 *
 * The landing page is one deliberate full-bleed moment: logo, title, one button.
 * A rail beside it would fight the composition and read like a dashboard.
 */
export const CHROMELESS_ROUTES = ["/"] as const;

/**
 * Public, indexable routes used by sitemap.ts.
 *
 * `/account` is deliberately absent: it is `noindex`, disallowed in robots.txt,
 * and personal. Listing a page in the sitemap while disallowing it in robots is
 * a contradiction, and search engines resolve that unpredictably.
 */
export const INDEXABLE_ROUTES = [
  "/",
  "/enter",
  "/wisdom",
  "/dialogue",
  "/journal",
  "/tracker",
  "/paths",
  "/quotes",
  "/pricing",
  "/privacy",
  "/terms",
  "/refund",
] as const;

const TIER_RANK = { free: 0, oracle: 1, sanctum: 2 } as const;

export function navVisibleTo(items: NavItem[], tier: keyof typeof TIER_RANK): NavItem[] {
  return items.filter((item) => TIER_RANK[item.requires] <= TIER_RANK[tier]);
}

/** The five items pinned to the mobile bottom bar. */
export function mobilePrimary(items: NavItem[]): NavItem[] {
  return items.filter((i) => i.primaryMobile).slice(0, 5);
}

/** The six items shown in the desktop rail. */
export function desktopPrimary(items: NavItem[]): NavItem[] {
  return items.filter((i) => i.primaryDesktop).slice(0, 6);
}

/** Everything that does not fit the bottom bar, for the "More" sheet. */
export function mobileOverflow(items: NavItem[]): NavItem[] {
  const primary = new Set(mobilePrimary(items).map((i) => i.id));
  return items.filter((i) => !primary.has(i.id));
}

/** Everything that does not fit the desktop rail, for the "More" sheet (desktop). */
export function desktopOverflow(items: NavItem[]): NavItem[] {
  const primary = new Set(desktopPrimary(items).map((i) => i.id));
  return items.filter((i) => !primary.has(i.id));
}

export function groupItems(items: NavItem[], group: NavGroupId): NavItem[] {
  return items.filter((i) => i.group === group);
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* ── siteConfig/nav normalisation ──────────────────────────────────────── */

const ICON_ALLOWLIST = new Set([
  "Activity",
  "BookOpen",
  "Compass",
  "Crown",
  "DoorOpen",
  "FileText",
  "MessagesSquare",
  "NotebookPen",
  "Quote",
  "Shield",
  "Sparkles",
  "Undo2",
  "User",
]);

const GROUPS = new Set<NavGroupId>(["practice", "library", "account", "legal"]);

/**
 * Validate an untrusted `siteConfig/nav` payload.
 *
 * Anything malformed is dropped and the static default is used for that slot.
 * Nav is display data, never an authorisation surface, so a bad document must
 * degrade quietly rather than throw.
 */
export function normaliseNav(raw: unknown): NavItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: NavItem[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id : null;
    const href = typeof e.href === "string" ? e.href : null;
    const icon = typeof e.icon === "string" ? e.icon : null;
    const group = typeof e.group === "string" ? e.group : null;

    if (!id || !href) continue;
    // Only same-origin absolute paths; never external or protocol-relative.
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    if (HIDDEN_ROUTES.some((h) => href === h || href.startsWith(`${h}/`))) continue;

    const label = e.label as Record<string, unknown> | undefined;
    const short = e.short as Record<string, unknown> | undefined;
    const ar = typeof label?.ar === "string" ? label.ar : null;
    const en = typeof label?.en === "string" ? label.en : null;
    if (!ar || !en) continue;

    const requires = e.requires;
    const req: NavItem["requires"] =
      requires === "oracle" || requires === "sanctum" ? requires : "free";

    out.push({
      id,
      href,
      group: group && GROUPS.has(group as NavGroupId) ? (group as NavGroupId) : "practice",
      label: { ar, en },
      short: {
        ar: typeof short?.ar === "string" ? short.ar : ar,
        en: typeof short?.en === "string" ? short.en : en,
      },
      icon: icon && ICON_ALLOWLIST.has(icon) ? icon : "Sparkles",
      primaryMobile: e.primaryMobile === true,
      requires: req,
    });
  }

  return out.length ? out : null;
}