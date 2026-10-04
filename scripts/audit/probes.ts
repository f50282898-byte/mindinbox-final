/**
 * The in-page probes.
 *
 * ## Why all of this is inside one exported function
 *
 * `page.evaluate(fn)` ships the function to the browser by stringifying it and
 * evaluating it there. Closures do not travel. A probe that called a module-scope
 * helper would compile, lint and typecheck perfectly — and then throw
 * `describe is not defined` inside the headless browser at runtime, where nothing is
 * watching. An audit that silently catches nothing is worse than no audit, because its
 * empty report reads as a clean page.
 *
 * So every helper here is a nested function declaration. Nested function declarations
 * are part of the function's own source text, which means the whole probe suite
 * serializes intact. The types below are erased at compile time and cost nothing.
 *
 * ## What each probe is for, given that axe also runs
 *
 * axe covers the WCAG A/AA rule set properly and it is the authority on names, roles
 * and structure. These probes exist for the two things axe cannot do here:
 *
 * 1. **Contrast where axe goes silent.** axe refuses to judge text it cannot determine a
 *    background for, and reports those as `incomplete` rather than violations. On a page
 *    with a photographic or painted artwork layer behind the text, that is *every*
 *    heading and paragraph — so on `/` and `/dialogue` axe returns zero violations and
 *    the contrast risk is entirely unchecked. Measured, in the full run: axe reported
 *    `color-contrast` on 14 routes and on none of the two artwork pages.
 * 2. **Geometry.** Overflow culprits, clipped text, tap targets, tab order. axe has no
 *    opinion on any of these.
 *
 * Where both tools have an opinion, axe's wins; see `crawl.ts`.
 */

export interface Overflow {
  /** CSS-selector-ish path to the offending element. */
  selector: string;
  /** How far past the viewport's right edge, in CSS pixels. */
  overflowPx: number;
  scrollWidth: number;
  clientWidth: number;
  text: string;
}

export interface ContrastPair {
  selector: string;
  text: string;
  fontSizePx: number;
  fontWeight: number;
  /** Effective background, composited through every ancestor. */
  background: string;
  foreground: string;
  ratio: number;
  /** WCAG AA: 4.5 for normal text, 3 for large text. */
  required: number;
  largeText: boolean;
}

export interface TextClipping {
  selector: string;
  text: string;
  kind: "overflow-clipped" | "truncated-ellipsis" | "zero-height";
  detail: string;
}

export interface FocusGap {
  selector: string;
  name: string;
  reason: string;
}

export interface TapTarget {
  selector: string;
  width: number;
  height: number;
  text: string;
}

export interface ProbeResult {
  overflow: Overflow[];
  contrast: ContrastPair[];
  /**
   * Text whose contrast could not be computed, because the element or an ancestor
   * paints a gradient.
   *
   * Reported as a count rather than dropped. A silently-skipped element and a passing
   * element look identical in a report, and the reader has to know which one this is —
   * especially since gradients are exactly where contrast problems hide.
   */
  contrastUnmeasured: number;
  clipped: TextClipping[];
  /** Filled in by the crawler, which owns the real `keyboard.press("Tab")` walk. */
  focusGaps: FocusGap[];
  /** Interactive controls with no accessible name at all. */
  unnamed: FocusGap[];
  /** Every interactive control's name and tab order, for the walker to diff against. */
  focusable: FocusGap[];
  imagesMissingAlt: string[];
  /**
   * Visible text that is Arabic saved after a cp1252 round trip.
   *
   * Each entry is the *corrected* text, because that is the half a reader is owed and
   * the only half that means anything. Every other probe here passed over 337 such
   * lines: the glyphs are real Latin-1 letters, so they have fonts, contrast ratios
   * and bounding boxes. See `probeMojibake`.
   */
  mojibake: string[];
  horizontalScroll: { scrollWidth: number; innerWidth: number };
  headingOrder: string[];
  tapTargets: TapTarget[];
}

/**
 * Runs every DOM-level probe. Called as `page.evaluate(runProbes)`.
 *
 * Must remain one self-contained function — see the note at the top of the file.
 */
export function runProbes(): ProbeResult {
  /* ── helpers ─────────────────────────────────────────────────────────── */

  /**
   * A short, stable path to an element.
   *
   * `id`, then `aria-label`, then `data-testid`, then a filtered class hint. A
   * finding is only actionable if someone can open a file with its selector —
   * `div:nth-child(3) > div` is not that. Kept short on purpose: a selector
   * needing eight qualifiers is itself a smell, but that is a design note, not
   * a defect, and this function's job is to locate things.
   *
   * This is for *display*. It is never used to match a keyboard-walk result to an
   * inventory entry — see the note on `assignFocusIndexes` in `crawl.ts`, where the
   * collision hazard of a deliberately-short selector is spelled out.
   */
  function describe(el: Element): string {
    const id = el.getAttribute("id");
    if (id) return "#" + id;
    const label = el.getAttribute("aria-label");
    if (label) {
      return el.tagName.toLowerCase() + '[aria-label="' + label.slice(0, 28) + '"]';
    }
    const testid = el.getAttribute("data-testid");
    if (testid) return '[data-testid="' + testid + '"]';
    const cls = (el.getAttribute("class") || "")
      .split(/\s+/)
      .filter(function (c) {
        return c && !/^(absolute|fixed|flex|grid|block|inline|hidden|relative|sticky|w-full|h-full)$/.test(c);
      })
      .slice(0, 2)
      .join(".");
    return el.tagName.toLowerCase() + (cls ? "." + cls : "");
  }

  /**
   * Is this element rendered *and* something a person could point at?
   *
   * Four exclusions, each earning its place by having produced a real false positive:
   *
   * - `opacity: 0` — the artwork layers and pre-hydration decoration park here.
   * - **content inside a closed `<details>`** — Chrome keeps such content in the
   *   accessibility tree's exclusion via `content-visibility: hidden` on the internal
   *   slot, but `getComputedStyle().display` on the child is still `block` and
   *   `getBoundingClientRect()` still returns a box. So a closed disclosure's contents
   *   look visible to every other check here, get added to the keyboard inventory, are
   *   then never reached by the Tab walk (correctly — they are not focusable), and are
   *   reported as eleven unreachable links on `/quotes`. The `<summary>` itself *is*
   *   visible and focusable, so it must not be excluded.
   * - visually-hidden `sr-only` boxes, which are 1×1 by design.
   * - `aria-hidden="true"`, which by definition leaves the accessibility tree.
   */
  function visible(el: Element): boolean {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (insideClosedDetails(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /** Is `el` inside a `<details>` that is not open, other than its own `<summary>`? */
  function insideClosedDetails(el: Element): boolean {
    const summary = el.closest("summary");
    let node: Element | null = el;
    while (node) {
      if (
        node.tagName === "DETAILS" &&
        !(node as HTMLDetailsElement).open &&
        !(summary && node.contains(summary))
      ) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  /**
   * Is this element visually hidden on purpose?
   *
   * Tailwind's `sr-only` is `position:absolute; width:1px; height:1px; overflow:hidden;
   * clip:rect(0,0,0,0)`. It is *supposed* to be a 1×1 box holding text no sighted reader
   * sees, so every geometric probe has to skip it:
   *
   * - the clipping probe would report the skip link as "27px of content in a 1px box,
   *   overflow hidden" on every page, forever
   * - the tap-target probe would report the same skip link as a 1×1 target
   *
   * Both are false positives on correct markup, and false positives on a *correct*
   * pattern are worse than nothing: a report that cries wolf about `sr-only` is a report
   * nobody reads, which means the real clipping bug in it goes unnoticed too.
   *
   * Detected by geometry and clip, not by class name, so a hand-written visually-hidden
   * utility is caught too.
   */
  function visuallyHidden(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 && rect.height <= 1) return true;
    const style = getComputedStyle(el);
    if (style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)") return true;
    return false;
  }

  /**
   * The background actually visible behind an element.
   *
   * Composites every ancestor's background colour from the root down to the element.
   *
   * ## The early-exit bug this comment exists to prevent
   *
   * The first version stopped as soon as the accumulated alpha reached 1. That is
   * backwards, and it failed on the single most common case in the app: backgrounds
   * paint **child over parent**, so an opaque `body` does *not* hide an opaque button
   * sitting on top of it. The walk stopped at `body`'s `rgb(5,5,5)`, never reached
   * `.btn-gold`'s `rgb(212,175,55)`, and reported the landing page's primary call to
   * action as black text on black at 1:1 — while axe, looking at the same element,
   * reported nothing at all.
   *
   * So: no early exit. Composite every layer in the chain, nearest last.
   *
   * ## Why reading only the nearest ancestor is also wrong
   *
   * Every heading in this app sits on a `glass` panel whose background is
   * `rgba(11,11,11,0.55)`. Comparing gold heading text against that value, rather than
   * against the composited result over the page beneath, would fail every single one of
   * them. `scripts/verify-contrast.mjs` already proved the token pairs pass; this checks
   * the *composited* result, which is what an eye receives.
   */
  function effectiveBackground(el: Element): string {
    const chain: Element[] = [];
    let node: Element | null = el;
    while (node) {
      chain.push(node);
      node = node.parentElement;
    }
    // Root first, so each layer is painted over the previous one.
    chain.reverse();

    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (const layer of chain) {
      const bg = getComputedStyle(layer).backgroundColor;
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(bg);
      if (!m) continue;
      const alpha = m[4] === undefined ? 1 : Number(m[4]);
      if (alpha <= 0) continue;
      r = r + (Number(m[1]) - r) * alpha;
      g = g + (Number(m[2]) - g) * alpha;
      b = b + (Number(m[3]) - b) * alpha;
      a = a + alpha * (1 - a);
      // Deliberately no `break` here. See the note above.
    }

    if (a < 0.999) {
      // Transparent all the way to <html>: assume the body colour, which is
      // #050505 in dark and #f4efe4 in Parchment. Read it rather than assume.
      const html = getComputedStyle(document.documentElement).backgroundColor;
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(html);
      if (m) {
        r = r * a + Number(m[1]) * (1 - a);
        g = g * a + Number(m[2]) * (1 - a);
        b = b * a + Number(m[3]) * (1 - a);
      }
    }
    return "rgb(" + Math.round(r) + ", " + Math.round(g) + ", " + Math.round(b) + ")";
  }

  /**
   * Does a gradient sit between this element and its background?
   *
   * A `linear-gradient` cannot be composited into a single colour, and guessing at one
   * would produce either false failures on perfectly legible buttons (the first version
   * of this probe guessed in exactly that way) or quiet passes on illegible ones. So the
   * element is skipped and counted, and axe — which does resolve gradients — gets the
   * verdict. What is *not* covered is a gradient layer, which is why the count is
   * surfaced rather than discarded.
   */
  function overGradient(el: Element): boolean {
    let node: Element | null = el;
    while (node) {
      const img = getComputedStyle(node).backgroundImage;
      if (img && img !== "none" && /gradient\(/.test(img)) return true;
      node = node.parentElement;
    }
    return false;
  }

  /**
   * An `rgb()`/`rgba()` string as `[r, g, b, a]`.
   *
   * ## Why the alpha is returned and not discarded
   *
   * The design system's dominant text pattern is an opacity-modified token:
   * `text-gold-muted/45` compiles to `rgb(217 208 186 / 0.45)`. Reading only the three
   * channels compares *full-opacity* gold against the background, which passes AA at
   * 13:1 — so the probe reported no contrast failure anywhere while axe, on the same
   * page and the same elements, reported nine.
   *
   * A probe blind to the most common way text is coloured in this codebase is not a
   * partial probe, it is a false assurance. So alpha comes back here and is composited.
   */
  function parseRgb(value: string): [number, number, number, number] {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.%]+))?\s*\)/.exec(value);
    if (!m) return [0, 0, 0, 1];
    let alpha = 1;
    if (m[4] !== undefined) {
      alpha = m[4].indexOf("%") >= 0 ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    }
    return [Number(m[1]), Number(m[2]), Number(m[3]), Number.isFinite(alpha) ? alpha : 1];
  }

  /** Composite a translucent colour over an opaque one. */
  function over(
    fg: [number, number, number, number],
    bg: [number, number, number]
  ): [number, number, number] {
    if (fg[3] >= 0.999) return [fg[0], fg[1], fg[2]];
    const a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
  }

  function luminance(rgb: [number, number, number]): number {
    const f = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  }

  function ratio(a: [number, number, number], b: [number, number, number]): number {
    const l1 = luminance(a);
    const l2 = luminance(b);
    const hi = l1 > l2 ? l1 : l2;
    const lo = l1 > l2 ? l2 : l1;
    return (hi + 0.05) / (lo + 0.05);
  }

  /** WCAG "large text": ≥24px, or ≥18.66px at weight ≥700. */
  function isLargeText(size: number, weight: number): boolean {
    return size >= 24 || (size >= 18.66 && weight >= 700);
  }

  /**
   * The accessible name, computed by hand.
   *
   * A simplified computation, and deliberately so: it reads `aria-labelledby`,
   * `aria-label`, `title`, `el.labels` and text content in roughly the order a browser
   * does. It will disagree with a real accessibility tree on the harder cases (CSS
   * `content`, `alt` on a nested image, `role`-based naming).
   *
   * ## Why `el.labels` is not optional
   *
   * The first version omitted it and reported every wrapped `<input>` as unnamed — 130+
   * of them, including `#journal-morning`, `#journal-question` and `#quote-search`, all of
   * which are correctly wrapped in a `<label>`. axe reported **zero** `label` and
   * `link-name` violations across all 204 visits, which is what proved the finding was
   * the probe's fault and not the markup's. Without checking axe, the obvious response
   * would have been to add `aria-label`s to a hundred already-correct form fields.
   *
   * Detecting a false positive by checking it against an independent tool is cheap. The
   * expensive part is having believed it.
   */
  function accessibleName(el: Element): string {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map(function (id) {
          const target = document.getElementById(id);
          return target && target.textContent ? target.textContent.trim() : "";
        })
        .filter(Boolean);
      if (parts.length > 0) return parts.join(" ");
    }
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    // An explicit <label for>, or an implicitly-associated wrapping <label>.
    const labels = (el as HTMLInputElement).labels;
    if (labels && labels.length > 0) {
      const text = Array.prototype.slice
        .call(labels)
        .map(function (l: Element) {
          return (l.textContent || "").trim();
        })
        .filter(Boolean)
        .join(" ");
      if (text) return text;
    }

    const title = el.getAttribute("title");
    if (title && title.trim()) return title.trim();
    const inner = (el as HTMLElement).innerText;
    if (inner && inner.trim()) return inner.trim();
    const value = (el as HTMLInputElement).value;
    if (value && value.trim()) return value.trim();
    const img = el.querySelector("img");
    if (img) {
      const alt = img.getAttribute("alt");
      if (alt && alt.trim()) return alt.trim();
    }
    return "";
  }

  const INTERACTIVE =
    'a[href], button, input, select, textarea, [role="button"], [role="link"], ' +
    '[role="tab"], [role="switch"], [role="menuitem"], [role="checkbox"], ' +
    '[role="radio"], summary, [tabindex]:not([tabindex="-1"])';

  function isDisabled(el: Element): boolean {
    if (
      el instanceof HTMLButtonElement ||
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLOptionElement
    ) {
      return el.disabled;
    }
    return el.getAttribute("aria-disabled") === "true";
  }

  /* ── probe: horizontal overflow ───────────────────────────────────────── */

  /**
   * Which element is wider than the viewport.
   *
   * `documentElement.scrollWidth > innerWidth` says *that* the page scrolls sideways, not
   * *what causes it*. On a page with a parallax artwork layer, a decorative `<img>`
   * spilling 8px and a price card spilling 8px are different defects: one is invisible
   * to a reader, the other pushes a "Subscribe" button off the screen. The report has to
   * name the cause.
   *
   * Three exclusions, each with a reason:
   *
   * - An element whose own `scrollWidth` exceeds its `clientWidth` is scrolling itself on
   *   purpose — a code block, a tab strip, a quote marquee.
   * - `position: fixed` elements are allowed to sit outside the viewport: that is how an
   *   off-canvas drawer is built.
   * - Nested offenders are collapsed by keeping only the outermost, because that is the
   *   element whose width had to change for the others to follow.
   */
  function probeOverflow(): Overflow[] {
    const inner = window.innerWidth;
    const docWidth = document.documentElement.scrollWidth;
    if (docWidth <= inner + 1) return [];

    const all = Array.prototype.slice.call(document.querySelectorAll("body *")) as HTMLElement[];
    const found: Overflow[] = [];

    for (const el of all) {
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.right <= inner + 1) continue;
      if (getComputedStyle(el).position === "fixed") continue;
      if (el.scrollWidth > el.clientWidth + 1) continue;

      // Keep only the outermost offender: if an ancestor is already reported, this one
      // is a consequence of that, not a separate defect.
      let ancestorOffender = false;
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        const pRect = parent.getBoundingClientRect();
        if (pRect.right > inner + 1 && parent.scrollWidth <= parent.clientWidth + 1) {
          ancestorOffender = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (ancestorOffender) continue;

      found.push({
        selector: describe(el),
        overflowPx: Math.round(rect.right - inner),
        scrollWidth: docWidth,
        clientWidth: inner,
        text: (el.textContent || "").trim().slice(0, 80),
      });
    }

    found.sort(function (a, b) {
      return b.overflowPx - a.overflowPx;
    });
    return found.slice(0, 12);
  }

  /* ── probe: contrast ─────────────────────────────────────────────────── */

  /**
   * Text contrast against the composited background.
   *
   * Scoped to elements that *directly* own a text node, so a `<section>` is never
   * reported for its descendants. This does not replace axe — where both run, axe's
   * verdict wins — but it is the only check that runs at all on the artwork pages, where
   * axe declines to judge because it cannot determine the background.
   */
  function probeContrast(): { failures: ContrastPair[]; unmeasured: number } {
    const all = Array.prototype.slice.call(document.querySelectorAll("body *")) as HTMLElement[];
    const failures: ContrastPair[] = [];
    let unmeasured = 0;

    for (const el of all) {
      if (!visible(el)) continue;

      let ownsText = false;
      const kids = Array.prototype.slice.call(el.childNodes) as ChildNode[];
      for (const n of kids) {
        if (n.nodeType === 3 && (n.textContent || "").trim() !== "") {
          ownsText = true;
          break;
        }
      }
      if (!ownsText) continue;

      const text = (el.textContent || "").trim();
      if (!text) continue;

      // A gradient has no single composite colour. Defer to axe and record the gap.
      if (overGradient(el)) {
        unmeasured += 1;
        continue;
      }

      const style = getComputedStyle(el);
      const size = parseFloat(style.fontSize) || 0;
      const weight = Number(style.fontWeight) || 400;
      const large = isLargeText(size, weight);
      const needed = large ? 3 : 4.5;

      // The text's own alpha is composited over the background before measuring. This is
      // the step that makes `text-gold-muted/45` measurable at all.
      const bgText = effectiveBackground(el);
      const bg = parseRgb(bgText);
      const composited = over(parseRgb(style.color), [bg[0], bg[1], bg[2]]);
      const measured = ratio(composited, [bg[0], bg[1], bg[2]]);

      if (measured < needed - 0.05) {
        failures.push({
          selector: describe(el),
          text: text.slice(0, 60),
          fontSizePx: size,
          fontWeight: weight,
          background: bgText,
          foreground: style.color,
          ratio: Math.round(measured * 100) / 100,
          required: needed,
          largeText: large,
        });
      }
    }

    failures.sort(function (a, b) {
      return a.ratio - b.ratio;
    });
    return { failures: failures.slice(0, 25), unmeasured };
  }

  /* ── probe: clipped text ─────────────────────────────────────────────── */

  /**
   * Text the reader cannot read, under two names.
   *
   * - `overflow-clipped`: a fixed-height box with `overflow: hidden` holding more
   *   content than fits. The user sees a sentence cut in half with no way to see the rest.
   * - `truncated-ellipsis`: single-line `text-overflow: ellipsis`. Fine on a nav label, a
   *   defect on a price or a warning — the report shows the text so a human decides which.
   *
   * `zero-height` is the third kind: a *block* element with no height that nonetheless
   * contains text. Invisible, so no screenshot would ever catch it.
   *
   * ## Why `zero-height` excludes inline boxes
   *
   * `clientHeight` is 0 for every non-replaced inline element in Chrome. An inline
   * `<a class="mt-1 inline-block">`… well, `inline-block` does have a client box, but a
   * plain `<a>` or `<span>` holding visible text does not. Testing `clientHeight === 0`
   * without also checking the display value therefore reported hundreds of correctly
   * rendered inline text nodes as "zero height but non-empty text" — 900+ findings in the
   * first full run, all of them fabricated. The check is now: a zero *rect*, or a
   * block-level box reporting no client height.
   */
  function probeClipping(): TextClipping[] {
    const all = Array.prototype.slice.call(document.querySelectorAll("body *")) as HTMLElement[];
    const found: TextClipping[] = [];

    for (const el of all) {
      if (!visible(el)) continue;
      if (visuallyHidden(el)) continue;
      const text = (el.textContent || "").trim();
      if (!text) continue;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      const clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
      if (clipsY && el.scrollHeight > el.clientHeight + 2) {
        found.push({
          selector: describe(el),
          text: text.slice(0, 60),
          kind: "overflow-clipped",
          detail:
            el.scrollHeight + "px of content in a " + el.clientHeight + "px box, overflow hidden",
        });
      }

      if (style.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 2) {
        found.push({
          selector: describe(el),
          text: text.slice(0, 60),
          kind: "truncated-ellipsis",
          detail:
            el.scrollWidth + "px of text in " + el.clientWidth + "px, ellipsis applied",
        });
      }

      // A block-level box holding text and rendering to nothing.
      const isInline =
        style.display === "inline" ||
        style.display.indexOf("inline-") === 0 ||
        style.display === "contents";
      const zeroBox = rect.height === 0 || (!isInline && el.clientHeight === 0);
      if (zeroBox && text.length > 3) {
        found.push({
          selector: describe(el),
          text: text.slice(0, 60),
          kind: "zero-height",
          detail:
            "renders to " + rect.height + "px high but contains " + text.length + " characters",
        });
      }
    }

    return found.slice(0, 20);
  }

  /* ── probe: keyboard inventory ───────────────────────────────────────── */

  /**
   * The keyboard-reachability *inventory*, not the verdict.
   *
   * This lists what should be reachable and what has no name. It does not try to walk
   * the tab order, because synthesising a `KeyboardEvent` inside the page does not move
   * focus — which is the usual reason an in-page focus probe reports a broken page as
   * perfectly reachable. The crawler presses real `Tab` keys via CDP and diffs the
   * result against this list.
   *
   * The split matters: this half alone cannot tell an intentionally-unreachable control
   * from an unreachable button, and the walk alone cannot tell an unnamed control from a
   * named one.
   */
  function probeFocus(): { focusable: FocusGap[]; unnamed: FocusGap[] } {
    const interactive = (
      Array.prototype.slice.call(document.querySelectorAll(INTERACTIVE)) as HTMLElement[]
    ).filter(visible);

    const focusable: FocusGap[] = [];
    const unnamed: FocusGap[] = [];

    for (const el of interactive) {
      const name = accessibleName(el);

      if (!name) {
        unnamed.push({
          selector: describe(el),
          name: "",
          reason:
            el instanceof HTMLInputElement
              ? "input type=" +
                (el.getAttribute("type") || "text") +
                " with no label, aria-label or title"
              : "interactive element with no accessible name",
        });
      }

      // A disabled control is *supposed* to be unreachable, so it is not a candidate —
      // reporting it would be a false positive on every form.
      if (isDisabled(el)) continue;
      if (el.getAttribute("aria-hidden") === "true") continue;

      focusable.push({
        selector: describe(el),
        name: name.slice(0, 40),
        reason:
          el.tabIndex < 0
            ? "tabindex=-1 on an enabled interactive element"
            : "should be reachable",
      });
    }

    return { focusable: focusable.slice(0, 200), unnamed: unnamed.slice(0, 20) };
  }

  /* ── probe: images ───────────────────────────────────────────────────── */

  /**
   * Images with no `alt` attribute at all.
   *
   * `alt=""` is *correct* for decoration and is not reported. The artwork layers are
   * decorative and correctly carry `alt=""`; only a genuinely missing attribute is a
   * finding, because a screen reader then reads the file name.
   */
  function probeImages(): string[] {
    const bad: string[] = [];
    const imgs = Array.prototype.slice.call(document.querySelectorAll("img")) as HTMLImageElement[];
    for (const img of imgs) {
      if (!visible(img)) continue;
      if (!img.hasAttribute("alt")) bad.push(describe(img));
    }
    return bad;
  }

  /* ── probe: mojibake ─────────────────────────────────────────────────── */

  /**
   * Visible text that is Arabic saved after a cp1252 round trip.
   *
   * ## Why this probe exists
   *
   * Mojibake is renderable. Every corrupted glyph is an ordinary Latin-1 letter, so it
   * has a font, a colour, a contrast ratio that passes, and a bounding box. Every other
   * probe in this file walked straight over 337 corrupted lines across 11 files: the
   * character counts looked healthy, the contrast passed, the clipping passed, and 433
   * unit tests passed. The page rendered `/journal` at 2398 "characters" that were all
   * garbage.
   *
   * It surfaced only by accident — a clicked control's label became a finding id, and
   * the corrupted label was what finally made it legible.
   *
   * ## The test
   *
   * The same self-validating one the source scanner uses: take a run of consecutive
   * non-ASCII characters, decode it as cp1252 bytes, and check whether Arabic comes
   * out. Real mojibake decodes to Arabic by construction; a typographic dash, a curly
   * quote or an accented Latin word decodes to more Latin-1 punctuation and not one
   * character from the Arabic block. A false positive is structurally impossible, which
   * matters for a probe that runs on every page of every locale in both themes.
   *
   * The browser has no cp1252 codec, so the 0x80-0x9F block is mapped by hand. That
   * block is the whole reason `latin1` is wrong here: those 32 byte values are
   * typographic characters in cp1252 and C1 controls in latin1, and the corrupted text
   * carries characters from both halves.
   */
  function probeMojibake(): string[] {
    /* cp1252 code point -> byte, for 0x80-0x9F. Everything else is its own byte. */
    const HIGH: Record<string, number> = {
      "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84,
      "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88,
      "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
      "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93,
      "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
      "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
      "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
    };

    function toBytes(run: string): number[] | null {
      const out: number[] = [];
      for (const ch of run) {
        const cp = ch.codePointAt(0) as number;
        if (cp > 0xff) {
          const mapped = HIGH[ch];
          if (mapped === undefined) return null;
          out.push(mapped);
        } else {
          out.push(cp);
        }
      }
      return out;
    }

    /** Decode cp1252 bytes as UTF-8, strictly. Returns null on malformed input. */
    function decode(run: string): string | null {
      const bytes = toBytes(run);
      if (bytes === null) return null;
      const merged = new Uint8Array(bytes);
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(merged);
      } catch {
        return null;
      }
    }

    const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
    const NON_ASCII = /[^\x00-\x7F]/;
    /** ASCII that ends a corrupted token. ASCII round-trips, so stopping is safe. */
    const BOUNDARY = /["'`<>(){}[\];,=|/]/;

    function runs(text: string): string[] {
      const out: string[] = [];
      let i = 0;
      while (i < text.length) {
        if (NON_ASCII.test(text.charAt(i))) {
          let j = i;
          while (j < text.length && !BOUNDARY.test(text.charAt(j))) j++;
          out.push(text.slice(i, j));
          i = j;
        } else {
          i++;
        }
      }
      return out;
    }

    const found: string[] = [];
    const seen: Record<string, boolean> = {};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      const text = node.nodeValue || "";
      if (text.trim().length > 0 && visible(node.parentElement as Element)) {
        for (const run of runs(text)) {
          if (run.length < 2) continue;
          const decoded = decode(run);
          if (decoded && ARABIC.test(decoded) && !seen[decoded]) {
            seen[decoded] = true;
            // Report the *corrected* text, because that is what a reader is owed and
            // it is the only half of the pair that means anything.
            found.push(decoded.slice(0, 40));
          }
        }
      }
      node = walker.nextNode();
    }

    return found;
  }

  /* ── probe: heading order ────────────────────────────────────────────── */

  /**
   * Heading levels that skip, plus the number of `<h1>`.
   *
   * A skipped level breaks "jump to heading" navigation in NVDA and VoiceOver, which is
   * a real regression for screen-reader users and invisible to a screenshot. Two `<h1>`s
   * is equally a defect: the page has no single answer to "what is this page".
   */
  function probeHeadingOrder(): string[] {
    const issues: string[] = [];
    const headings = Array.prototype.slice.call(
      document.querySelectorAll("h1,h2,h3,h4,h5,h6")
    ) as HTMLElement[];

    let previous = 0;
    for (const h of headings) {
      if (!visible(h)) continue;
      const level = Number(h.tagName.charAt(1));
      if (previous > 0 && level > previous + 1) {
        issues.push(
          "h" + previous + " → h" + level + ": " + (h.textContent || "").trim().slice(0, 40)
        );
      }
      previous = level;
    }

    const h1s = document.querySelectorAll("h1").length;
    if (h1s === 0) issues.push("no <h1> on the page");
    if (h1s > 1) issues.push(h1s + " <h1> elements");
    return issues;
  }

  /* ── probe: tap targets ──────────────────────────────────────────────── */

  /**
   * Controls smaller than 24×24.
   *
   * WCAG 2.5.8 (AA) requires 24×24; 44×44 is the figure the platform guidelines use and
   * what this product's mobile-first brief implies. The crawler grades these P2 below 24
   * and P3 above, so the report distinguishes "small" from "genuinely unusable" instead
   * of treating one number as the truth.
   */
  function probeTapTargets(): TapTarget[] {
    const small: TapTarget[] = [];
    const interactive = (
      Array.prototype.slice.call(document.querySelectorAll(INTERACTIVE)) as HTMLElement[]
    ).filter(visible);

    for (const el of interactive) {
      if (isDisabled(el)) continue;
      // A skip link is 1×1 by design until it takes focus; measuring it as a tap target
      // reports correct markup as a defect on every single page.
      if (visuallyHidden(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) {
        small.push({
          selector: describe(el),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          text: accessibleName(el).slice(0, 30),
        });
      }
    }
    return small.slice(0, 25);
  }

  /* ── run ─────────────────────────────────────────────────────────────── */

  const focus = probeFocus();
  const contrast = probeContrast();

  return {
    overflow: probeOverflow(),
    contrast: contrast.failures,
    contrastUnmeasured: contrast.unmeasured,
    clipped: probeClipping(),
    // Filled by the crawler's real Tab walk.
    focusGaps: [],
    unnamed: focus.unnamed,
    focusable: focus.focusable,
    imagesMissingAlt: probeImages(),
    mojibake: probeMojibake(),
    horizontalScroll: {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    },
    headingOrder: probeHeadingOrder(),
    tapTargets: probeTapTargets(),
  };
}