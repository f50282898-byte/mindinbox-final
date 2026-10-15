import type { Metadata } from "next";
import { AdminConsole } from "@/components/AdminConsole";

export const runtime = "edge";

// Not indexed, never linked from the sidebar.
export const metadata: Metadata = {
  title: "الإدارة",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminPage() {
  return <AdminConsole />;
}