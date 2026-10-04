/**
 * Quote cards, drawn in a canvas.
 *
 * ## Why canvas and not the DOM
 *
 * Because the DOM already does Arabic shaping correctly and a canvas does it too —
 * the point is that **we capture the shaped result as pixels and put those pixels
 * into the PDF**. The alternative, embedding an Arabic font in a PDF, means either
 * shipping a font file (megabytes, and licensing) or trusting the PDF viewer's
 * shaping engine, which varies. Shaping once, in the browser's own text engine,
 * and shipping a bitmap means every reader sees exactly the card we drew,
 * regardless of what their PDF reader supports.
 *
 * ## The two things that break Arabic on a canvas
 *
 * 1. **Direction.** `direction` must be set on the context or the run is laid out
 *    left-to-right and the punctuation lands on the wrong side.
 * 2. **Shaping.** Arabic letters are contextual forms. A canvas `fillText` with a
 *    full string performs the shaping — but only if the string is passed whole.
 *    Drawing it character by character produces isolated forms and looks like a
 *    ransom note. This module therefore never splits a line mid-word; wrapping is
 *    done by measuring whole words.
 *
 * ## Why the watermark is drawn, not CSS
 *
 * A non-member's preview must be visibly watermarked in the exported image too, or
 * they could screenshot the canvas. But the download itself is refused on the
 * server, so the watermark is a courtesy rather than the control — see
 * `/api/quotes/card`, which returns 403.
 */

/** Templates, in the order they appear in the picker. */
export const CARD_TEMPLATES = ["gold-black", "parchment", "plain"] as const;
export type CardTemplate = (typeof CARD_TEMPLATES)[number];

export interface CardPalette {
  background: string;
  /** Thin frame inset from the edge. */
  frame: string;
  /** Rule under the attribution. */
  rule: string;
  text: string;
  attribution: string;
  source: string;
  accent: string;
}

export const PALETTES: Record<CardTemplate, CardPalette> = {
  "gold-black": {
    background: "#050505",
    frame: "rgba(212, 175, 55, 0.55)",
    rule: "rgba(212, 175, 55, 0.4)",
    text: "#e7d9a1",
    attribution: "#d4af37",
    source: "rgba(212, 175, 55, 0.6)",
    accent: "#d4af37",
  },
  parchment: {
    background: "#f4ecd8",
    frame: "rgba(111, 86, 17, 0.35)",
    rule: "rgba(111, 86, 17, 0.3)",
    text: "#3a2f14",
    attribution: "#6f5611",
    source: "rgba(111, 86, 17, 0.65)",
    accent: "#6f5611",
  },
  plain: {
    background: "#ffffff",
    frame: "rgba(0, 0, 0, 0.12)",
    rule: "rgba(0, 0, 0, 0.12)",
    text: "#111111",
    attribution: "#444444",
    source: "#777777",
    accent: "#111111",
  },
};

export interface CardInput {
  textAr: string;
  philosopherAr: string;
  /** Work and locator, e.g. "Apology, 117a". Required on the card. */
  sourceLabel: string;
  template: CardTemplate;
  /** Drawn diagonally across the card. Non-members only. */
  watermark?: string | null;
}

/**
 * Card geometry, in CSS pixels.
 *
 * 4:5 portrait, which is the proportion a card wants on a phone and the one that
 * prints without letterboxing.
 */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/** Padding from the frame to the text block. */
const PAD = 108;

/**
 * Wraps Arabic text to a pixel width, breaking **between words only**.
 *
 * This is the single most important function here. Breaking inside a word would
 * split a contextual form from its neighbour and produce a disconnected letter —
 * the exact artefact the brief's visual test exists to catch.
 */
export function wrapArabic(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }

  return lines;
}

/**
 * Draws the card and returns it as a PNG blob.
 *
 * Runs entirely in the browser. Nothing here is imported by server code, and the
 * PDF is assembled client-side from the returned bytes.
 */
export async function renderCard(input: CardInput): Promise<Blob> {
  const palette = PALETTES[input.template];

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  /* ── Direction, once, for the whole context ────────────────────────────────
     Without this the run is laid out LTR and the trailing punctuation of an
     Arabic sentence appears at the left edge, which is visibly wrong. */
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";

  // Background.
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Frame.
  ctx.strokeStyle = palette.frame;
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, CARD_WIDTH - 96, CARD_HEIGHT - 96);

  // Corner ticks. Pure geometry — no ornament that could be mistaken for text.
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 4;
  const tick = 36;
  for (const [cx, cy, dx, dy] of [
    [48, 48, 1, 1],
    [CARD_WIDTH - 48, 48, -1, 1],
    [48, CARD_HEIGHT - 48, 1, -1],
    [CARD_WIDTH - 48, CARD_HEIGHT - 48, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * tick, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * tick);
    ctx.stroke();
  }

  /* ── The quotation ───────────────────────────────────────────────────────── */

  // Sized down from 56px until the text block fits the available height, so a long
  // quote shrinks rather than overflowing the card.
  const maxWidth = CARD_WIDTH - PAD * 2;
  let fontSize = 56;
  let lines: string[] = [];
  let lineHeight = 0;

  for (; fontSize >= 28; fontSize -= 2) {
    ctx.font = `600 ${fontSize}px "Amiri", "Cairo", serif`;
    lineHeight = fontSize * 1.7;
    lines = wrapArabic(ctx, input.textAr, maxWidth);
    if (lines.length * lineHeight <= CARD_HEIGHT * 0.52) break;
  }

  const textTop = PAD + 60;
  ctx.fillStyle = palette.text;
  ctx.font = `600 ${fontSize}px "Amiri", "Cairo", serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line, CARD_WIDTH - PAD, textTop + i * lineHeight);
  });

  /* ── Attribution and source ──────────────────────────────────────────────
     Both are drawn on every card, always. A card without its source is exactly
     the failure this whole task is about, so there is no template that omits it
     and no flag that turns it off. */

  const blockBottom = textTop + lines.length * lineHeight;
  let y = blockBottom + 72;

  ctx.fillStyle = palette.attribution;
  ctx.font = `500 34px "Amiri", "Cairo", serif`;
  ctx.fillText(input.philosopherAr, CARD_WIDTH - PAD, y);
  y += 52;

  // The rule, sized to the attribution rather than the card, so it looks
  // deliberate in every language.
  const nameWidth = ctx.measureText(input.philosopherAr).width;
  ctx.strokeStyle = palette.rule;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(CARD_WIDTH - PAD, y - 26);
  ctx.lineTo(CARD_WIDTH - PAD - Math.min(nameWidth, 220), y - 26);
  ctx.stroke();

  ctx.fillStyle = palette.source;
  ctx.font = `400 26px "Cairo", sans-serif`;
  // The source may be Latin even when the quote is Arabic, so it is drawn LTR.
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillText(input.sourceLabel, PAD, y + 12);
  ctx.direction = "rtl";
  ctx.textAlign = "right";

  /* ── Watermark ───────────────────────────────────────────────────────────
     Drawn rotated and low-contrast. Not a lock — the server refuses the download
     — but a reader who screenshots the preview should not be left with a clean
     card they did not earn. */

  if (input.watermark) {
    ctx.save();
    ctx.translate(CARD_WIDTH / 2, CARD_HEIGHT / 2);
    ctx.rotate(-Math.PI / 9);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = palette.accent;
    ctx.font = `700 96px "Cairo", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(input.watermark, 0, 0);
    ctx.restore();
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas produced no blob"));
    }, "image/png");
  });
}

/**
 * Estimated bytes for a card, used by the size test.
 *
 * A 1080×1350 PNG of mostly flat colour compresses to roughly 150–400 KB. Five
 * cards plus a small PDF wrapper must stay under 1 MB, which is why the geometry
 * is fixed and the templates are flat: a photographic background would blow the
 * budget on the first card.
 */
export const CARD_SIZE_BUDGET_BYTES = 200 * 1024;
