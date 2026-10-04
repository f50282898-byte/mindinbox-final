/**
 * The path and lesson schema.
 *
 * ## Shape
 *
 * A **path** is a sequence of lessons. A **lesson** is 3–5 minutes: one idea, one
 * sourced quotation, one question to sit with, one small thing to do today, and
 * optionally a short recorded exchange with the persona who belongs to that path.
 *
 * ## What the schema enforces, and why each rule is here
 *
 * - **`quoteId` must resolve to a verified library entry.** A lesson citing an
 *   unverified or unknown quote fails validation. This is the acceptance criterion,
 *   and putting it in the schema means content that breaks it cannot ship.
 * - **`reflectionQuestion` is required, not optional.** A lesson that only informs
 *   is not this product. The brief asks for a reflective practice, and an idea with
 *   nothing to do with it is a lecture.
 * - **`sourceCount >= 1` is required** via at least one of `quoteId` or
 *   `sources`. A lesson may therefore cite a work in prose instead of quoting it —
 *   but it may not cite nothing.
 * - **Historical claims are not a schema's job, and this file does not pretend
 *   otherwise.** `historicalNote` exists to *force the author to write down* what
 *   they are asserting and where it came from, so a claim can be reviewed. It cannot
 *   check the claim is true. That is what the rejected-quotes log in PROJECT_MAP.md
 *   and human review are for.
 */

import { z } from "zod";

/** A real, citable reference. No "the internet" and no bare author names. */
export const sourceSchema = z.object({
  /** Author, translator, editor — whoever a reader would look up. */
  who: z.string().min(2).max(120),
  /** Title of the work. */
  title: z.string().min(2).max(200),
  /** Publisher or series, where it aids identification. */
  publisher: z.string().max(160).optional(),
  year: z.number().int().min(-3000).max(2100).optional(),
  /** ISBN or DOI, when there is one. */
  identifier: z.string().max(80).optional(),
  /** Why this reference is worth the reader's time. */
  noteAr: z.string().max(300).optional(),
});

export type Source = z.infer<typeof sourceSchema>;

/** The recorded exchange with a persona. */
export const dialogueSchema = z.object({
  /** Must be a persona id that exists. Checked against `PERSONAS`. */
  personaId: z.string().min(2).max(40),
  /** The persona's line, in their voice. */
  line: z.string().min(8).max(600),
  /**
   * A quotation the persona speaks.
   *
   * Optional and, when present, must be a verified library id — a persona may not
   * be made to say a famous sentence just because it would land well.
   */
  quoteId: z.string().max(40).optional(),
});

/** The "for further reading" block at the end of every lesson. */
export const furtherReadingSchema = z.object({
  sources: z.array(sourceSchema).min(1).max(6),
  /**
   * What this lesson does *not* settle, and where to go next.
   *
   * Required. A reading list that does not say what it is for is a list of names,
   * and a reader who cannot tell why a book is on it will not open it.
   */
  guidanceAr: z.string().min(10).max(600),
});

export const lessonSchema = z
  .object({
    /** 1-based, matching its position in the path. Checked by the path validator. */
    order: z.number().int().min(1).max(99),

    titleAr: z.string().min(4).max(120),
    /** One line: what the reader will have grasped. */
    aimAr: z.string().min(10).max(300),

    /** The body: 3–5 minutes of reading. Bounded so it stays a lesson. */
    bodyAr: z
      .string()
      .min(120, "a lesson body under 120 characters cannot be a 3–5 minute read")
      .max(6000),

    /**
     * A verified quotation from the library. At least one of this or `sources`.
     *
     * A path where the lesson only cites prose is legitimate — some ideas are
     * better paraphrased than misquoted — so this is not mandatory on its own.
     */
    quoteId: z.string().max(40).optional(),

    /**
     * A historical or textual claim the lesson relies on.
     *
     * Present so the claim can be reviewed. The schema cannot verify it is true; it
     * can only require that the author wrote it down instead of slipping it into
     * the prose unnoticed.
     */
    historicalNote: z
      .object({
        claimAr: z.string().min(10).max(400),
        /** Where the claim comes from. */
        basis: z.string().min(3).max(200),
        /** True only when it was checked. Unchecked claims are allowed but flagged. */
        verified: z.boolean(),
      })
      .optional(),

    /** The question to sit with. Required — see the file header. */
    reflectionQuestion: z.string().min(12).max(400),

    /** One small, concrete thing to do today. */
    practice: z.object({
      instructionAr: z.string().min(10).max(400),
      /** Minutes. The brief says a lesson is 3–5 minutes of reading. */
      minutes: z.number().int().min(1).max(15),
    }),

    dialogue: dialogueSchema.optional(),

    furtherReading: furtherReadingSchema,
  })
  .strict()
  // The acceptance criterion, enforced: a lesson needs a source and a question.
  .refine((l) => Boolean(l.quoteId) || l.furtherReading.sources.length > 0, {
    message: "a lesson must cite at least one source: a verified quote, or a reading-list entry",
    path: ["quoteId"],
  });

export type Lesson = z.infer<typeof lessonSchema>;

export const pathSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9-]{2,39}$/, "path id must be a lowercase slug"),

    titleAr: z.string().min(4).max(120),
    titleEn: z.string().min(2).max(120),

    /** One line: what this path is for. */
    taglineAr: z.string().min(10).max(240),

    /** 2–3 sentences on what the path is and is not. */
    descriptionAr: z.string().min(40).max(900),

    /**
     * The tradition this path draws on. A historical claim, so it is recorded
     * explicitly rather than buried in the prose.
     */
    tradition: z.object({
      nameAr: z.string().min(2).max(80),
      /** Years, as a display string, because ranges and single dates both occur. */
      periodAr: z.string().min(2).max(80),
      noteAr: z.string().min(10).max(400),
    }),

    /**
     * The first lessons that are free to everyone.
     *
     * A list of orders, not a count, so "lesson 1 and lesson 4 are free" is
     * expressible. Empty means the whole path is behind the membership — a valid
     * choice, and the gate handles it.
     */
    freeLessons: z.array(z.number().int().min(1).max(99)).max(99).default([1]),

    lessons: z.array(lessonSchema).min(1).max(30),
  })
  .strict()
  .refine((p) => {
    // Orders must be 1..n with no gaps and no duplicates, so "lesson 3" means one
    // thing across the progress store, the gate and the URL.
    const orders = p.lessons.map((l) => l.order).sort((a, b) => a - b);
    return orders.every((o, i) => o === i + 1);
  }, { message: "lesson orders must be 1..n, contiguous, with no duplicates" })
  .refine((p) => p.freeLessons.every((o) => p.lessons.some((l) => l.order === o)), {
    message: "freeLessons may only name lessons that exist",
  });

export type Path = z.infer<typeof pathSchema>;

/** How many lessons a complete path has, per the brief. */
export const LESSONS_PER_PATH = 7;

/**
 * Validates one lesson in isolation.
 *
 * Exported separately from the path schema so a unit test can point it at a
 * hand-written object and assert exactly which rule it breaks. The path schema
 * composes it, so the two can never disagree.
 */
export function validateLesson(input: unknown): Lesson {
  return lessonSchema.parse(input);
}

/**
 * Validates a whole path.
 *
 * Beyond the schema, this resolves every `quoteId` and `dialogue.personaId`, which
 * the schema cannot do on its own because it does not know the library. A lesson
 * citing a quote that does not exist, or a persona that does not exist, is rejected
 * here rather than rendering as a broken citation.
 */
export function validatePath(
  input: unknown,
  deps: {
    /** Resolves a quote id; must return null for unknown or unverified. */
    quote: (id: string) => unknown | null;
    /** Persona ids that exist. */
    personaIds: readonly string[];
  }
): Path {
  const path = pathSchema.parse(input);

  for (const lesson of path.lessons) {
    if (lesson.quoteId && !deps.quote(lesson.quoteId)) {
      throw new Error(
        `path ${path.id} lesson ${lesson.order}: quote "${lesson.quoteId}" is unknown or unverified`
      );
    }
    if (lesson.dialogue) {
      if (!deps.personaIds.includes(lesson.dialogue.personaId)) {
        throw new Error(
          `path ${path.id} lesson ${lesson.order}: persona "${lesson.dialogue.personaId}" does not exist`
        );
      }
      if (lesson.dialogue.quoteId && !deps.quote(lesson.dialogue.quoteId)) {
        throw new Error(
          `path ${path.id} lesson ${lesson.order}: dialogue quote "${lesson.dialogue.quoteId}" is unknown or unverified`
        );
      }
    }
  }

  return path;
}

/** Validates a whole library of paths. */
export function validateAllPaths(
  inputs: unknown[],
  deps: Parameters<typeof validatePath>[1]
): Path[] {
  return inputs.map((input) => validatePath(input, deps));
}
