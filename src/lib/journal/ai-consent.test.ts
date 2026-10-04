import { describe, expect, it, vi } from "vitest";
import {
  consentAllowsReading,
  decideAiReading,
  readJournalForAi,
} from "@/lib/journal/ai-consent";
import type { DayDocument } from "@/lib/journal/types";

/**
 * The AI consent gate.
 *
 * The acceptance criterion is "switching the AI key off prevents any server read of
 * journal content". The word that matters is **any**, so the central test is not
 * "does it return the right error" but "**was a read issued at all**" — observed by
 * injecting the reader and asserting it was never called.
 *
 * A post-hoc filter would pass the first kind of test and fail this one, which is
 * exactly why this test is written the way it is.
 */

describe("consentAllowsReading", () => {
  it("allows only an explicit true", () => {
    expect(consentAllowsReading({ aiJournalConsent: true })).toBe(true);
  });

  it("refuses everything else", () => {
    // Each of these could arrive from a corrupt document, a future schema, or a
    // careless migration. Consent that cannot be positively identified is not
    // consent, so all of them refuse.
    for (const value of [false, undefined, null, "true", 1, "false", {}, []]) {
      expect(
        consentAllowsReading({ aiJournalConsent: value }),
        JSON.stringify(value)
      ).toBe(false);
    }
  });

  it("refuses when there are no settings at all", () => {
    expect(consentAllowsReading(null)).toBe(false);
    expect(consentAllowsReading(undefined)).toBe(false);
    expect(consentAllowsReading({})).toBe(false);
  });
});

describe("decideAiReading", () => {
  it("distinguishes not-signed-in from switch-off", () => {
    // Telling someone to enable a switch they cannot see is worse than useless.
    const anonymous = decideAiReading(null, null);
    expect(anonymous.allowed).toBe(false);
    expect(anonymous.allowed === false && anonymous.reason).toBe("no_user");

    const switchOff = decideAiReading("uid-1", { aiJournalConsent: false });
    expect(switchOff.allowed).toBe(false);
    expect(switchOff.allowed === false && switchOff.reason).toBe("consent_off");
  });

  it("allows a consented, signed-in reader", () => {
    expect(decideAiReading("uid-1", { aiJournalConsent: true }).allowed).toBe(true);
  });
});

describe("readJournalForAi — the acceptance criterion", () => {
  const uid = "reader-1";
  const from = "2026-05-04";
  const to = "2026-05-10";

  const dayWithContent = (date: string): DayDocument => ({
    date,
    timeZone: "UTC",
    updatedAt: 1,
    checkIn: { energy: 3, focus: 2, mood: 4 },
    practice: { read: true, note: "أفلاطون" },
    journal: [{ template: "evening", text: "نص شخصي لا يُقرأ إلا بموافقة", updatedAt: 1 }],
    virtues: { wisdom: 3 },
  });

  it("issues no read at all when the switch is off", async () => {
    const read = vi.fn(async () => dayWithContent(from));

    await expect(
      readJournalForAi({ uid, settings: { aiJournalConsent: false }, from, to, read })
    ).rejects.toMatchObject({ name: "CONSENT_DENIED", code: "consent_required" });

    // The heart of the criterion: not one read was attempted.
    expect(read).not.toHaveBeenCalled();
  });

  it("issues no read when the flag is a string, a number, or missing", async () => {
    for (const value of ["true", 1, undefined, null]) {
      const read = vi.fn(async () => dayWithContent(from));
      await expect(
        readJournalForAi({
          uid,
          settings: { aiJournalConsent: value } as never,
          from,
          to,
          read,
        })
      ).rejects.toMatchObject({ name: "CONSENT_DENIED" });
      expect(read, JSON.stringify(value)).not.toHaveBeenCalled();
    }
  });

  it("issues no read when there are no settings at all", async () => {
    const read = vi.fn(async () => dayWithContent(from));
    await expect(
      readJournalForAi({ uid, settings: null, from, to, read })
    ).rejects.toMatchObject({ name: "CONSENT_DENIED" });
    expect(read).not.toHaveBeenCalled();
  });

  it("issues no read when nobody is signed in", async () => {
    const read = vi.fn(async () => dayWithContent(from));
    await expect(
      readJournalForAi({ uid: "", settings: { aiJournalConsent: true }, from, to, read })
    ).rejects.toMatchObject({ name: "CONSENT_DENIED", code: "no_identity" });
    expect(read).not.toHaveBeenCalled();
  });

  it("throws rather than returning empty, so 'no consent' cannot read as 'nothing written'", async () => {
    // Otherwise a caller would render "a quiet week" at someone who never agreed.
    await expect(
      readJournalForAi({ uid, settings: { aiJournalConsent: false }, from, to })
    ).rejects.toBeInstanceOf(Error);
  });

  it("reads, and only reads, once consent is on", async () => {
    const read = vi.fn(async (path: string): Promise<DayDocument | null> => {
      if (path === `users/${uid}/days/2026-05-05`) return dayWithContent("2026-05-05");
      return null;
    });

    const payload = await readJournalForAi({
      uid,
      settings: { aiJournalConsent: true },
      from,
      to,
      read,
    });

    expect(read).toHaveBeenCalled();
    expect(payload.days).toHaveLength(1);
    expect(payload.days[0]?.date).toBe("2026-05-05");
  });

  it("reads only inside the requested window", async () => {
    const read = vi.fn(async (path: string) => {
      const date = path.split("/").pop() as string;
      return date >= from && date <= to ? dayWithContent(date) : null;
    });

    const payload = await readJournalForAi({
      uid,
      settings: { aiJournalConsent: true },
      from,
      to,
      read,
    });

    for (const day of payload.days) {
      expect(day.date >= from && day.date <= to, day.date).toBe(true);
    }
    // 05-04 through 05-10 inclusive is seven days.
    expect(read).toHaveBeenCalledTimes(7);
  });

  it("strips habits and virtues, which consent does not need to cover", async () => {
    const read = vi.fn(async () => dayWithContent(from));
    const payload = await readJournalForAi({
      uid,
      settings: { aiJournalConsent: true },
      from,
      to,
      read,
    });

    const day = payload.days[0] as Record<string, unknown>;
    // A routine and a self-assessment describe the reader; the Oracle needs
    // neither to say something kind about their week.
    expect(day.habits).toBeUndefined();
    expect(day.virtues).toBeUndefined();
    expect(day.checkIn).toBeDefined();
  });

  it("never puts a principle, a habit list or a device id into the payload", async () => {
    const read = vi.fn(async () => dayWithContent(from));
    const payload = await readJournalForAi({
      uid,
      settings: { aiJournalConsent: true },
      from,
      to,
      read,
    });

    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain("lastWriter");
    expect(Object.keys(payload)).toEqual(["days"]);
  });

  it("carries a message the reader can act on", async () => {
    const decision = decideAiReading(uid, { aiJournalConsent: false });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    // Names the fix, and does not imply anything is wrong with the reader.
    expect(decision.message).toContain("لم تُفعّل");
    expect(decision.message).not.toContain("خطأ");
  });
});
