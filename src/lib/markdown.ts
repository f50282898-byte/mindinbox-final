/**
 * A small markdown subset, parsed to a typed AST.
 *
 * **No raw HTML, ever.** The model output is untrusted text: if it could emit
 * markup that becomes DOM, it would be a stored-XSS sink reachable from any
 * conversation replayed later. So the parser recognises a fixed set of our own
 * constructs and nothing else. An HTML-looking line is rendered as the literal
 * characters it is, not as markup.
 *
 * Supported, because a philosophical answer genuinely uses them:
 *   - `### heading` / `## heading`
 *   - `**bold**` and `*emphasis*` / `_emphasis_`
 *   - `` `code` `` and fenced ``` blocks
 *   - `- ` bullet lists and `1. ` ordered lists
 *   - `> ` block quotes
 *   - `---` horizontal rule
 *   - bare URLs become links, with a scheme allow-list
 *
 * Deliberately unsupported: images, tables, nested lists, raw HTML, footnotes.
 * A model that tries `<img onerror=…>` gets the text back, inert.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "em"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "heading"; level: 2 | 3; inline: Inline[] }
  | { kind: "bullet"; items: Inline[][] }
  | { kind: "ordered"; items: Inline[][] }
  | { kind: "quote"; inline: Inline[] }
  | { kind: "rule" }
  | { kind: "code"; text: string };

/** Only these schemes may appear in a link. Anything else is inert text. */
const SAFE_SCHEME = /^(https?:|mailto:)/i;

const URL_RE = /(https?:\/\/[^\s<>"'،\)]+)/gi;

/**
 * Escapes the five characters that matter.
 *
 * Applied to every text fragment before it reaches React. React escapes by
 * default too — this is belt and braces, and it makes the intent explicit for
 * anyone reading who has not internalised that React is already safe.
 */
export function escapeText(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strips tags from a URL and rejects anything but an allow-listed scheme. */
export function safeHref(raw: string): string | null {
  const trimmed = raw.trim().replace(/[)\].,;:!?]+$/, "");
  if (!SAFE_SCHEME.test(trimmed)) return null;
  // `javascript:` never reaches here, but a protocol-relative `//host` would
  // resolve to our own origin with an attacker-chosen path, so reject it too.
  if (trimmed.startsWith("//")) return null;
  return trimmed;
}

/* ── inline ──────────────────────────────────────────────────────────────── */

function parseInline(input: string): Inline[] {
  const out: Inline[] = [];
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    // Bare URLs inside a run of plain text become links.
    let last = 0;
    URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = URL_RE.exec(input)) !== null) {
      const at = m.index;
      const slice = buffer;
      // Only treat it as a link when it starts the buffer or follows a space.
      const before = at === 0 ? "" : slice[at - 1] ?? "";
      if (at > 0 && !/\s/.test(before)) continue;

      const href = safeHref(m[0]);
      if (!href) continue;

      if (at > 0) out.push({ kind: "text", text: slice.slice(0, at) });
      out.push({ kind: "link", text: m[0], href });
      buffer = slice.slice(at + m[0].length);
      last = 0;
    }
    void last;
    if (buffer) out.push({ kind: "text", text: buffer });
    buffer = "";
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i] as string;

    // Inline code. No further parsing inside: a backtick span is literal.
    if (ch === "`") {
      const end = input.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        out.push({ kind: "code", text: input.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Strong.
    if (ch === "*" && input[i + 1] === "*") {
      const end = input.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        out.push({ kind: "bold", text: input.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    // Emphasis, `*` or `_`.
    if (ch === "*" || ch === "_") {
      const end = input.indexOf(ch, i + 1);
      if (end !== -1 && end > i + 1) {
        const inner = input.slice(i + 1, end);
        // Underscores inside a word are not emphasis (snake_case).
        if (ch !== "_" || !/\w/.test(input[i - 1] ?? "") || !/\w/.test(input[end + 1] ?? "")) {
          flush();
          out.push({ kind: "em", text: inner });
          i = end + 1;
          continue;
        }
      }
    }

    buffer += ch;
    i += 1;
  }

  flush();
  return out;
}

/* ── blocks ──────────────────────────────────────────────────────────────── */

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const parseItems = (ordered: boolean): Inline[][] => {
    const items: Inline[][] = [];
    while (i < lines.length) {
      const line = lines[i] as string;
      const match = ordered ? /^\s*\d+[.)]\s+(.*)$/.exec(line) : /^\s*[-*+]\s+(.*)$/.exec(line);
      if (!match) break;
      items.push(parseInline(match[1] as string));
      i += 1;
    }
    return items;
  };

  while (i < lines.length) {
    const line = lines[i] as string;

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Fenced code. Content is literal, including any markdown inside.
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i] as string)) {
        body.push(lines[i] as string);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }

    // Horizontal rule, checked before a bullet so `---` is not an empty item.
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] as string).length === 2 ? 2 : 3;
      blocks.push({ kind: "heading", level, inline: parseInline(heading[2] as string) });
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i] as string)) {
        parts.push((lines[i] as string).replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", inline: parseInline(parts.join(" ")) });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = parseItems(true);
      if (items.length) {
        blocks.push({ kind: "ordered", items });
        continue;
      }
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = parseItems(false);
      if (items.length) {
        blocks.push({ kind: "bullet", items });
        continue;
      }
    }

    // Paragraph: consume until a blank line or the start of another block.
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] as string).trim() &&
      !/^\s*(#{2,3}\s|>\s?|[-*+]\s|\d+[.)]\s|```)/.test(lines[i] as string)
    ) {
      para.push((lines[i] as string).trim());
      i += 1;
    }
    if (para.length) blocks.push({ kind: "paragraph", inline: parseInline(para.join(" ")) });
  }

  return blocks;
}

/** Plain text from the AST, for clipboard copy and for quote cards. */
export function blocksToPlainText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case "paragraph":
        case "quote":
        case "heading":
          return inlineText(b.inline);
        case "bullet":
          return b.items.map((it) => `· ${inlineText(it)}`).join("\n");
        case "ordered":
          return b.items.map((it, n) => `${n + 1}. ${inlineText(it)}`).join("\n");
        case "code":
          return b.text;
        case "rule":
          return "—";
      }
    })
    .join("\n\n");
}

export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => (n.kind === "link" ? `${n.text} (${n.href})` : n.text))
    .join("");
}
