import type { Metadata } from "next";
import { AccountPanel } from "@/components/AccountPanel";
import { absoluteUrl } from "@/lib/seo";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "الحساب",
  description: "بيانات حسابك، ولغتك، ومظهرك، وتصدير بياناتك، وحذف حسابك.",
  alternates: { canonical: "/account", languages: { ar: "/account", en: "/account" } },
  openGraph: {
    title: "الحساب | عقل في صندوق",
    description: "بيانات حسابك وتصدير بياناتك.",
    url: absoluteUrl("/account"),
  },
  // Private by nature: blocked in robots.txt too. Both, deliberately.
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <AccountPanel />;
}
