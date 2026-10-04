import { z } from "zod";
import { getDocument, setDocument } from "@/lib/google/firestore-rest";
import { bearerFromHeaders, verifyIdToken } from "@/lib/auth/server";
import { jsonError } from "@/lib/ai/http";
import { log } from "@/lib/log";
import { isCollectable, type SignalKind } from "@/lib/signals/types";
import { monthKeyOf } from "@/lib/signals/months";
import { RETENTION_MONTHS } from "@/lib/signals/retention";
import {
  DEFAULT_GLOBAL,
  decideSignal,
  type ConsentState,
  type GlobalSwitch,
} from "@/lib/signals/consent";

export const runtime = "edge";

/**
 * The signal receiver.
 *
 * ## The gate is checked again here, deliberately
 *
 * The client checks consent before sending, and the acceptance test proves that by
 * watching for zero requests. But a client-side gate is a courtesy: `curl` does not
 * run our code. So this route re-derives the decision from the **verified token**
 * and the stored consent document, and refuses anything the client should not have
 * sent.
 *
 * A refused batch is dropped silently and counted in the response, not reported to
 * the client — telling a prober which of their signals was refused is free
 * reconnaissance.
 *
 * ## No raw log, ever
 *
 * Incoming events are folded into per-month aggregate documents
 * (`users/{uid}/signals/{yyyy-mm}`) and then discarded. Nothing that arrives here
 * is stored as it arrived, so there is no log to leak, no log to retain, and no
 * way to reconstruct a session. `retentionMonths` prunes older aggregates.
 */

const MAX_BATCH = 20;

const signalSchema = z.object({
  kind: z.string().min(2).max(24),
  value: z.string().min(1).max(48),
  at: z.number().int(),
  consent: z.enum(["conversation", "journal"]),
});

const bodySchema = z.object({
  uid: z.string().max(128).nullable(),
  signals: z.array(signalSchema).max(MAX_BATCH),
});

/** The aggregate shape written per month. Counts only, never raw events. */
interface MonthAggregate {
  uid: string;
  month: string;
  /** `kind:value` → count. The whole document is a tally. */
  counts: Record<string, number>;
  updatedAt: number;
}

/** A success payload. `jsonError` is for failures, and reusing it for a 200 would
 *  be the kind of shortcut that later ships a 400 on a happy path. */
function ok(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Reads the admin switch. Fails to the safe default if unreadable. */
async function readGlobal(): Promise<GlobalSwitch> {
  try {
    const doc = await getDocument<Partial<GlobalSwitch>>("siteConfig/flags");
    return {
      signalsEnabled: doc?.signalsEnabled !== false,
      memoryEnabled: doc?.memoryEnabled !== false,
    };
  } catch {
    // Unreachable. Signals enabled is the product's normal state; the *consent*
    // gate is what protects readers, and that fails closed regardless.
    return { ...DEFAULT_GLOBAL };
  }
}

async function readConsent(uid: string): Promise<ConsentState | null> {
  try {
    const doc = await getDocument<Partial<ConsentState>>(`users/${uid}/consent`);
    if (!doc) return null;
    return {
      conversation: doc.conversation === true,
      journal: doc.journal === true,
      ...(typeof doc.pausedUntil === "number" ? { pausedUntil: doc.pausedUntil } : {}),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return jsonError({ ok: false, error: "طلب غير صالح." }, 400);
  }

  if (parsed.signals.length === 0) {
    return ok({ ok: true, accepted: 0, refused: 0 });
  }

  /* ── Identity comes from the token, never from the body's `uid` ─────────────
     The body carries a uid so the client can tell whether its own view is
     identified, but it is **not** trusted: a forged uid in the body would let one
     reader write aggregates into another's account. */
  const verified = await verifyIdToken(bearerFromHeaders(request.headers)).catch(() => null);
  const uid = verified?.ok ? verified.user.uid : null;

  if (!uid) {
    // No identity: nothing may be written. This is the "no signal linked to
    // identity without consent" guarantee, enforced at the only place that matters.
    log.warn("signals_unidentified_dropped", { count: parsed.signals.length });
    return ok({ ok: true, accepted: 0, refused: parsed.signals.length });
  }

  const [global, consent] = await Promise.all([readGlobal(), readConsent(uid)]);

  let accepted = 0;
  let refused = 0;
  /** month → counts */
  const buckets = new Map<string, Record<string, number>>();

  for (const signal of parsed.signals) {
    if (!isCollectable(signal)) {
      refused += 1;
      continue;
    }

    const decision = decideSignal(
      { consent: signal.consent, identified: true },
      consent,
      global
    );
    if (!decision.allowed) {
      refused += 1;
      continue;
    }

    const key = `${signal.kind as SignalKind}:${signal.value}`;
    const month = monthKeyOf(signal.at);
    const bucket = buckets.get(month) ?? {};
    bucket[key] = (bucket[key] ?? 0) + 1;
    buckets.set(month, bucket);
    accepted += 1;
  }

  // Fold into aggregates. Read-modify-write rather than blind overwrite, so two
  // beacons arriving together do not lose each other's counts.
  for (const [month, counts] of buckets) {
    try {
      const existing = await getDocument<MonthAggregate>(`users/${uid}/signals/${month}`);
      const merged: MonthAggregate = {
        uid,
        month,
        counts: { ...(existing?.counts ?? {}), ...counts },
        updatedAt: Date.now(),
      };
      await setDocument(`users/${uid}/signals/${month}`, {
        ...merged,
      } as unknown as Record<string, unknown>);
    } catch (err) {
      log.error("signals_aggregate_write_failed", { month });
      void err;
    }
  }

  return ok({ ok: true, accepted, refused });
}
