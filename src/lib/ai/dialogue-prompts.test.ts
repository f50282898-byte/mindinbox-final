import { describe, expect, it } from "vitest";
import {
  buildSummaryPrompt,
  buildTurnPrompt,
  renderTranscript,
} from "@/lib/ai/dialogue-prompts";

/**
 * Dialogue prompts.
 *
 * The properties under test are the ones a debate can lose. A prompt that lets a
 * speaker agree for the sake of harmony, or a summary that adjudicates, produces
 * output that looks right and means nothing — and neither failure is visible
 * without reading the instruction that caused it.
 */

describe("buildTurnPrompt", () => {
  const base = {
    transcript: "أفلاطون: المعنى أن يخرج من الكهف.",
    question: "هل المعرفة ممكنة؟",
    round: 1,
    rounds: 3,
  };

  it("states the round and the total, so a speaker knows it is not the last word", () => {
    const prompt = buildTurnPrompt({ ...base, round: 2, rounds: 3 });
    expect(prompt).toContain("الجولة 2 من 3");
  });

  it("includes the transcript and the question verbatim", () => {
    const prompt = buildTurnPrompt(base);
    expect(prompt).toContain(base.transcript);
    expect(prompt).toContain(base.question);
  });

  it("requires disagreement rather than harmony", () => {
    // The most common way a generated debate fails is both philosophers politely
    // agreeing, which produces a conversation with no content.
    const prompt = buildTurnPrompt(base);
    expect(prompt).toMatch(/اختلاف/);
    expect(prompt).toMatch(/بلا سبب/);
  });

  it("forbids the speaker from speaking for the other", () => {
    expect(buildTurnPrompt(base)).toMatch(/لا تحكم بينكما/);
  });

  it("asks for prose, not structure, so a turn does not arrive as a list", () => {
    expect(buildTurnPrompt(base)).toMatch(/بلا مقدمات ولا عناوين/);
  });
});

describe("buildSummaryPrompt", () => {
  const base = {
    transcript: "أفلاطون: كذا.\n\nالرومي: لا.",
    question: "هل المعرفة ممكنة؟",
  };

  it("asks for agreement and disagreement separately", () => {
    const prompt = buildSummaryPrompt(base);
    expect(prompt).toContain("أين اتفقا");
    expect(prompt).toContain("أين اختلفا");
  });

  it("forbids adjudicating, which is the summary's one real temptation", () => {
    // A summary that says who is right is doing the philosophers' job without
    // the argument behind it, and readers take it as the verdict.
    expect(buildSummaryPrompt(base)).toMatch(/لا تحكم أيَّهما أصحّ/);
  });

  it("forbids adding an opinion of its own", () => {
    expect(buildSummaryPrompt(base)).toMatch(/لا تُضف رأياً خاصاً بك/);
  });

  it("permits reporting that there was no agreement, or none of the disagreement", () => {
    // Without this the model must invent one of each to satisfy the format.
    const prompt = buildSummaryPrompt(base);
    expect(prompt).toContain("إن لم يتّفقا على شيء");
    expect(prompt).toContain("إن لم يختلفا");
  });
});

describe("renderTranscript", () => {
  it("labels each turn with its speaker", () => {
    const rendered = renderTranscript([
      { speaker: "أفلاطون", content: "سؤال" },
      { speaker: "الرومي", content: "ورد" },
    ]);
    expect(rendered).toContain("أفلاطون:");
    expect(rendered).toContain("الرومي:");
  });

  it("drops empty turns rather than printing a bare speaker label", () => {
    // A transcript line reading just "أفلاطون:" tells the model he spoke and
    // said nothing, which invites it to invent what he said.
    const rendered = renderTranscript([
      { speaker: "أفلاطون", content: "   " },
      { speaker: "الرومي", content: "ورد" },
    ]);
    expect(rendered).not.toContain("أفلاطون:");
    expect(rendered).toContain("الرومي:");
  });

  it("returns an empty string for no turns", () => {
    expect(renderTranscript([])).toBe("");
  });
});
