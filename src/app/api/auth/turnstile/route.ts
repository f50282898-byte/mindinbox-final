import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIpFromHeaders, verifyTurnstile } from "@/lib/auth/turnstile";
import {
  BODY_REJECTED_MESSAGE,
  bodyErrorStatus,
  readJsonBody,
} from "@/lib/security/body";

export const dynamic = "force-dynamic";

/**
 * Exchanges a Cloudflare Turnstile response token for a decision.
 *
 * The widget runs in the browser but proves nothing on its own — this endpoint
 * is what the signup form actually consults. Because the token is single-use
 * and short-lived, it is verified exactly once here and never cached.
 *
 * Rate limiting is Cloudflare's, not ours: see PROJECT_MAP for the rule to add.
 */

const bodySchema = z.object({
  token: z.string().min(1).max(2048),
});

export async function POST(request: Request) {
  let parsed: z.infer<typeof bodySchema>;
  {
    /* Bounded read — see the note in `/api/dialogue`. The schema caps the token at
       2048 characters, but again that caps a *field*, not the request: without
       this the body is fully buffered before zod sees it, and this is an
       unauthenticated endpoint on the signup path.
       Behaviour change: oversized returns 413 rather than 400. */
    const body = await readJsonBody(request, bodySchema, "auth");
    if (!body.ok) {
      return NextResponse.json(
        { ok: false, message: BODY_REJECTED_MESSAGE },
        { status: bodyErrorStatus(body), headers: { "Cache-Control": "no-store" } }
      );
    }
    parsed = body.value;
  }

  const result = await verifyTurnstile(parsed.token, clientIpFromHeaders(request.headers));

  if (!result.ok) {
    // The precise reason is logged server-side, not returned: "unconfigured"
    // would tell a prober about our deployment.
    return NextResponse.json(
      { ok: false, message: "تعذّر التحقق من الطلب. حاول مرة أخرى." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
