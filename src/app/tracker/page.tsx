import type { Metadata } from "next";
import { DailyTracker } from "@/components/DailyTracker";
import { ArtLayer } from "@/components/art/ArtLayer";

export const metadata: Metadata = {
  title: "متتبع الوعي",
  description: "تتبّع العادات والأفكار برسم بياني ذهبي.",
};

export default function TrackerPage() {
  return (
    <div className="relative">
      <ArtLayer id="hourglass" />
      <DailyTracker />
    </div>
  );
}