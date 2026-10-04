import type { Metadata } from "next";
import { JournalApp } from "@/components/journal/JournalApp";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "المفكرة",
  description:
    "مفكرة يومية: عاداتك، وأيامك، ومبادئك. تُكتب على جهازك أولاً، وتُزامَن حين تتوفّر الشبكة.",
  /**
   * `noindex` — see the note in `/enter`.
   *
   * The journal's local mirror works without Firebase, but nothing syncs, so a reader
   * would lose entries on a new device with no warning. Its own copy already tells an
   * unsynced reader to sign in to keep their entries with them; `noindex` keeps the
   * page out of results while that promise cannot be kept.
   */
  robots: { index: false, follow: false },
};

/**
 * The journal.
 *
 * Everything here is the reader's own and stays on their device first. There is no
 * server component in this page's data path, because there is nothing to fetch:
 * the content is theirs, and it is already local.
 */
export default function JournalPage() {
  return <JournalApp />;
}
