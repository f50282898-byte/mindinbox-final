import type { Metadata } from "next";
import { Cairo, Playfair_Display } from "next/font/google";
import "./globals.css";
import { LeadGenModal } from "@/components/LeadGenModal";
import { Sidebar } from "@/components/Sidebar";
import { GoldenSymbols } from "@/components/GoldenSymbols";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "عقل في صندوق | Mind in a Box",
  description: "A philosophical AI sanctuary.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${playfair.variable}`}>
      <body className="font-sans min-h-screen bg-black selection:bg-gold/30 selection:text-gold-light">
        <Sidebar />
        <GoldenSymbols />
        <LeadGenModal />
        <div className="md:pr-[80px] w-full min-h-screen flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
