import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { FIREBASE_ENV_KEYS } from "./config";

/**
 * A test that reads its own source files.
 *
 * ## Why this is not a normal test
 *
 * The bug this guards is a **build-time** bug wearing a runtime costume.
 *
 * Next.js substitutes `process.env.NEXT_PUBLIC_FOO` in client bundles by replacing the
 * literal text of that expression. `process.env[key]` is not that text. Written that
 * way it compiles, lints, typechecks and passes every test in this repository — because
 * under vitest `process.env` is a genuine object and the lookup works. It fails only
 * after `next build`, only in the browser, and only in the direction of "the feature is
 * not available".
 *
 * The consequence was that with Firebase correctly configured in Cloudflare, the server
 * rendered the sign-in form into `/enter`, the browser decided Firebase was absent,
 * React discarded the server HTML (error #423) and re-rendered "sign-in is not
 * available right now". Nobody could sign in. The journal, the tracker and the admin
 * panel were all behind the same broken answer.
 *
 * Every behavioural test in the repo passed while that was true, because the broken code
 * path is indistinguishable from correct code when `process.env` is real. So the check
 * cannot be behavioural, and asserting on the source text is not a workaround here — it
 * is the only assertion that targets the actual defect.
 */

/** Strip comments, so prose about `process.env[` does not fail the check below. */
function code(path: string): string {
  const full = /^[A-Za-z]:[\\/]/.test(path) ? path : join(process.cwd(), path);
  return readFileSync(full, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("config.ts reads its keys so a browser can see them", () => {
  it("contains no computed process.env access", () => {
    // The single line that broke sign-in was `const value = process.env[key]`.
    expect(code("src/lib/firebase/config.ts")).not.toMatch(/process\.env\[/);
  });

  it("reads every key it declares with a literal member access", () => {
    const source = code("src/lib/firebase/config.ts");
    for (const key of FIREBASE_ENV_KEYS) {
      // `NEXT_PUBLIC_*` is the prefix that triggers substitution. Each must appear as
      // `process.env.<NAME>`, never behind an index.
      expect(source, `${key} is not read literally`).toContain(`process.env.${key}`);
    }
  });

  it("declares no key it does not read", () => {
    // A name added to FIREBASE_ENV_KEYS without a matching read would report itself as
    // "present" while never having been checked — the kind of drift that turns into a
    // silent pass rather than a visible failure.
    const source = code("src/lib/firebase/config.ts");
    const declared = new Set(
      Array.from(source.matchAll(/NEXT_PUBLIC_FIREBASE_[A-Z_]+/g)).map((m) => m[0])
    );
    for (const key of FIREBASE_ENV_KEYS) {
      expect(declared.has(key), `${key} is declared but never read`).toBe(true);
      expect(source).toContain(`process.env.${key}`);
    }
  });
});

describe("no module reads a NEXT_PUBLIC_ key by computed access", () => {
  /**
   * The general form of the guard, so a second module cannot make the same mistake.
   *
   * `lib/ai/providers/index.ts` legitimately does `process.env[name]` — for
   * `ANTHROPIC_API_KEY` and friends, which are server-side secrets read inside adapter
   * closures that never execute in a browser. So this is not "no computed access
   * anywhere"; it is "no computed access in a file that talks about `NEXT_PUBLIC_`".
   *
   * That distinction is the whole point. Reading a server secret dynamically is safe
   * precisely because there is no browser to read it in.
   */
  it("holds across src/", () => {
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const source = code(full);
          if (/process\.env\[/.test(source) && /NEXT_PUBLIC_/.test(source)) {
            offenders.push(full.replace(/\\/g, "/"));
          }
        }
      }
    };

    walk(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});
