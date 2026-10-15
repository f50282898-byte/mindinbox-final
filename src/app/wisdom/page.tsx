import type { Metadata } from "next";
import { WisdomChat } from "@/components/WisdomChat";
import { ArtLayer } from "@/components/art/ArtLayer";
import { absoluteUrl } from "@/lib/seo";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "اسأل الحكيم",
  description:
    "اختر فيلسوفاً، واطرح سؤالك. ردّ فلسفي متأنٍّ، بلا تشخيص ولا تشويق.",
  alternates: { canonical: "/wisdom", languages: { ar: "/wisdom", en: "/wisdom" } },
  openGraph: {
    title: "اسأل الحكيم | عقل في صندوق",
    description: "اختر فيلسوفاً، واطرح سؤالك.",
    url: absoluteUrl("/wisdom"),
  },
};

export default function WisdomPage() {
  /*
    `cityscape` is this surface's declared artwork — `art-manifest.json` names it
    `surface: "wisdom"` — and it was built and shipped to `public/art/` but never
    placed, leaving the page the only chat surface with a bare background. The
    `relative` wrapper is the positioned ancestor `ArtLayer` needs; the layer
    itself is `absolute inset-0`, so the layout above it does not move.
  */
  return (
    <div className="relative">
      <ArtLayer id="cityscape" />
      <WisdomChat />
    </div>
  );
}
