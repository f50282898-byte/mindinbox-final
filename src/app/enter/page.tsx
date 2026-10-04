import type { Metadata } from "next";
import { AuthPanel } from "@/components/AuthPanel";
import { ArtLayer } from "@/components/art/ArtLayer";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "المدخل",
  description:
    "سجّل الدخول إلى عقل في صندوق، أو تابع دون حساب. حسابك يحفظ ما تكتبه على جهازك وحده.",
  /**
   * `noindex`, and deliberately on the page rather than in a component.
   *
   * `/enter` needs Firebase, so in a build without it the page shows an unavailable
   * screen. Indexing "sign-in is not available" on a public search engine is a bad
   * first impression, and it is the sort of URL that gets crawled and cached for
   * months. It must be declared here in `metadata`: a `noindex` set by a client
   * component arrives after the crawler has already fetched the page.
   *
   * `/enter` is not a discovery target regardless of configuration — it is reached from
   * the nav, and nothing links to it from outside — so nothing is lost by this.
   */
  robots: { index: false, follow: false },
};

export default function EnterPage() {
  return (
    <div className="relative">
      <ArtLayer id="gate" />
      <AuthPanel />
    </div>
  );
}