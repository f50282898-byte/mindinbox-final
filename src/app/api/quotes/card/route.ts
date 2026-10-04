import { z } from "zod";
import { verifiedQuote } from "@/lib/quotes/library";
import { getEntitlements } from "@/lib/entitlements";
import { bearerFromHeaders, verifyIdToken } from "@/lib/auth/server";
import { jsonError } from "@/lib/ai/http";
import { log } from "@/lib/log";

export const runtime = "edge";

/**
 * Quote card download.
 *
 * ## What this route is for
 *
 * Returning the text a client needs to *draw* a card. The image is drawn in the
 * browser and the PDF assembled there too, so no card pixels pass through this
 * server and no Arabic font is ever needed here — which is the whole reason the
 * brief requires canvas rendering rather than server-side PDF generation.
 *
 * ## The gate
 *
 * A non-member gets a **preview**: the real quote, with `watermark` set. An
 * entitled member gets the same quote with `watermark: null`.
 *
 * The decision is made here, on the server, from the verified token. A UI-only
 * gate is a `disabled` attribute, and `curl` does not honour disabled attributes.
 * The e2e suite asserts this by calling the route with no credentials and reading
 * `watermark` back.
 *
 * The preview text is deliberately **not** blanked. Withholding the words and
 * calling it a paywall would be dishonest about what the product is: the reader
 * sees the card, watermarked, and is told plainly what membership changes.
 */

const bodySchema = z.object({
  quoteId: z.string().min(3).max(48),
});

export async function POST(request: Request): Promise<Response> {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return jsonError({ ok: false, error: "طلب غير صالح." }, 400);
  }

  // `verifiedQuote`, not a plain lookup: an unverified entry must not be drawable
  // even by a member. Credibility does not have a paying tier.
  const quote = verifiedQuote(parsed.quoteId);
  if (!quote) {
    log.warn("quote_card_refused", { quoteId: parsed.quoteId, reason: "not_verified" });
    return jsonError(
      { ok: false, code: "NOT_CITABLE", error: "هذا الاقتباس غير موثّق بعد." },
      404
    );
  }

  const verified = await verifyIdToken(bearerFromHeaders(request.headers)).catch(() => null);
  const uid = verified?.ok ? verified.user.uid : null;

  let entitled = false;
  if (uid) {
    try {
      entitled = (await getEntitlements(uid)).tier !== "free";
    } catch {
      // Unreachable entitlements. Failing open here would hand out an unwatermarked
      // card, which is the one outcome the gate exists to prevent — so this fails
      // closed, applies the watermark, and logs loudly.
      log.error("entitlements_unreachable");
      entitled = false;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      entitled,
      quote: {
        textAr: quote.textAr,
        philosopherAr: quote.philosopherAr,
        sourceLabel: `${quote.workEn}, ${quote.locator}`,
        // Carried so the card can show the original wording and a reader can
        // check the Arabic against it. This is the anti-drift safeguard.
        sourceText: quote.sourceText,
        translator: quote.translator ?? null,
        edition: quote.edition ?? null,
      },
      watermark: entitled ? null : "عقل في صندوق",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}
