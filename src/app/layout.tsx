import type { Metadata, Viewport } from "next";
import { Amiri, Cairo, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AppShell } from "@/components/AppShell";

// Latin philosophical display — Playfair Display
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-playfair",
});

// Arabic UI face — Cairo
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
  title: {
    default: "عقل في صندوق | Mind in a Box",
    template: "%s | عقل في صندوق",
  },
  description:
    "ملاذك الفلسفي. اسأل الحكيم، تتبّع عاداتك، واصعد إلى المحراب في بيئة معزولة عن ضجيج العالم.",
  applicationName: "Mind in a Box",
  keywords: [
    "فلسفة",
    "ذكاء اصطناعي",
    "تأمل",
    "عادات",
    "Stoicism",
    "philosophy",
    "AI",
  ],
  authors: [{ name: "Mind in a Box" }],
  openGraph: {
    type: "website",
    locale: "ar_AR",
    title: "عقل في صندوق | Mind in a Box",
    description: "ملاذك الفلسفي للذكاء الاصطناعي في بيئة معزولة عن ضجيج العالم.",
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
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
      className={`${cairo.variable} ${playfair.variable} ${amiri.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-volcanic font-sans">
        <a href="#main" className="sr-only skip-link">
          تخطَّ إلى المحتوى
        </a>
        <AppShell>
          <Sidebar />
          <div id="main" className="min-h-screen md:pe-[76px] md:pb-0 pb-20">
            {children}
          </div>
        </AppShell>
      </body>
    </html>
  );
}