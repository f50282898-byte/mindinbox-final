import type { Metadata } from "next";
import { JournalApp } from "@/components/journal/JournalApp";
import { ArtLayer } from "@/components/art/ArtLayer";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "المفكرة",
  description:
    "مفكرة يومية: عاداتك، وأيامك، ومبادئك. تُكتب على جهازك أولاً، وتُزامَن حين تتوفّر الشبكة.",
  alternates: { canonical: "/journal", languages: { ar: "/journal", en: "/journal" } },
  openGraph: {
    title: "المفكرة | عقل في صندوق",
    description: "عاداتك، وأيامك، ومبادئك — في مكان واحد يبقى لك.",
    url: absoluteUrl("/journal"),
  },
};

/**
 * The journal.
 *
 * Everything here is the reader's own and stays on their device first. There is no
 * server component in this page's data path, because there is nothing to fetch:
 * the content is theirs, and it is already local.
 */
export default function JournalPage() {
  return (
    <div className="relative">
      <ArtLayer id="hourglass" />
      <JournalApp />
    </div>
  );
}
