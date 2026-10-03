import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ShellChrome } from "@/components/ShellChrome";
import { AppShell } from "@/components/AppShell";
import { Shortcuts } from "@/components/Shortcuts";
import { ThemeProvider, THEME_BOOTSTRAP_SCRIPT } from "@/components/ThemeProvider";
import { LocaleProvider, LOCALE_BOOTSTRAP_SCRIPT } from "@/lib/i18n";
import { ShellProvider } from "@/lib/shell-config";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "عقل في صندوق | Mind in a Box",
    template: "%s | عقل في صندوق",
  },
  description:
    "ملاذك الفلسفي للذكاء الاصطناعي. تفاعل مع حكماء التاريخ في بيئة معزولة عن ضجيج العالم.",
  applicationName: "عقل في صندوق",
  keywords: [
    "فلسفة",
    "عقل في صندوق",
    "تأمل",
    "وعي",
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
    description: "ملاذك الفلسفي للذكاء الاصطناعي. تفاعل مع حكماء التاريخ في بيئة معزولة عن ضجيج العالم.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "عقل في صندوق" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "عقل في صندوق | Mind in a Box",
    description: "ملاذك الفلسفي للذكاء الاصطناعي. تفاعل مع حكماء التاريخ في بيئة معزولة عن ضجيج العالم.",
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
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400..700&family=Playfair+Display:wght@400..700&display=swap" 
          rel="stylesheet" 
        />
        <style dangerouslySetInnerHTML={{__html: `
          :root {
            --font-amiri: 'Amiri', serif;
            --font-cairo: 'Cairo', sans-serif;
            --font-playfair: 'Playfair Display', serif;
          }
        `}} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_BOOTSTRAP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only skip-link">
          تخطى إلى المحتوى
        </a>
        <ThemeProvider>
          <LocaleProvider>
            <ShellProvider>
              <ShellChrome>
                <AppShell>
                  <Shortcuts />
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
