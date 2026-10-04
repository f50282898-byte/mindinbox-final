import type { Metadata } from "next";
import { DailyTracker } from "@/components/DailyTracker";
import { ArtLayer } from "@/components/art/ArtLayer";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "متتبع الوعي",
  description:
    "سجّل عاداتك وأفكارك اليومية، وراقب خطّها عبر الأسابيع. سجلّك في حسابك، ويبقى متاحاً دون اتصال.",
  /**
   * `noindex` — see the note in `/enter`.
   *
   * The tracker needs Firebase for anything beyond the local mirror, so an unconfigured
   * build shows an unavailable screen. The tracker is a private surface reached from the
   * nav; it is not a search result anyone wants to land on.
   */
  robots: { index: false, follow: false },
};

export default function TrackerPage() {
  return (
    <div className="relative">
      <ArtLayer id="hourglass" />
      <DailyTracker />
    </div>
  );
}