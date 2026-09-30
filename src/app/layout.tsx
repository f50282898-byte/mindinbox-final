import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "عقل في صندوق | Mind in a Box",
  description: "A quiet space for thought, reflection, and discovery.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
