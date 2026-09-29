const fs = require('fs');

const layoutContent = `import type { Metadata } from "next";
import { Cairo, Playfair_Display } from "next/font/google";
import "./globals.css";
import { GoldenCursor } from "@/components/GoldenCursor";
import { LeadGenModal } from "@/components/LeadGenModal";
import { InternalAdEngine } from "@/components/InternalAdEngine";

const cairo = Cairo({ 
  subsets: ["arabic", "latin"], 
  variable: "--font-cairo" 
});
const playfair = Playfair_Display({ 
  subsets: ["latin"], 
  variable: "--font-playfair" 
});

export const metadata: Metadata = {
  title: "عقل في صندوق | Mind in a Box",
  description: "A philosophical AI sanctuary.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={\`\${cairo.variable} \${playfair.variable}\`}>
      <body className="font-sans min-h-screen selection:bg-gold/30 selection:text-gold-light">
        <GoldenCursor />
        <LeadGenModal />
        <InternalAdEngine />
        {children}
      </body>
    </html>
  );
}
`;

fs.writeFileSync('app/layout.tsx', layoutContent, 'utf8');
