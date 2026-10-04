/**
 * Which lessons a reader may open.
 *
 * ## The rule the brief sets
 *
 * The first lesson of each path is free. The rest are for Oracle. Sanctum's extra
 * material is decided later by an admin, so there is nothing here about it yet
 * beyond the fact that it is not this file's job.
 *
 * ## Why this is a pure function of `entitled`
 *
 * Because a client-side check is not a check. `entitled` must arrive from a
 * **server-side** check of the verified token — `getEntitlements(uid)` — and the
 * lesson body must then be omitted from anything sent to the browser, not merely
 * hidden with CSS.
 *
 * The e2e suite asserts this by fetching a locked lesson's route as a guest and
 * grepping the response body for a distinctive phrase from that lesson. A hidden
 * element would still be in the HTML; an omitted one is not.
 */

import type { Lesson, Path } from "./schema";

/** What the reader is entitled to. Computed server-side only. */
export interface Entitlement {
  tier: "free" | "oracle" | "sanctum";
}

export interface LessonAccess {
  order: number;
  unlocked: boolean;
  /** Why it is locked, for the honest message beside the lesson. */
  reason: "free" | "member" | null;
}

export function isEntitled(entitlement: Entitlement): boolean {
  return entitlement.tier !== "free";
}

/**
 * Whether one lesson may be opened.
 *
 * `freeLessons` is matched by **order**, not by position in the array, so a path
 * whose first lesson is a preview is expressible without relying on index order.
 */
export function canOpenLesson(path: Path, order: number, entitled: boolean): boolean {
  if (path.freeLessons.includes(order)) return true;
  return entitled;
}

/** Access for every lesson in a path, for building a locked list. */
export function lessonAccess(path: Path, entitled: boolean): LessonAccess[] {
  return path.lessons.map((lesson) => {
    const unlocked = canOpenLesson(path, lesson.order, entitled);
    return {
      order: lesson.order,
      unlocked,
      reason: unlocked ? "free" : "member",
    };
  });
}

/** How many lessons are open to this reader. */
export function openLessonCount(path: Path, entitled: boolean): number {
  return path.lessons.filter((l) => canOpenLesson(path, l.order, entitled)).length;
}

/**
 * The metadata for every lesson — titles, aims, locked flags — with **no body
 * text**.
 *
 * This is the only shape that may be handed to a client component. It is what the
 * path page renders, and it is safe to serialise because it contains nothing a
 * locked reader should not see.
 */
export interface LessonMeta {
  order: number;
  titleAr: string;
  aimAr: string;
  unlocked: boolean;
  reason: "free" | "member" | null;
  /** Minutes, so a reader can budget before committing. */
  minutes: number;
}

export function lessonMeta(path: Path, entitled: boolean): LessonMeta[] {
  return path.lessons.map((lesson) => ({
    order: lesson.order,
    titleAr: lesson.titleAr,
    aimAr: lesson.aimAr,
    unlocked: canOpenLesson(path, lesson.order, entitled),
    reason: canOpenLesson(path, lesson.order, entitled) ? "free" : "member",
    minutes: lesson.practice.minutes,
  }));
}

/** One open lesson, in full. `null` when the reader may not have it. */
export function openLesson(
  path: Path,
  order: number,
  entitled: boolean
): Lesson | null {
  if (!canOpenLesson(path, order, entitled)) return null;
  return path.lessons.find((l) => l.order === order) ?? null;
}

/**
 * Where to send a reader who asks for something they cannot have.
 *
 * Never a 404 — that reads as "this does not exist", which is a lie about the
 * product's own curriculum. A locked lesson is real; the reader simply is not
 * entitled to it yet.
 */
export function lockedResponse(path: Path, order: number): {
  status: 403;
  body: { ok: false; code: "LOCKED"; pathId: string; order: number; message: string };
} {
  return {
    status: 403,
    body: {
      ok: false,
      code: "LOCKED",
      pathId: path.id,
      order,
      message: "هذا الدرس ضمن العضوية.",
    },
  };
}
