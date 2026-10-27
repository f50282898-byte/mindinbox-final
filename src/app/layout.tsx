export const runtime = 'edge';

import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Amiri, Cinzel, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import "./studio.css";
import { ShellChrome } from "@/components/ShellChrome";
import { AppShell } from "@/components/AppShell";
import { Shortcuts } from "@/components/Shortcuts";
import { ThemeColorUpdater } from "@/components/ThemeColorUpdater";
import { ThemeProvider, THEME_BOOTSTRAP_SCRIPT } from "@/components/ThemeProvider";
import { AmbientAudioToggle } from "@/components/audio/AmbientAudioToggle";
import { LocaleProvider, LOCALE_BOOTSTRAP_SCRIPT } from "@/lib/i18n";
import { ShellProvider } from "@/lib/shell-config";
import { SITE_URL } from "@/lib/seo";
import { ViewTransitions } from "@/components/ViewTransitions";
import { AuthProvider } from "@/lib/auth/AuthContext";


/*
  Three faces, each with one job.

  `next/font/google` rather than a `<link>` to fonts.googleapis.com: the font files
  are fetched and self-hosted at build time, so the render never waits on a third
  party, there is no third-party request to leak a visitor to, and `font-display:
  swap` is applied per family instead of by a query string.

  Every family exposes a CSS variable rather than a `className`, because the token
  indirection already exists — `globals.css` reads `--font-ui` / `--font-display-ar`
  / `--font-display-lat` — and mapping the variables here keeps one source of truth
  for "which face is this" instead of two.
*/
const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  variable: "--font-amiri",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cinzel",
  display: "swap",
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
  manifest: "/favicon/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon/favicon.ico", sizes: "any" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
    { media: "(prefers-color-scheme: light)", color: "#f8f4e8" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /*
    The nonce, read from the header `middleware.ts` set.

    Two inline bootstrap scripts run before first paint — the theme and the text
    direction — and without a nonce on them the strict CSP blocks them. The result
    would be a page that flashes light mode and left-to-right text before
    correcting itself, which is worse than either bug alone.

    `headers()` makes this layout dynamic. That is the cost of a nonce-based policy,
    and it is the right trade: the alternative is `'unsafe-inline'`, which lets any
    injected script run. Marked `async` because reading headers is async.
  */
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="ar"
      dir="rtl"
      // `dark` is the default; the Parchment theme is opt-in via [data-theme="light"].
      data-theme="dark"
      suppressHydrationWarning
      className={`${amiri.variable} ${plexArabic.variable} ${cinzel.variable}`}
    >
      <head>
        <meta name="view-transition" content="same-origin" />
        {/*
          Both bootstraps run before first paint so neither the theme nor the
          text direction flashes. Kept as inline strings rather than components
          because a <script> in the body would run after hydration.

          `nonce` is what lets them run at all under `script-src 'nonce-…'`.
        */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: LOCALE_BOOTSTRAP_SCRIPT }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
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
              <AuthProvider>
                <ShellChrome>
                  {/* AppShell owns the paywall Gate, telemetry and overlays. */}
                  <AppShell>
                    <Shortcuts />
                    <ThemeColorUpdater />
                    <ViewTransitions />
                    {/*
                      Inside the app shell, so the toggle is never rendered while a
                      paywall gate or a dialog owns the screen. It is fixed-position
                      and self-dismissing; it holds no state the tree needs.
                    */}
                    <AmbientAudioToggle />
                    {/*
                      `.shell-content` insets the content past the fixed rail on
                      desktop; see the comment on that rule in globals.css for
                      why it is CSS and not a Tailwind arbitrary value.

                      No `<main>` here. `ShellChrome` above owns the single main
                      landmark in both of its branches, so wrapping the children
                      again produced two `<main id="main">` on every route with
                      chrome, and made the skip-link target ambiguous.
                    */}
                    {children}
                  </AppShell>
                </ShellChrome>
              </AuthProvider>
            </ShellProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
