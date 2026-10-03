import type { Metadata, Viewport } from "next";
import { Amiri, Cairo, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ShellChrome } from "@/components/ShellChrome";
import { AppShell } from "@/components/AppShell";
import { Shortcuts } from "@/components/Shortcuts";
import { ThemeProvider, THEME_BOOTSTRAP_SCRIPT } from "@/components/ThemeProvider";
import { LocaleProvider, LOCALE_BOOTSTRAP_SCRIPT } from "@/lib/i18n";
import { ShellProvider } from "@/lib/shell-config";
import { SITE_URL } from "@/lib/seo";

/* ── fonts ─────────────────────────────────────────────────────────────────
   next/font self-hosts these at build time: no Google request at runtime,
   no layout shift from a late font swap, and `display: swap` keeps text
   readable while the face loads. Subsets are declared per script so Arabic
   glyphs are actually shipped rather than silently falling back.
   -------------------------------------------------------------------------- */

// Latin philosophical display — Playfair Display
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-playfair",
});

// Arabic + Latin UI face — Cairo
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-cairo",
});

// Arabic naskh display face — Amiri (philosophical headings)
const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-amiri",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "عقل في صندوق | Mind in a Box",
    template: "%s | عقل في صندوق",
  },
  description:
    "ملاذك الفلسفي للذكاء الاصطناعي. اسأل، تأمّل، وابنِ وعيك — في بيئة معزولة عن ضجيج العالم.",
  applicationName: "عقل في صندوق",
  keywords: [
    "فلسفة",
    "ذكاء اصطناعي",
    "تأمل",
    "وعي",
    "مفكرة",
    "AI philosophy",
    "philosophy",
    "reflection",
  ],
  authors: [{ name: "عقل في صندوق" }],
  alternates: {
    canonical: "/",
    languages: { ar: "/", en: "/" },
  },
  openGraph: {
    type: "website",
    locale: "ar_AR",
    alternateLocale: ["en_US"],
    url: SITE_URL,
    siteName: "عقل في صندوق",
    title: "عقل في صندوق | Mind in a Box",
    description: "ملاذك الفلسفي للذكاء الاصطناعي، في بيئة معزولة عن ضجيج العالم.",
    // Static, artwork-derived. Deliberately not next/og: Arabic glyph joining
    // in Satori-style rasterisers is unverified, and a broken word in a social
    // preview is worse than no rendered text at all.
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "عقل في صندوق" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "عقل في صندوق | Mind in a Box",
    description: "ملاذك الفلسفي للذكاء الاصطناعي، في بيئة معزولة عن ضجيج العالم.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
    { media: "(prefers-color-scheme: light)", color: "#f4efe4" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      // `dark` is the default; the Parchment theme is opt-in via [data-theme="light"].
      data-theme="dark"
      className={`${cairo.variable} ${playfair.variable} ${amiri.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Both bootstraps run before first paint so neither the theme nor the
          text direction flashes. Kept as inline strings rather than components
          because a <script> in the body would run after hydration.
        */}
        <script dangerouslySetInnerHTML={{ __html: LOCALE_BOOTSTRAP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      {/*
        No `bg-volcanic` / `text-gold-muted` here on purpose. Tailwind
        utilities live in the `utilities` layer and would beat the
        `body { background-color: var(--bg-0); color: var(--text-2) }` rule in
        `base`, pinning the page to dark and making the Parchment theme
        unreachable. Both colours come from the token layer only.
      */}
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only skip-link">
          تخطَّ إلى المحتوى
        </a>
        <ThemeProvider>
          <LocaleProvider>
            <ShellProvider>
              <ShellChrome>
                {/* AppShell owns auth, the paywall Gate, telemetry and overlays. */}
                <AppShell>
                  <Shortcuts />
                  {/*
                    `.shell-content` insets the content past the fixed rail on
                    desktop; see the comment on that rule in globals.css for
                    why it is CSS and not a Tailwind arbitrary value.
                  */}
                  <main id="main" className="shell-content min-h-screen pb-24 md:pb-0">
                    {children}
                  </main>
                </AppShell>
              </ShellChrome>
            </ShellProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
