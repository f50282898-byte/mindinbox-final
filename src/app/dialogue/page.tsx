import type { Metadata } from "next";
import { Dialogue } from "@/components/Dialogue";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "الحوار",
  description:
    "اسأل سؤالاً، واختر فيلسوفين ليجيبا عنه. ثلاث جولات متناوبة، ثم خلاصة محايدة تبيّن أين اتفقا وأين اختلفا.",
  alternates: { canonical: "/dialogue", languages: { ar: "/dialogue", en: "/dialogue" } },
  openGraph: {
    title: "الحوار | عقل في صندوق",
    description: "فيلسوفان يجيبان عن سؤالك، ثم خلاصة محايدة تبيّن الاتفاق والاختلاف.",
    url: absoluteUrl("/dialogue"),
  },
};

/**
 * Two philosophers, one question, three rounds, a neutral summary.
 *
 * The shape of the dialogue — how many rounds, who may have them — is decided in
 * `api/dialogue`, from the verified entitlement. This page only asks and renders.
 */
export default function DialoguePage() {
  /* `relative` gives the agora engraving a positioned ancestor. `ArtLayer` renders
     nothing until `npm run art:build` has run, so this costs the page nothing until
     the artwork exists. */
  return (
    <div className="relative">
      <ArtLayer id="agora" />
      <Dialogue />
    </div>
  );
}
