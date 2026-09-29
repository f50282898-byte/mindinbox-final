import type { Metadata } from "next";
import { Cairo, Playfair_Display } from "next/font/google";
import "./globals.css";
import { GoldenCursor } from "@/components/GoldenCursor";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "\u0639\u0642\u0644 \u0641\u064A \u0635\u0646\u062F\u0648\u0642 | Mind in a Box",
  description: "A philosophical AI sanctuary.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${playfair.variable}`}>
      <body className="font-sans min-h-screen selection:bg-gold/30 selection:text-gold-light">
        <GoldenCursor />
        {children}
      </body>
    </html>
  );
}
