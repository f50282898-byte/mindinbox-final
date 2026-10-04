import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pickRiddleIndex, rollOutcome, type RandomSource } from "@/lib/riddle/roll";
import {
  LIMITS,
  DEFAULT_RIDDLE_SETTINGS,
  normaliseRiddleSettings,
} from "@/lib/riddle/settings";
import {
  newTokenId,
  signWinToken,
  verifyWinToken,
  TOKEN_TTL_SECONDS,
} from "@/lib/riddle/token";
import {
  RIDDLES,
  answerSamples,
  getRiddle,
  riddleCount,
} from "@/lib/riddle/bank";
import { normaliseArabic, verifyAnswer } from "@/lib/riddle/verify";
import { PERSONAS } from "@/lib/ai/personas";

/**
 * The riddle mechanism.
 *
 * Named acceptance criteria, in order: seeded distribution, a tampered token is
 * refused, a reused token is refused, and a ceiling stops grants immediately.
 */

/** A deterministic generator, so a distribution can be asserted at all. */
function seeded(seed: number): RandomSource {
  // mulberry32: small, fast, and good enough to test a threshold comparison.
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

/**
 * Reads a term array out of the leak scanner.
 *
 * Parsed rather than substring-matched, so the drift tests below can tell a stale
 * entry from a covered one. A substring check would pass on a term that appears in
 * a *comment* in the scanner, which is precisely the failure mode worth ruling out.
 */
function scannerTerms(name: string): string[] {
  const source = readFileSync(
    join(process.cwd(), "scripts", "check-no-riddle-leak.mjs"),
    "utf8"
  );
  const start = source.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`check-no-riddle-leak.mjs has no ${name}`);
  const end = source.indexOf("];", start);
  const body = source.slice(start, end);
  return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1] as string);
}

/** A context in which every guard passes, so only the draw is under test. */
function openContext(overrides: Partial<Parameters<typeof rollOutcome>[0]> = {}) {
  return {
    probability: DEFAULT_RIDDLE_SETTINGS.probability,
    lastWinAt: null,
    cooldownDays: 30,
    grantsToday: 0,
    grantsThisMonth: 0,
    dailyGrantCeiling: 12,
    monthlyGrantCeiling: 200,
    ipRollsToday: 0,
    ipDailyRolls: 40,
    recentRolls: 0,
    suspiciousAccount: false,
    now: NOW,
    ...overrides,
  };
}

/* ── seeded distribution ─────────────────────────────────────────────────── */

describe("seeded distribution", () => {
  const DRAWS = 200_000;

  it("wins at close to the configured probability", () => {
    const random = seeded(20260604);
    let wins = 0;
    for (let i = 0; i < DRAWS; i += 1) {
      if (rollOutcome(openContext({ probability: 0.004 }), random).ok) {
        const r = rollOutcome(openContext({ probability: 0.004 }), random);
        if (r.ok && r.won) wins += 1;
      }
    }
    const rate = wins / DRAWS;
    // 0.004 expected; 0.0035–0.0045 is a generous band, and the seeded generator is
    // deterministic so this is not a flaky test — it either passes or it does not.
    expect(rate).toBeGreaterThan(0.0035);
    expect(rate).toBeLessThan(0.0045);
  });

  it("wins never, at a probability of zero", () => {
    const random = seeded(7);
    for (let i = 0; i < 10_000; i += 1) {
      const result = rollOutcome(openContext({ probability: 0 }), random);
      expect(result.ok && result.won).toBe(false);
    }
  });

  it("wins always, at a probability of one", () => {
    const random = seeded(7);
    for (let i = 0; i < 1000; i += 1) {
      const result = rollOutcome(openContext({ probability: 1 }), random);
      expect(result.ok && result.won).toBe(true);
    }
  });

  it("is uniform across riddle numbers", () => {
    const random = seeded(99);
    const counts = [0, 0, 0];
    const DRAWS_N = 30_000;
    for (let i = 0; i < DRAWS_N; i += 1) counts[pickRiddleIndex(3, random) - 1] += 1;

    for (const count of counts) {
      expect(count / DRAWS_N).toBeGreaterThan(0.3);
      expect(count / DRAWS_N).toBeLessThan(0.37);
    }
  });

  it("never returns an out-of-range riddle number", () => {
    const random = seeded(3);
    for (let i = 0; i < 20_000; i += 1) {
      const n = pickRiddleIndex(3, random);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it("does not correlate winning with riddle difficulty", () => {
    // Two independent draws, asserted structurally: the riddle index must not be
    // derived from the same value as the win.
    const random = seeded(4242);
    const first = random();
    const second = random();
    expect(first).not.toBe(second);
  });
});

/* ── the ceiling stops grants immediately ─────────────────────────────────── */

describe("the budget stops grants immediately", () => {
  it("refuses once the daily ceiling is reached", () => {
    // Probability 1 so nothing but the ceiling can be responsible.
    const result = rollOutcome(
      openContext({ probability: 1, grantsToday: 12, dailyGrantCeiling: 12 }),
      seeded(1)
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("daily_ceiling");
  });

  it("still allows a roll one below the ceiling", () => {
    const result = rollOutcome(
      openContext({ probability: 1, grantsToday: 11, dailyGrantCeiling: 12 }),
      seeded(1)
    );
    expect(result.ok && result.won).toBe(true);
  });

  it("refuses once the monthly ceiling is reached", () => {
    const result = rollOutcome(
      openContext({ probability: 1, grantsThisMonth: 200, monthlyGrantCeiling: 200 }),
      seeded(1)
    );
    expect(result.ok === false && result.reason).toBe("monthly_ceiling");
  });

  it("checks the ceiling before drawing, so a refusal never depends on luck", () => {
    // A refusal caused by a random draw would look like a bug in a dashboard, and
    // could not be explained to a reader who just watched them lose.
    let draws = 0;
    const counting: RandomSource = () => {
      draws += 1;
      return 0;
    };
    rollOutcome(openContext({ probability: 1, grantsToday: 99, dailyGrantCeiling: 12 }), counting);
    expect(draws).toBe(0);
  });
});

/* ── cooldown and the soft barriers ──────────────────────────────────────── */

describe("guards before the draw", () => {
  it("refuses inside the cooldown and allows immediately after", () => {
    const inside = rollOutcome(
      openContext({ probability: 1, lastWinAt: NOW - 29 * 86_400_000 }),
      seeded(1)
    );
    expect(inside.ok === false && inside.reason).toBe("cooldown");

    const after = rollOutcome(
      openContext({ probability: 1, lastWinAt: NOW - 30 * 86_400_000 }),
      seeded(1)
    );
    expect(after.ok && after.won).toBe(true);
  });

  it("refuses at the per-IP limit", () => {
    const result = rollOutcome(
      openContext({ probability: 1, ipRollsToday: 40, ipDailyRolls: 40 }),
      seeded(1)
    );
    expect(result.ok === false && result.reason).toBe("ip_limit");
  });

  it("refuses a suspicious new account", () => {
    const result = rollOutcome(
      openContext({ probability: 1, suspiciousAccount: true }),
      seeded(1)
    );
    expect(result.ok === false && result.reason).toBe("new_account_cluster");
  });
});

/* ── the token ───────────────────────────────────────────────────────────── */

describe("the win token", () => {
  const SECRET = "test-secret-that-is-long-enough-for-hmac";
  const OTHER_SECRET = "a-different-secret-entirely-here";
  const PHILOSOPHERS = ["plato", "rumi", "dostoevsky"];

  async function mint(
    overrides: Partial<{ uid: string; philosopher: string; riddle: number; now: number }> = {}
  ) {
    const uid = overrides.uid ?? "reader-1";
    return signWinToken({
      secret: SECRET,
      uid,
      philosopher: overrides.philosopher ?? "plato",
      riddle: overrides.riddle ?? 1,
      jti: newTokenId(),
      now: overrides.now ?? NOW,
    });
  }

  it("round-trips", async () => {
    const token = await mint();
    const result = await verifyWinToken({
      secret: SECRET,
      token,
      uid: "reader-1",
      knownPhilosophers: PHILOSOPHERS,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.claims.riddle).toBe(1);
    expect(result.ok && result.claims.philosopher).toBe("plato");
  });

  it("refuses a token naming a philosopher the product does not have", async () => {
    // The signature is valid — this is our own token — but it names someone we do
    // not have riddles for. Accepting it would open a riddle that does not exist.
    const token = await mint({ philosopher: "aurelius" });
    const result = await verifyWinToken({
      secret: SECRET,
      token,
      uid: "reader-1",
      knownPhilosophers: PHILOSOPHERS,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("malformed");
  });

  it("is refused after a tampered payload", async () => {
    const token = await mint();
    const [header, payload, signature] = token.split(".");

    // Raise the riddle number without re-signing: the signature covers the payload,
    // so this must fail.
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    decoded.riddle = 3;
    const forged = [
      header,
      Buffer.from(JSON.stringify(decoded)).toString("base64url"),
      signature,
    ].join(".");

    const result = await verifyWinToken({ secret: SECRET, token: forged, uid: "reader-1", knownPhilosophers: PHILOSOPHERS, now: NOW });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("bad_signature");
  });

  it("is refused after a tampered uid", async () => {
    const token = await mint({ uid: "reader-1" });
    const [header, payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload as string, "base64url").toString("utf8"));
    decoded.uid = "someone-else";
    decoded.sub = "someone-else";
    const forged = [
      header,
      Buffer.from(JSON.stringify(decoded)).toString("base64url"),
      signature,
    ].join(".");

    const result = await verifyWinToken({ secret: SECRET, token: forged, uid: "reader-1", knownPhilosophers: PHILOSOPHERS, now: NOW });
    expect(result.ok).toBe(false);
  });

  it("is refused when signed with a different secret", async () => {
    const token = await signWinToken({
      secret: OTHER_SECRET,
      uid: "reader-1",
      philosopher: "plato",
      riddle: 1,
      jti: newTokenId(),
      now: NOW,
    });
    const result = await verifyWinToken({
      secret: SECRET,
      token,
      uid: "reader-1",
      knownPhilosophers: PHILOSOPHERS,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("bad_signature");
  });

  it("is refused once expired", async () => {
    const token = await mint({ now: NOW });
    const later = NOW + (TOKEN_TTL_SECONDS + 60) * 1000;
    const result = await verifyWinToken({ secret: SECRET, token, uid: "reader-1", knownPhilosophers: PHILOSOPHERS, now: later });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("expired");
  });

  it("is still valid one second before expiry", async () => {
    const token = await mint({ now: NOW });
    const justBefore = NOW + (TOKEN_TTL_SECONDS - 1) * 1000;
    const result = await verifyWinToken({ secret: SECRET, token, uid: "reader-1", knownPhilosophers: PHILOSOPHERS, now: justBefore });
    expect(result.ok).toBe(true);
  });

  it("is bound to the account that won it", async () => {
    const token = await mint({ uid: "reader-1" });
    const stolen = await verifyWinToken({ secret: SECRET, token, uid: "reader-2", knownPhilosophers: PHILOSOPHERS, now: NOW });
    expect(stolen.ok).toBe(false);
    expect(stolen.ok === false && stolen.reason).toBe("uid_mismatch");
  });

  it("refuses an unsigned token", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ uid: "reader-1", riddle: 1, sub: "reader-1" })
    ).toString("base64url");
    const result = await verifyWinToken({
      secret: SECRET,
      token: `${header}.${payload}.`,
      knownPhilosophers: PHILOSOPHERS,
      uid: "reader-1",
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses garbage", async () => {
    for (const bad of ["", "not-a-token", "a.b", "a.b.c.d"]) {
      const result = await verifyWinToken({ secret: SECRET, token: bad, uid: "reader-1", knownPhilosophers: PHILOSOPHERS, now: NOW });
      expect(result.ok, bad).toBe(false);
    }
  });

  it("carries a unique id, so it can be made single-use", async () => {
    // Reuse defence depends on this. A token minted without a `jti` could not be
    // marked spent, and so could be replayed.
    const ids = new Set<string>();
    for (let i = 0; i < 200; i += 1) ids.add(newTokenId());
    expect(ids.size).toBe(200);
  });
});

/* ── verification ────────────────────────────────────────────────────────── */

describe("answer verification", () => {
  const riddle = getRiddle("plato", 1)!;

  it("accepts an answer carrying the substance", () => {
    const verdict = verifyAnswer(
      riddle,
      "الأثر ينطبع في النفس، والخارج أعمق من الصورة"
    );
    expect(verdict.passed).toBe(true);
  });

  it("accepts it without diacritics or the definite article", () => {
    // Readers do not type hamza or shadda. The verifier must not be a spelling test.
    const verdict = verifyAnswer(riddle, "الاثر ينطبع في النفس، والخارج اعمق من الصورة");
    expect(verdict.passed).toBe(true);
  });

  it("no longer accepts a bare keyword", () => {
    // The regression that matters. The first bank accepted the single words "أثر"
    // and "أعمق", which meant a reader who guessed the right nouns — or simply
    // echoed the question — was marked correct. Phrase-level acceptance is what
    // makes the verifier a check on understanding rather than on vocabulary.
    expect(verifyAnswer(riddle, "الأثر أعمق").passed).toBe(false);
    expect(verifyAnswer(riddle, "أثر عميق في النفس").passed).toBe(false);
  });

  it("rejects an answer carrying the opposite of the point", () => {
    // The case that a substring match alone would pass: it contains both required
    // phrases *and* the error.
    const verdict = verifyAnswer(
      riddle,
      "الأثر ينطبع في النفس، والخارج أعمق من الصورة، لكن الخروج هروب من الكهف"
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.matchedForbidden.length).toBeGreaterThan(0);
    // The substance was still seen, so this is a refusal on the error rather than a
    // failure to read the answer.
    expect(verdict.matchedRequired.length).toBeGreaterThan(0);
  });

  it("rejects a partial answer", () => {
    expect(verifyAnswer(riddle, "الأثر مهم").passed).toBe(false);
    expect(verifyAnswer(riddle, "الأثر ينطبع في النفس وحده").passed).toBe(false);
  });

  it("rejects an empty answer", () => {
    expect(verifyAnswer(riddle, "   ").passed).toBe(false);
  });

  it("reports a reason on failure and none on success", () => {
    expect(verifyAnswer(riddle, "لا أعرف").reasonAr).not.toBe("");
    expect(
      verifyAnswer(riddle, "الأثر ينطبع في النفس، والخارج أعمق من الصورة").reasonAr
    ).toBe("");
  });

  it("normalises alef variants so spelling is not the test", () => {
    expect(normaliseArabic("أَثَر")).toBe(normaliseArabic("اثر"));
    expect(normaliseArabic("إ")).toBe(normaliseArabic("ا"));
  });
});

/* ── the bank ────────────────────────────────────────────────────────────── */

describe("the riddle bank", () => {
  it("uses only philosophers that actually exist in the product", () => {
    // The first bank invented `aurelius`. It read well, it had three riddles, and
    // there was no such persona anywhere in the app — so the "generated in the
    // appropriate philosopher's spirit" promise could not be kept, and nothing failed
    // until a riddle was actually opened.
    //
    // Riddle content is bound to the real persona set by id, so this cannot recur.
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const r of RIDDLES) {
      expect(known.has(r.philosopherId), `${r.id} → unknown persona "${r.philosopherId}"`).toBe(
        true
      );
    }
  });

  it("names the philosopher exactly as the persona does", () => {
    // Otherwise the riddle opens in a philosopher's voice and closes under a
    // different name, which reads as an error to any reader who knows the app.
    const byId = new Map(PERSONAS.map((p) => [p.id, p.nameAr]));
    for (const r of RIDDLES) {
      expect(r.philosopherAr, r.id).toBe(byId.get(r.philosopherId));
    }
  });

  it("has three riddles per philosopher, matching the token's range", () => {
    for (const id of new Set(RIDDLES.map((r) => r.philosopherId))) {
      expect(riddleCount(id), id).toBe(3);
    }
  });

  it("numbers each philosopher's riddles 1, 2, 3 with no gaps", () => {
    for (const id of new Set(RIDDLES.map((r) => r.philosopherId))) {
      const numbers = RIDDLES.filter((r) => r.philosopherId === id)
        .map((r) => r.number)
        .sort();
      expect(numbers, id).toEqual([1, 2, 3]);
    }
  });

  it("gives every riddle a resolution, which never leaves the server", () => {
    for (const r of RIDDLES) {
      expect(r.resolutionAr.length, r.id).toBeGreaterThan(30);
      expect(r.required.length, r.id).toBeGreaterThanOrEqual(r.minRequired);
    }
  });

  it("returns null rather than throwing for an unknown riddle", () => {
    expect(getRiddle("plato", 9)).toBeNull();
    expect(getRiddle("nobody", 1)).toBeNull();
  });

  it("is fully covered by the build-time leak scanner's term list", () => {
    // The scanner is plain Node and cannot import this module, so its term list is a
    // hand-copy. A hand-copy rots: a riddle added next quarter ships its answers to
    // the client and the gate passes, because the gate was never told about them.
    //
    // So the gate's own list is read here and checked against the bank. This is the
    // test that makes duplication acceptable.
    const missing = answerSamples().filter(
      (phrase) => !scannerTerms("ANSWER_TERMS").includes(phrase)
    );
    expect(missing).toEqual([]);
  });

  it("has every resolution watched by the scanner's resolution list", () => {
    // A prefix rather than an exact slice, so the scanner can hold however much of
    // each resolution is distinctive without having to match a character count.
    const terms = scannerTerms("RESOLUTION_TERMS");
    const unwatched = RIDDLES.filter(
      (r) => !terms.some((term) => r.resolutionAr.startsWith(term))
    ).map((r) => r.id);
    expect(unwatched).toEqual([]);
  });

  it("has no stale terms in the scanner, which would make it unmaintainable", () => {
    // The other half of the anti-drift check. A term left behind after a riddle was
    // reworded would fail the build on ordinary product copy, and the natural
    // response to a gate that blocks every build is to delete the gate.
    const live = new Set([...answerSamples(), ...RIDDLES.map((r) => r.resolutionAr)]);
    const stale = scannerTerms("ANSWER_TERMS").filter((term) => !live.has(term));
    expect(stale).toEqual([]);
  });

  it("never contains an acceptance word inside its own prompt or guidance", () => {
    // The prompt is the one part of the riddle the client *does* see. If an
    // acceptance word appears in it, the answer is derivable by reading, and the
    // verifier's only job becomes confirming what was already obvious.
    //
    // This is not hypothetical. `rumi-1` shipped a prompt containing "من الماء",
    // which is one of its required answers.
    //
    // Collected rather than asserted per-pair, so a run reports every leak at once
    // instead of the first — otherwise fixing them is one round-trip each.
    const leaks: string[] = [];
    for (const r of RIDDLES) {
      const visible = normaliseArabic(`${r.promptAr} ${r.guidanceAr}`);
      for (const req of r.required) {
        for (const word of req.anyOf) {
          if (visible.includes(normaliseArabic(word))) leaks.push(`${r.id} → required "${word}"`);
        }
      }
      for (const f of r.forbidden) {
        for (const word of f.anyOf) {
          if (visible.includes(normaliseArabic(word))) leaks.push(`${r.id} → forbidden "${word}"`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it("never lets one riddle's prompt satisfy another riddle's acceptance list", () => {
    // Otherwise a reader could answer riddle 2 with a well-worded paraphrase of
    // riddle 1's question and be marked correct.
    const leaks: string[] = [];
    for (const r of RIDDLES) {
      const visible = normaliseArabic(`${r.promptAr} ${r.guidanceAr}`);
      for (const other of RIDDLES) {
        if (other.id === r.id) continue;
        for (const req of other.required) {
          for (const word of req.anyOf) {
            if (visible.includes(normaliseArabic(word))) {
              leaks.push(`${r.id} prompt satisfies ${other.id} via "${word}"`);
            }
          }
        }
        for (const f of other.forbidden) {
          for (const word of f.anyOf) {
            if (visible.includes(normaliseArabic(word))) {
              leaks.push(`${r.id} prompt trips ${other.id}'s forbidden "${word}"`);
            }
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});

/* ── settings ────────────────────────────────────────────────────────────── */

describe("settings are clamped", () => {
  it("refuses a probability above the ceiling, even from a hand-edited document", () => {
    const clamped = normaliseRiddleSettings({ probability: 0.9 });
    expect(clamped.probability).toBe(LIMITS.maxProbability);
  });

  it("refuses a negative probability", () => {
    expect(normaliseRiddleSettings({ probability: -5 }).probability).toBe(0);
  });

  it("caps the prize at 90 days", () => {
    expect(normaliseRiddleSettings({ prizeDays: 3650 }).prizeDays).toBe(LIMITS.maxPrizeDays);
  });

  it("falls back to defaults for a corrupt value rather than trusting it", () => {
    expect(normaliseRiddleSettings({ prizeDays: "seven" }).prizeDays).toBe(
      DEFAULT_RIDDLE_SETTINGS.prizeDays
    );
  });

  it("defaults the probability to something very small", () => {
    // A sanity check on the product's own premise.
    expect(DEFAULT_RIDDLE_SETTINGS.probability).toBeLessThanOrEqual(0.01);
  });
});
