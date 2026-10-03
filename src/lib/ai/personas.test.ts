import { describe, expect, it } from "vitest";
import { DEFAULT_AI_SETTINGS, applyRemoteAiSettings, resolveAiSettings } from "@/lib/ai/settings";
import { PERSONAS, VERIFIED_QUOTES, getPersona, normalisePersonas } from "@/lib/ai/personas";
import { buildSystemPrompt, NON_NEGOTIABLE } from "@/lib/ai/prompts";

/**
 * Persona engine and AI settings.
 *
 * Two rules are worth a test each because they are promises rather than code:
 *   - a persona may only quote from the verified library
 *   - model ids come from configuration, and no provider adapter hardcodes one
 */

describe("personas", () => {
  it("ships the four required personas", () => {
    const ids = PERSONAS.map((p) => p.id).sort();
    expect(ids).toEqual(["aesop", "dostoevsky", "plato", "rumi"]);
  });

  it("every persona has a display name, a brief and some questions", () => {
    for (const p of PERSONAS) {
      expect(p.nameAr.trim(), p.id).not.toBe("");
      expect(p.briefAr.trim().length, p.id).toBeGreaterThan(20);
      expect(p.questionsAr.length, p.id).toBeGreaterThan(1);
      expect(p.motifsAr.length, p.id).toBeGreaterThan(1);
    }
  });

  it("only references quote ids that exist in the verified library", () => {
    for (const p of PERSONAS) {
      for (const id of p.verbatimQuoteIds) {
        expect(VERIFIED_QUOTES, `${p.id} → ${id}`).toHaveProperty(id);
      }
    }
  });

  it("has no unattributed or placeholder quotations", () => {
    for (const [id, q] of Object.entries(VERIFIED_QUOTES)) {
      expect(q.textAr.trim(), id).not.toBe("");
      expect(q.attributionAr.trim(), id).not.toBe("");
      expect(q.work.trim(), id).not.toBe("");
      expect(q.textAr, id).not.toMatch(/[?？]{2,}|xxx|todo/i);
    }
  });

  it("falls back to the default persona for an unknown id", () => {
    expect(getPersona("does-not-exist").id).toBe("plato");
    expect(getPersona(null).id).toBe("plato");
  });

  describe("normalisePersonas", () => {
    const valid = {
      id: "custom",
      nameAr: "شخصية مخصصة",
      nameEn: "Custom",
      briefAr: "نبذة أطول من الحد الأدنى المطلوب هنا",
      questionsAr: ["سؤال أول؟"],
      motifsAr: ["رمز"],
      verbatimQuoteIds: ["rumi-water"],
    };

    it("accepts a well-formed document", () => {
      const parsed = normalisePersonas([valid]);
      expect(parsed).not.toBeNull();
      expect(parsed?.[0].id).toBe("custom");
    });

    it("rejects a quote id that is not in the verified library", () => {
      // An admin must not be able to widen what may be attributed to a person.
      const parsed = normalisePersonas([
        { ...valid, verbatimQuoteIds: ["something-i-made-up"] },
      ]);
      expect(parsed).toBeNull();
    });

    it("rejects a malformed id, a missing brief, and a non-array", () => {
      expect(normalisePersonas([{ ...valid, id: "Bad Id!" }])).toBeNull();
      expect(normalisePersonas([{ ...valid, briefAr: "" }])).toBeNull();
      expect(normalisePersonas("nope")).toBeNull();
      expect(normalisePersonas([])).toBeNull();
    });

    it("defaults optional fields rather than failing", () => {
      const parsed = normalisePersonas([
        { id: "min", nameAr: "أدنى", briefAr: "نبذة تكفي لاجتياز التحقق من الطول هنا" },
      ]);
      expect(parsed).not.toBeNull();
      expect(parsed?.[0].questionsAr).toEqual([]);
      expect(parsed?.[0].verbatimQuoteIds).toEqual([]);
      expect(parsed?.[0].nameEn).toBe("أدنى");
    });
  });
});

describe("system prompt", () => {
  const persona = getPersona("plato");

  it("always states that the speaker is an AI, not the historical figure", () => {
    const prompt = buildSystemPrompt({ persona });
    expect(prompt).toContain("أنت ذكاء اصطناعي");
    expect(prompt).toMatch(/لست هو/);
    expect(prompt).toContain(persona.nameAr);
  });

  it("forbids diagnosis and prescribing", () => {
    const prompt = buildSystemPrompt({ persona });
    expect(prompt).toContain("لا تقدّم تشخيصاً");
    expect(prompt).toContain("لست طبيباً");
  });

  it("forbids verbatim quotation outside the verified library", () => {
    const prompt = buildSystemPrompt({ persona });
    expect(prompt).toMatch(/مكتبة الاقتباسات المعتمدة/);
    // Only the ids this persona is entitled to are listed.
    for (const id of persona.verbatimQuoteIds) {
      expect(prompt).toContain(VERIFIED_QUOTES[id].textAr);
    }
  });

  it("tells a persona with no quotes that it has none", () => {
    const prompt = buildSystemPrompt({ persona: getPersona("aesop") });
    expect(prompt).toContain("لا تملك أي اقتباس معتمد");
    // Aesop has no entries, so nothing from the library should be quoted.
    expect(prompt).not.toContain(VERIFIED_QUOTES["rumi-water"].textAr);
  });

  it("sets the tone rules the brief requires", () => {
    const prompt = buildSystemPrompt({ persona });
    expect(prompt).toMatch(/تتحدى الفكرة ولا تتحدى الشخص/);
    expect(prompt).toMatch(/أجب باللغة التي كُتب بها السؤال/);
    expect(prompt).toContain("لا تستخدم رموزاً تعبيرية");
  });

  it("has no empty rule lines", () => {
    for (const rule of NON_NEGOTIABLE) {
      if (rule.trim() === "") continue;
      expect(rule.trim().length, rule).toBeGreaterThan(3);
    }
  });
});

describe("AI settings", () => {
  it("reads model ids from the environment, per role", () => {
    const settings = resolveAiSettings({
      ANTHROPIC_MODEL_CHAT: "some-model-x",
      GEMINI_MODEL: "some-model-y",
    } as Record<string, string | undefined>);

    expect(settings.providers.anthropic.models.chat).toBe("some-model-x");
    // A role-specific env var wins over the bare one.
    expect(settings.providers.anthropic.models.analysis).toBe(
      DEFAULT_AI_SETTINGS.providers.anthropic.models.analysis
    );
    // The bare variable fills every role that has no specific override.
    expect(settings.providers.gemini.models.chat).toBe("some-model-y");
    expect(settings.providers.gemini.models.admin).toBe("some-model-y");
  });

  it("reads a configurable chain order from the environment", () => {
    const settings = resolveAiSettings({
      AI_CHAIN_CHAT: "Groq, GEMINI ,, anthropic",
    } as Record<string, string | undefined>);

    expect(settings.chains.chat).toEqual(["groq", "gemini", "anthropic"]);
  });

  it("falls back to the default chain when the env var is empty", () => {
    const settings = resolveAiSettings({ AI_CHAIN_CHAT: "  " } as Record<string, string | undefined>);
    expect(settings.chains.chat).toEqual(DEFAULT_AI_SETTINGS.chains.chat);
  });

  it("clamps remote overrides instead of trusting them", () => {
    const base = resolveAiSettings({});
    const remote = applyRemoteAiSettings(base, {
      maxOutputChars: 999_999,
      firstTokenTimeoutMs: 999_999,
      chains: { chat: ["not-a-provider"], analysis: "nope" },
      providers: { anthropic: { models: { chat: 12345 }, baseUrl: "http://insecure" } },
    });

    expect(remote.maxOutputChars).toBeLessThanOrEqual(20_000);
    expect(remote.firstTokenTimeoutMs).toBeLessThanOrEqual(60_000);
    // An unknown provider id is dropped, so the chain cannot be emptied into
    // something meaningless.
    expect(remote.chains.chat).toEqual(DEFAULT_AI_SETTINGS.chains.chat);
    // A non-string model id is ignored; the configured one survives.
    expect(remote.providers.anthropic.models.chat).toBe(
      DEFAULT_AI_SETTINGS.providers.anthropic.models.chat
    );
    // A non-https base URL is refused.
    expect(remote.providers.anthropic.baseUrl).toBeUndefined();
  });

  it("accepts a valid remote override", () => {
    const base = resolveAiSettings({});
    const remote = applyRemoteAiSettings(base, {
      providers: { anthropic: { models: { chat: "custom-model" } } },
      chains: { admin: ["anthropic", "gemini"] },
    });

    expect(remote.providers.anthropic.models.chat).toBe("custom-model");
    expect(remote.chains.admin).toEqual(["anthropic", "gemini"]);
  });

  it("never lets Bytez into a default chain, since it has no working host", () => {
    for (const role of ["chat", "analysis", "admin"] as const) {
      expect(DEFAULT_AI_SETTINGS.chains[role]).not.toContain("bytez");
    }
    // The adapter exists so it can be enabled by configuration later.
    expect(DEFAULT_AI_SETTINGS.providers.bytez).toBeDefined();
  });
});
