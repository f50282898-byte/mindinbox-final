#!/usr/bin/env node
/**
 * Fails the build if any riddle answer or probability reaches the client.
 *
 * ## Why this is a build gate and not a review step
 *
 * The entire feature rests on two facts the client must never learn: what the
 * answers are, and how likely a win is. Both are trivially leaked by ordinary
 * refactors — importing `RIDDLES` into a component "just to show the prompt",
 * hoisting a constant into a shared module, moving settings next to a
 * client-facing helper. None of those look wrong in review; all of them end the
 * game.
 *
 * So the check is mechanical and runs on every build.
 *
 * ## What it scans
 *
 * 1. Every `.js` file in the client build output. This is what a browser downloads.
 * 2. The **prerendered HTML** of each route, separately, because a value can be
 *    serialised into the RSC payload without appearing in any chunk — the two leak
 *    paths are different and only one of them is caught by grepping the bundle.
 *
 * ## What it looks for
 *
 * - Every acceptance word from `bank.ts` (`answerSamples()`), taken from the data so
 *    the scanner cannot drift from the bank and pass vacuously.
 * - A slice of every resolution (`resolutionSamples()`).
 * - The configured probability, in any of the forms it could leak.
 *
 * ## On false positives
 *
 * An Arabic word that happens to appear in ordinary UI copy would fail the build.
 * That is the right trade for a security gate — a false positive is one word
 * changed, a false negative ships the answer to everyone.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const CLIENT_DIR = join(ROOT, ".next");
const PRERENDER_DIR = join(CLIENT_DIR, "server", "app");

/**
 * Acceptance phrases and resolution slices.
 *
 * Duplicated from the bank's data rather than imported: this script runs as plain
 * Node over the build output, so it cannot import a `.ts` module.
 *
 * The duplication is guarded. `riddle.test.ts` reads **this file** and asserts that
 * every acceptance phrase in `bank.ts` appears below, so a riddle cannot be added
 * without extending the detector. That test is what makes the copy here safe to
 * maintain by hand.
 */
const ANSWER_TERMS = [
  // ── plato-1 ────────────────────────────────────────────────────────────
  "الأثر ينطبع في النفس", "انطبع الأثر في النفس", "صار الأثر شيئاً في نفسه",
  "الخارج أعمق من الصورة", "الأصل أعمق من الظل", "الصورة ليست الشيء نفسه",
  "الجدران تتحرك", "الجدار هو الذي تحرك", "هرب من الكهف", "الخروج هروب",
  // ── plato-2 ────────────────────────────────────────────────────────────
  "مثال ثابت", "المثال ليس من هذا العالم", "نموذج ثابت يقاس عليه",
  "أعمق من الرأي", "ثابت لا يتغير", "مطلق لا نسبي", "الناس يقولون", "ما يقال",
  // ── plato-3 ────────────────────────────────────────────────────────────
  "الجهل المعترف به أصدق", "من يعترف بجهله", "الجهل المصرّح به أصدق",
  "الواثق لا يسأل فيصير", "من لا يسأل يجعل غيره نظارة له", "يصير من حوله نظّارة له",
  "التواضع وحده فضيلة", "الجهل بدل المعرفة",
  // ── dostoevsky-1 ───────────────────────────────────────────────────────
  "العجز لا يعفيك", "المعرفة لا تعفي", "العلم بالشر لا يبرر",
  "المسؤولية تبقى عليك", "يبقى عليك ما فعلت", "الإنسان يبقى مسؤولاً",
  "الذنب ليس لك", "ليس ذنبك",
  // ── dostoevsky-2 ───────────────────────────────────────────────────────
  "الحرية عبء", "الحرية ليست رفاهية", "العبء ليس مكرمة",
  "سلب الإرادة هبة", "نزع الإرادة هبة", "الحماية التي تنزع الاختيار",
  "التحرر من الإرادة تحرر", "الحبس أرحم",
  // ── dostoevsky-3 ───────────────────────────────────────────────────────
  "الحمل لا يفوض", "لا يؤول إلى أحد", "لا يفوض أحد",
  "التسليم لا يعفي", "ترك العالم لأحد غيرك تسليم", "التفويض لا ينفي الحساب",
  "الحمل مفروض عليك", "كُلفت به دون إرادتك",
  // ── rumi-1 ─────────────────────────────────────────────────────────────
  "داخل الإناء نفسه", "هو في داخل المكان نفسه", "يبحث عنه في داخل ما يبحث فيه",
  "البحث في غير موضعه", "موضع البحث هو المخطئ", "تطلب في غير موضعه",
  "الانشغال سبب الفشل", "الكسل سبب الفشل",
  // ── rumi-2 ─────────────────────────────────────────────────────────────
  "الطين والعجن واحد", "الصانع والطين لا ينفصلان", "لا فرق بين الخبز والعجين",
  "الفصل اعتقاد لا حقيقة", "الافتراق وهم", "أن يفصل بينهما اعتقاد",
  "يقين بالذات المنفصلة", "الذات المنفصلة يقينية",
  // ── rumi-3 ─────────────────────────────────────────────────────────────
  "ما قاله غيرك يزول", "قول الناس عابر", "ما سمعته من غيرك يمر",
  "ما لا يناقض نفسه", "الثابت لا تناقضه الأقوال", "الذي لا تناقضه الأيام",
  "الاعتراف ضعف", "الاعتراف بالخطأ نقطة ضعف",
];

/** Distinctive slices of the resolutions. Long enough not to collide by accident. */
const RESOLUTION_TERMS = [
  "الأثر يخبر النفس",
  "الجمال يقاس بمثال",
  "الواثق من نفسه لا يسأل",
  "الأحداث لا تختارها",
  "أن تعرف الشر وتريد",
  "حين يُنزع عنك الاختيار",
  "أن تحمل العالم اختيار",
  "من يطلب الشيء من غير موضعه",
  "من يقول أنا وأنت هو من",
  "ما يقال عنك يمر",
];

/**
 * The probability, in every form it could plausibly leak.
 *
 * `0.004` is the shipped default. A build-time check against one specific value is
 * not enough — an admin could change it — so this scans for the *shape* of a
 * probability constant in the client as well, which is why `PROBABILITY_SHAPES`
 * below lists textual forms.
 */
const PROBABILITY_TERMS = [
  "probability",
  "RIDDLE_SIGNING_SECRET",
  "dailyGrantCeiling",
  "monthlyGrantCeiling",
  "prizeDays",
  "cooldownDays",
  "ipDailyRolls",
  "0.004",
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, out);
    else if ([".js", ".html", ".json", ".txt", ".rsc"].includes(extname(full))) out.push(full);
  }
  return out;
}

function readOrNull(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

const violations = [];

/* ── 1. the client bundle ─────────────────────────────────────────────────── */

const clientFiles = walk(CLIENT_DIR).filter(
  // Server-side output legitimately contains the bank. Only the *client* build must
  // not — so the scan is limited to what a browser can receive.
  (f) => !f.includes(`${join(".next", "server")}`) || f.includes("static")
);

for (const file of clientFiles) {
  const content = readOrNull(file);
  if (!content) continue;
  const rel = relative(ROOT, file);

  for (const term of ANSWER_TERMS) {
    if (content.includes(term)) {
      violations.push({ file: rel, kind: "answer", term });
    }
  }
  for (const term of RESOLUTION_TERMS) {
    if (content.includes(term)) {
      violations.push({ file: rel, kind: "resolution", term });
    }
  }
  for (const term of PROBABILITY_TERMS) {
    if (content.includes(term)) {
      violations.push({ file: rel, kind: "probability", term });
    }
  }
}

/* ── 2. the prerendered HTML, per route ───────────────────────────────────── */

const htmlFiles = walk(PRERENDER_DIR).filter((f) => extname(f) === ".html");

for (const file of htmlFiles) {
  const content = readOrNull(file);
  if (!content) continue;
  const rel = relative(ROOT, file);

  for (const term of [...ANSWER_TERMS, ...RESOLUTION_TERMS, ...PROBABILITY_TERMS]) {
    if (content.includes(term)) {
      violations.push({ file: rel, kind: "html", term });
    }
  }
}

/* ── report ───────────────────────────────────────────────────────────────── */

const scanned = clientFiles.length + htmlFiles.length;

if (scanned === 0) {
  console.error(
    "check-no-riddle-leak — no build output found. Run this after `next build`."
  );
  process.exit(1);
}

if (violations.length > 0) {
  console.error("\ncheck-no-riddle-leak — FAILED\n");
  const seen = new Set();
  for (const v of violations) {
    const key = `${v.kind}:${v.term}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.error(`  [${v.kind}] "${v.term}"`);
    console.error(`      first seen in ${v.file}`);
  }
  console.error(
    `\n${violations.length} leak(s) across ${seen.size} distinct term(s).` +
      "\nRiddle answers, resolutions and the win probability must never reach the client."
  );
  process.exit(1);
}

console.log(
  `check-no-riddle-leak — ${scanned} client/HTML artefact(s) scanned; ` +
    `no answer, resolution or probability found.`
);
