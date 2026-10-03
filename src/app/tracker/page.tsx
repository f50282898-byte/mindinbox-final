import type { Metadata } from "next";
import { DailyTracker } from "@/components/DailyTracker";

export const metadata: Metadata = {
  title: "متتبع الوعي",
  description: "تتبّع العادات والأفكار برسم بياني ذهبي.",
};

export default function TrackerPage() {
  return <DailyTracker />;
}