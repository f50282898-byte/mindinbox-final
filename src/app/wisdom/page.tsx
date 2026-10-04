import type { Metadata } from "next";
import { WisdomChat } from "@/components/WisdomChat";
import { ArtLayer } from "@/components/art/ArtLayer";
import { absoluteUrl } from "@/lib/seo";

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
  return (
    <div className="relative">
      <ArtLayer id="cityscape" />
      <WisdomChat />
    </div>
  );
}
