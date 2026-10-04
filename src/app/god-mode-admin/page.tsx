import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasAdminSession, adminSessionUid } from "@/lib/admin/session";
import { AdminGate } from "@/components/admin/AdminGate";

/**
 * `notFound()` rather than a redirect, and rather than a client-side gate.
 *
 * A redirect to `/enter` confirms the route exists, and a client-side gate returns
 * **200 with the console markup** to anyone who asks — hiding that with CSS is not
 * security. Here, a request without a valid admin page session gets a genuine 404: as
 * far as an unauthorised caller is concerned, this page does not exist.
 *
 * The APIs are the real boundary and they are unchanged — every one re-verifies the
 * Firebase ID token and re-reads `admins/{uid}`. The cookie only decides whether the
 * page renders.
 */

export const metadata: Metadata = {
  title: "لوحة الإدارة",
  robots: { index: false, follow: false, nocache: true, noarchive: true },
  // Belt and braces: a `noindex` meta tag is advisory to crawlers that ignore it.
  alternates: { canonical: "/admin" },
};

export const dynamic = "force-dynamic";

export default async function GodModeAdminPage() {
  const session = await hasAdminSession();
  if (!session) notFound();

  const uid = await adminSessionUid();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <AdminGate uid={uid} />
    </div>
  );
}
