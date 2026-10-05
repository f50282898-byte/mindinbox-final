# AUDIT — عقل في صندوق / Mind in a Box (read-only)

Date: 2026-10-05. No file was modified. No secret printed. No package installed.
Method: full `src/` read (4 parallel readers) + author spot-verification of every
P0/P1 against source. Tags: `[V]` = verified by author in source, `[R]` = reported
by reader, spot-check before fixing. Dropped as false positives after verification:
`Markdown.tsx` javascript:-XSS (parser `markdown.ts:40` allow-lists schemes),
`i18n.tsx` bootstrap nonce (present, `layout.tsx:118`), delete-uid trust
(`api/account/route.ts:92,97` + `delete-auth/route.ts:36,51` derive uid from token),
`Shell.tsx:36` type mismatch (typecheck clean).

## Commands (exact output)

`npm run typecheck` → `> tsc --noEmit` → clean, no errors.
`npm run lint` → `> next lint` → `✔ No ESLint warnings or errors`.
`npm run build` (first run) → `✓ Compiled successfully` → `Linting and checking validity of types ...` →
`Collecting page data ...` → `> Build error occurred` →
`Error: ENOENT: no such file or directory, open 'C:\mindinbox-final\.next\server\pages-manifest.json'`
(`errno: -4058`, at `readManifest (next/dist/build/index.js:165:23)`).
Retry (`npm run build` again; note `rm -rf` is not valid PowerShell so `.next` was
NOT cleaned) → full success: `✓ Compiled successfully`, `✓ Generating static pages
(3/3)`, all routes emitted (`ƒ` dynamic incl. every page + middleware 25.9 kB;
first-load JS 87.6 kB shared, 232–288 kB on heaviest pages), only warning
`⚠ Using edge runtime on a page currently disables static generation for that page`.
Verdict: the first failure was a stale/corrupt `.next` artifact, not a source
defect — recorded here, not as a code issue. (A usable cross-shell clean is
`Remove-Item -Recurse -Force .next`.)

## SECTION A — Code & Logic Errors

[src/lib/auth/client.ts:154] `user.updateProfile(...)` is declared-but-never-assigned (`profile.ts` only merges the type) → TypeError; signup with displayName and guest-upgrade throw AFTER the account is created [V] | P0 | import `updateProfile` from firebase/auth and call `updateProfile(user, {displayName})`
[src/lib/auth/client.ts:163] same unbound-method call on the fresh-signup path [V] | P0 | same fix
[src/components/Dialogue.tsx:136] `onTurnStart` clears text of EVERY turn with the same `personaId`, wiping completed prior rounds [V] | P0 | track active placeholder ids from append-time and update by id only
[src/components/Dialogue.tsx:141] `onTurnDelta` appends each delta to every same-persona turn, duplicating text across rounds [V] | P0 | same fix
[src/lib/quota.ts:150] IP path `usage/ip-{day}/{hash}` has 3 segments (a collection reference) → REST 400 → `readCounter` 0; the documented per-IP daily ceiling never fires [V] | P0 | use an even-segment doc path, e.g. `usage-ip/{day}-{hash}`
[src/lib/quota.ts:178] same 3-segment path on the spend path (throw swallowed by `.catch`, so silent) [V] | P0 | same fix
[firestore.rules:302] no `match` for `users/{uid}/conversations/{id}` while `conversations.ts:261` writes there → sync setDoc denied, left pending forever; `onSnapshot` denied [V] | P0 | add a conversations match mirroring the entries key set
[src/lib/session.ts:199] telemetry writes `uid/startedAt/durationSeconds/updatedAt/endedAt` but `firestore.rules:469-475` allow only `uid/durationSeconds/createdAt` → every heartbeat denied (comment at session.ts:179 falsely claims compliance) [V] | P0 | align the two: write `createdAt`, drop extras or widen the allowlist
[src/components/WisdomChat.tsx:228] `onDelta` patches `{content:""}` and discards `chunk` → streaming bubble stays empty until completion; comment claims the opposite [V] | P1 | accumulate chunk into the message (or patch with running text) and keep final set from `outcome.text`
[src/components/riddle/RiddleSession.tsx:136] no-idToken early return leaves `phase="playing"` with `riddle=null` → empty dialog [V] | P1 | `setPhase("challenge")` on the early return
[src/components/AccountPanel.tsx:134] `deletePassword` is collected and gates the button (line 476) but `deleteAccount()` never uses it — no re-authentication before irreversible delete [V] | P1 | re-authenticate with the password (or remove the field)
[src/lib/entitlements.ts:99] `readGrants` lists the first 5 grants globally then filters by uid; any uid beyond the page loses its entitlement [V] | P1 | query/filter by uid server-side instead of listing
[src/app/page.tsx:72] JSON-LD inline `<script>` has no nonce, blocked by nonce-only `script-src` (`csp.ts`) [R] | P1 | read `x-nonce` via `headers()` and set `nonce={nonce}`
[src/app/page.tsx:77] nested `<main>` inside layout `<main id="main">` (`layout.tsx:145`) — duplicate landmarks [R] | P1 | change inner `main` to `div`
[src/app/god-mode-admin/page.tsx:34] `adminSessionUid()` (`string|null`) passed unchecked to `<AdminGate uid={uid}/>` [R] | P1 | `if (!uid) notFound()` after line 32
[src/app/admin/page.tsx:12] renders `<AdminConsole/>` with no server-side `hasAdminSession()`+`notFound()` gate (unlike god-mode-admin) — admin markup served 200 to anyone [V-partial] | P1 | make async, check session, `notFound()` before render
[src/components/admin/PricingCheck.tsx:45] `data.content.pricing` used without `Array.isArray` validation; malformed doc crashes `.map` [V-partial] | P1 | validate array, fall back to null
[src/lib/store.ts:175] `selectEntriesForDay` compares only `getDate()`, collides across months [R] | P1 | compare full yyyy-mm-dd
[src/lib/store.ts:104] `isAdmin` sticky (`state.isAdmin && same uid ? true`) never clears on revocation [R] | P1 | allow explicit false downgrade on verified false
[src/lib/store.ts:111] `setMembership` blocks any downgrade; expired subscription keeps premium UI [R] | P1 | always set the server-derived tier
[src/lib/conversations.ts:287] `syncTo` calls `onSnapshot` on every sync without unsubscribing — listener leak [R] | P1 | subscribe once per uid, stash unsubscribe
[src/lib/journal/store.ts:526] `flush` calls `observeRemote` every drain without unsubscribe [R] | P1 | subscribe once, store unsub
[src/lib/journal/store.ts:169] `mergeDays` wholesale-takes the newer side except habits; loses local journal/checkIn on concurrent edit [R] | P1 | field-wise last-write-wins per section
[src/lib/markdown.ts:82] `parseInline` runs `URL_RE` on input not buffer; indices mismatch after bold/code splits [R] | P1 | exec on buffer/slice, reset lastIndex
[src/lib/ai.ts:340] `catch` swallows `AbortError` and continues to next provider after caller abort [R] | P1 | break the chain when `signal.aborted`
[src/lib/admin/site-store.ts:202] undo restores with the same version; a stale tab can overwrite the undo [R] | P1 | set version to currentVersion+1
[src/lib/admin/audit.ts:133] audit id time+actor collides on same-ms writes, overwrites prior entry [R] | P1 | append randomUUID
[src/lib/signals/retention.ts:35] `expiredMonths` returns only 3 keys (limit 14..12); older months never pruned [R] | P1 | iterate all months older than window
[src/lib/ai/http.ts:64] `sseResponse` creates an isolated AbortController never linked to the request signal; client disconnect never aborts upstream [R] | P1 | accept the request signal and forward abort
[src/components/Dialogue.tsx:98] placeholder turns appended before fetch are never removed on `!res.ok` (line 118) — blank bubbles remain [R] | P1 | slice off the last two placeholders on failure
[src/components/Dialogue.tsx:228] `runRound(2)`/`runRound(3)` run unconditionally even if the prior round returned false [R] | P1 | `if (!(await runRound(2,picks))) return`
[src/components/WisdomChat.tsx:1006] header history delete calls local `remove(c.id)` only, unlike `ConversationList` which also calls `deleteRemote` — remote ghost [R] | P1 | also `if (uid) void deleteRemote(uid,c.id)`
[src/components/AccountPanel.tsx:344] `currentPassword` shared between password-change and email-change forms — typing mirrors across forms [R] | P1 | separate `pwCurrent`/`emailCurrent` states
[src/components/ShellChrome.tsx:27] `pathname.startsWith` with no null guard (`usePathname()` can be null) [R] | P1 | `const p = pathname ?? ""` first
[src/components/Sidebar.tsx:76] local `isActive` calls `pathname.startsWith` with no null guard [R] | P1 | guard `if (!pathname) return false`
[src/components/Sidebar.tsx:78] `handleSignOut` awaits `signOut(auth)` with no try/catch, passed directly to onClick — unhandled rejection [R] | P1 | wrap in try/catch + surface notice
[src/components/WisdomChat.tsx:102] `void syncTo(uid)` floating promise with no catch [R] | P1 | `.catch(()=>undefined)` or await in try/catch
[src/components/Journal.tsx:88] `remove()` deletes Firestore but never updates the zustand mirror; list stays stale until snapshot [R] | P1 | optimistic `removeEntry(id)` with rollback
[src/components/DailyTracker.tsx:123] `id.length===20` heuristic decides Firestore delete — brittle [R] | P1 | track a synced flag / Firestore-id marker
[src/components/admin/AdminGate.tsx:143] `sendVerification` fire-and-forget, no user feedback [R] | P1 | set status notice on success/failure
[src/components/AdminConsole.tsx:263] `key={index}` on banner/library editors misassigns inputs on remove [R] | P1 | stable id per row
[src/components/AdminConsole.tsx:145] `saveBanners`/`saveLibrary` persist empty headline/href rows [R] | P1 | filter empty headlines, validate href
[src/components/admin/SiteBuilder.tsx:281] preview iframe never refreshes after edits [R] | P1 | key iframe by dirty/version or add reload
[src/components/quotes/QuotesApp.tsx:289] `URL.revokeObjectURL` after 0ms can break the download [R] | P1 | revoke after 1000–5000ms
[src/components/journal/JournalApp.tsx:924] at-limit copy says free-plan even for members at a higher cap [R] | P1 | branch copy on isMember/limit
[src/components/Markdown.tsx:42] heading level 2 renders `h3`, others `h4` — skips outline level [R] | P1 | map to h2/h3 to preserve hierarchy
[src/components/Logo.tsx:87] static SVG filter id `innerGlow` collides with multiple instances [R] | P1 | generate id via `useId()`
[src/components/AuthPanel.tsx:218] hardcoded `عشرة محارف` contradicts imported `MIN_PASSWORD_LENGTH` [R] | P1 | interpolate the constant
[src/lib/ai/safety/wellbeing.ts:48] `ACUTE_PATTERNS` contains a `弊` typo; the intended Arabic phrase never matches [R] | P1 | fix the Arabic phrase
[src/lib/firebase/client.ts:62] `const e = process.env` alias contradicts the literal-read rule `config.ts` enforces (via `config.test.ts`); verify in the production bundle that keys survive [V-partial] | P2 | use literal `process.env.NEXT_PUBLIC_*` reads like `config.ts`
[src/components/Dialogue.tsx:93] `runRound` overwrites `abortRef.current` without aborting the prior controller — leaked in-flight request [R] | P2 | `abortRef.current?.abort()` before creating a new one
[src/components/Dialogue.tsx:287] `PERSONAS.find(...)!.id` non-null assertion can throw [R] | P2 | guard with `?? PERSONAS[0]` + early return
[src/components/DailyTracker.tsx:67] `days` memo with `[]` deps freezes `Date.now()`; week never rolls past midnight without remount [R] | P2 | recompute from a day-string dep or a midnight interval
[src/components/quotes/QuotesApp.tsx:78] `quoteOfTheDay` memo `[]` with `Date.now()` goes stale past midnight [R] | P2 | depend on day value
[src/components/quotes/QuotesApp.tsx:54] favourites in `useState` only, lost on reload [R] | P2 | persist to localStorage, hydrate on mount
[src/components/journal/JournalApp.tsx:444] `DayNav` reads today via `getState()` non-reactively [R] | P2 | subscribe to timezone setting
[src/components/journal/JournalApp.tsx:652] unused ref in `RatingRow` [R] | P2 | remove it
[src/components/journal/JournalApp.tsx:397] `doExport` reads the full store with no size guard; can freeze [R] | P2 | chunk export or cap days with notice
[src/components/GoldenSymbols.tsx:200] `solvedCount` prop can go stale vs store puzzles [R] | P2 | derive from `puzzles.length` internally
[src/components/MemberLibrary.tsx:167] filename can become `"-.pdf"` when the title sanitizes to empty [R] | P2 | fallback `document-${Date.now()}.pdf`
[src/components/MemberLibrary.tsx:238] `safeYouTubeEmbed` called twice per render with force `!` [R] | P3 | memoize embed URL per item
[src/components/AuthPanel.tsx:198] bare `setTimeout(...,1200)` with no cleanup leaks timer on unmount [R] | P2 | store id in ref, clear on unmount/mode change
[src/components/WisdomChat.tsx:413] bare `setTimeout(...,1800)` per copy with no clear — stacked timers [R] | P2 | store id in ref, clear before reset
[src/components/AccountPanel.tsx:116] export `a.click()` without `appendChild` fails in Firefox/Safari [R] | P2 | append to body, click, remove
[src/components/MemberLibrary.tsx:165] same unattached-anchor click fails in Firefox/Safari [R] | P2 | append, click, remove
[src/components/QuotaMeter.tsx:49] negative `remaining` renders `بقي لك -1 ...` with no clamp [R] | P2 | render exhausted copy when `remaining<=0`
[src/components/ThemeProvider.tsx:89] `toggle` reads `document.documentElement.dataset.theme` instead of React state — can diverge [R] | P2 | derive from `theme` state
[src/components/MembershipBanner.tsx:83] `Number(null)===0` and NaN handling for the dismiss key is implicit [R] | P3 | parse only when non-null, guard `Number.isNaN`
[src/components/MembershipGate.tsx:16] tier cast `as Tier` without validating the persisted value [R] | P3 | validate against ladder set, fallback free
[src/components/riddle/GoldenToken.tsx:68] anchor from `Date.now()%len` is predictable (declared atmosphere-only; fine) [R] | P3 | `crypto.getRandomValues` if ever load-bearing
[src/app/error.tsx:6] `export const runtime="edge"` in a `"use client"` boundary is ignored/misleading [R] | P3 | remove the export
[src/app/robots.ts:30] extra named export `ROBOTS_BLOCKED` from a MetadataRoute file [R] | P3 | move to `@/lib/nav`
[src/app/paths/page.tsx:55] `(d.tiers as readonly string[])` erases the tier union [R] | P3 | type as `TierId[]`, drop cast

## SECTION B — Design Violations

[src/components/Sidebar.tsx:143] desktop rail expands only on `onMouseEnter/Leave` — keyboard users can never expand it [R] | P1 | add `onFocus/Blur` + explicit expand/collapse button
[src/components/Sidebar.tsx:99] mobile drawer has no focus trap or focus restore (unlike `Shell.MoreSheet`) [R] | P1 | reuse trap + restore trigger focus on close
[src/components/PersonaCards.tsx:24] `radiogroup` of `role=radio` buttons has no arrow-key roving — Tab stops on every card [R] | P1 | ArrowUp/Down/Home/End roving tabindex or native radios
[src/components/GateDialog.tsx:56] `(node??document.body).focus()` — body is not focusable, initial focus is a no-op [R] | P1 | focus the close button or first action
[src/components/Turnstile.tsx:123] `if (!siteKey) return null` renders nothing, yet signup then errors `أكمل التحقق` [R] | P1 | render inline `role=alert` explaining signup is unavailable
[src/components/Journal.tsx:174] delete button `opacity-0` hover-only — unreachable on touch [R] | P1 | always visible on coarse pointers
[src/components/DailyTracker.tsx:311] same hover-only delete unreachable on mobile [R] | P1 | keep visible at small breakpoints / on touch
[src/components/journal/JournalApp.tsx:457] prev/next glyphs visually reversed in RTL [R] | P1 | swap glyphs under `dir=rtl` or use logical chevrons
[src/components/journal/JournalApp.tsx:460] raw DayKey ISO shown instead of a formatted date [R] | P1 | `Intl.DateTimeFormat` per locale
[src/components/UtopiaHero.tsx:98] space between inline-block chars collapses; words may jam [R] | P1 | render space as `\u00A0`
[src/components/GoldenSymbols.tsx:188] dialog closes on backdrop but has no Escape handler or focus trap [R] | P1 | `onKeyDown` Escape + trap + restore focus
[src/components/riddle/RiddleSession.tsx:247] no Escape to close, focus not returned on close [R] | P1 | handle Escape, restore focus
[src/components/riddle/GoldenToken.tsx:97] `onBlur={withdraw}` hides the token when a keyboard user tabs past it [V] | P1 | remove `onBlur` withdraw (timer already withdraws)
[src/components/riddle/GoldenToken.tsx:89] `aria-hidden={leaving}` on the ancestor of a possibly-focused button [V] | P1 | unmount instead of aria-hiding the focused subtree
[src/components/PremiumShield.tsx:52] global Ctrl+A/C/P block harms keyboard and screen-reader users [R] | P1 | remove A/P/U blocking, scope to container
[src/components/LegalDocument.tsx:107] missing `lang`/`dir` on ar/en paragraphs — mispronounced by screen readers [R] | P1 | `lang="ar" dir="rtl"` / `lang="en" dir="ltr"`
[src/components/admin/SiteBuilder.tsx:328] drag handle `aria-label` only "اسحب" with no keyboard hint [R] | P1 | `aria-describedby` with Space/arrows instructions
[src/components/AuthPanel.tsx:223] `tablist` tabs lack `aria-controls`/`tabpanel`; arrows just toggle — incomplete tab pattern [R] | P2 | roving tabindex, Home/End, linked tabpanels
[src/components/WisdomChat.tsx:989] history `<details>` never closes on Escape/outside-click, traps no focus [R] | P2 | close on Escape + outside pointerdown
[src/components/WisdomChat.tsx:953] rename input commits on `onBlur` + `autoFocus` — tabbing out renames by accident [R] | P2 | commit on Enter only, cancel on Escape/blur
[src/components/Shell.tsx:152] collapse/expand `x:-6` is physical, slides the wrong way in RTL [R] | P2 | sign `x` by `dir` or drop it
[src/components/Shell.tsx:269] logical `start-1/2` combined with physical `-translate-x-1/2` mis-centers the active dot in RTL [R] | P2 | match translate to the logical side
[src/components/Shell.tsx:210] `.toUpperCase()` + `tracking-[0.22em]` on Arabic group labels breaks joining/readability [R] | P2 | apply only when `locale==="en"`
[src/components/AuthPanel.tsx:264] email/password `Field` inputs lack `dir="ltr"` — LTR emails misalign in RTL layout [R] | P2 | add `dir="ltr"` + `text-start`
[src/components/AccountPanel.tsx:209] `email ?? "—"` bare dash with no skeleton while identity loads — missing loading state [R] | P2 | render a loading skeleton until first load
[src/components/AccountPanel.tsx:490] global error/notice pinned at page bottom, far from fields, no focus move [R] | P2 | move adjacent to form + focus `role=alert`
[src/components/MemberLibrary.tsx:329] `truncate` on title+summary with no `title` attr hides content [R] | P2 | add `title` or line-clamp wrap
[src/components/Membership.tsx:47] featured `md:-mt-4 md:mb-[-1rem]` can overlap neighbours [R] | P2 | highlight via scale/ring, no negative margins
[src/components/Membership.tsx:87] current-tier span not announced [R] | P2 | `aria-current="true"`
[src/components/quotes/QuotesApp.tsx:206] empty-results state is a plain `<p>` with no clear-filters action [R] | P2 | reset button clearing query/filters
[src/components/journal/Charts.tsx:165] tick labels `x=0` may clip in RTL SVG [R] | P2 | offset x, anchor start
[src/components/journal/AiConsentSwitch.tsx:76] knob `start-7`/`start-1` inverted in RTL [R] | P2 | verify under `dir=rtl` or use physical `left`
[src/components/GoldenSymbols.tsx:167] `style` translate property has poor support [R] | P2 | `transform: translate(-50%,-50%)`
[src/components/GreekColumns.tsx:124] positioning hardcodes `right:` — mirrored wrong in LTR [R] | P2 | `insetInlineStart` or respect `dir`
[src/components/UtopiaHero.tsx:56] hardcoded `rgba(212,175,55,0.09)` ignores the Parchment token [R] | P2 | `rgb(var(--gold)/0.09)`
[src/components/UtopiaHero.tsx:72] `bg-black/70` badge breaks the light theme [R] | P2 | surface token background
[src/components/LegalDocument.tsx:98] `scroll-mt-8` hides the anchor under the sticky header [R] | P2 | raise to `scroll-mt-24`
[src/components/journal/JournalApp.tsx:885] habit title `truncate` with no tooltip [R] | P2 | `title={habit.title}`
[src/app/layout.tsx:145] no global `loading.tsx`; heavy pages mount large client components with no loading/empty fallback [R] | P2 | add `src/app/loading.tsx` + `<Suspense>` around each client app
[src/app/not-found.tsx:24] `en` labels built but never rendered; links show Arabic only [R] | P2 | render bilingual span or delete the field
[src/app/layout.tsx:92] nonce falls back to `undefined` when middleware is skipped → bootstrap scripts ship nonceless, CSP blocks first paint [R] | P2 | keep matcher covering all page routes; fail closed when missing
[src/app/oracle/page.tsx:8] title `العرّاف — The Oracle` mixes RTL/LTR without bidi isolation (same `sanctum/page.tsx:9`, `tracker/page.tsx:9`) [R] | P3 | wrap Latin in `<bdi>` or Arabic-only titles
[src/app/paths/page.tsx:60] `tracking-[0.3em]` on Latin numerals inside an RTL container breaks letter-spacing direction [R] | P3 | add `dir="ltr"` to the span

## SECTION C — Performance

[src/components/WisdomChat.tsx:406] `sendLive` deps include per-token `streamText`, recreating the callback on every chunk [R] | P1 | hold the accumulator in a ref, drop `streamText` from deps
[src/components/art/ArtLayer.tsx:215] `sizes="100vw"` for all ids over-fetches small placements [R] | P1 | per-id sizes (e.g. emblem 160px)
[src/components/GreekColumns.tsx:107] 9 `useTransform` subscriptions + `scaleY` animate even under reduced motion [R] | P1 | skip transforms when reduced motion is preferred
[src/components/UtopiaHero.tsx:150] `style` opacity + `animate` opacity conflict causes flicker [R] | P1 | keep only one binding
[src/components/WisdomChat.tsx:130] `scrollIntoView({behavior:"smooth"})` on every `messages/status` change janks streaming, ignores reduced-motion [R] | P2 | gate on near-bottom + `prefers-reduced-motion`, use `auto`
[src/components/Dialogue.tsx:62] same smooth `scrollIntoView` on every `turns/summary` with no reduced-motion guard [R] | P2 | skip animation when reduced-motion is preferred
[src/components/Turnstile.tsx:91] 120ms poll up to 15s (~125 wakeups) instead of `script.onload` to render the widget [R] | P2 | `script.onload=render`, short poll only as fallback
[src/components/PersonaCards.tsx:29] cards re-render on every parent keystroke with no memo [R] | P2 | `memo(PersonaCard)` / `memo(PersonaCards)`
[src/components/WisdomChat.tsx:413] per-copy timer with no clear — stacked timers (see also SEC A) [R] | P2 | ref-held id, clear before reset
[src/components/art/ArtLayer.tsx:103] each `ArtLayer` fetches `art-manifest.json` separately [R] | P2 | module-level cached promise/context
[src/components/MemberLibrary.tsx:236] iframe without `loading="lazy"` blocks initial paint [R] | P2 | add `loading="lazy"`
[src/components/GoldDust.tsx:71] 44–52 boxShadow motes heavy on mobile paint [R] | P2 | reduce count under 640px, drop boxShadow
[src/components/DailyTracker.tsx:194] chart bars animate via framer-motion per bucket on every entries change [R] | P2 | memoize buckets, disable under reduced-motion
[src/components/art/ArtLayer.tsx:212] `aspectRatio` on an absolute `inset-0` container is ignored/stretches [R] | P2 | apply aspect only when not absolute-fill
[src/app/layout.tsx:77] `async` + `headers()` makes the root layout dynamic, opting every static legal page out of static generation [R] | P2 | accept as documented CSP cost or scope nonce to per-page headers
[src/app/account/page.tsx:21] `<AccountPanel/>` (likewise admin/dialogue/wisdom/journal/tracker/quotes/oracle/sanctum/pricing pages) render synchronously with no `Suspense`/dynamic split [R] | P2 | wrap each in `<Suspense fallback>` + dynamic import where heavy
[src/lib/edge-auth.ts:47] `loadKeys` fetch has no timeout/`AbortSignal`; slow JWKS hangs the edge [R] | P2 | 5s timeout like `auth/server.ts:83`
[src/lib/auth/server.ts:75] `jwksByProject` keyed by caller-supplied projectId — unbounded growth [R] | P2 | cache one static set, validate projectId
[src/lib/google/token.ts:55] `serviceAccountFromEnv` JSON-parses on every token/project/config call [R] | P2 | parse once and cache
[src/lib/session.ts:48] four separate `useAppStore` selectors + uid subscription cause repeated re-renders [R] | P2 | single shallow selector
[src/lib/conversations.ts:259] `syncTo` awaits `setDoc` sequentially per pending conversation [R] | P2 | batch/parallel with a limit
[src/lib/signals/track.ts:63] unidentified buffer unbounded for guests [R] | P2 | cap (e.g. 20), drop oldest
[src/lib/admin/site-store.ts:146] history snapshots never pruned to `HISTORY_DEPTH` [R] | P2 | delete beyond depth on publish
[src/components/journal/Charts.tsx:444] `new Set(recorded)` each render forces `WeekStrip` rerender [R] | P3 | memoize the recorded set
[src/components/journal/JournalApp.tsx:114] 20s flush interval drains battery [R] | P3 | flush on online/visibilitychange only
[src/components/Turnstile.tsx:63] `script.async=true` + `script.defer=true` together is redundant [R] | P3 | keep only `async`
[src/components/Shell.tsx:141] `layoutId="rail-active"` + `AnimatePresence` animates on every route change [R] | P3 | static indicator under reduced-motion
[src/app/layout.tsx:108] single blocking Google Fonts CSS request for 3 families delays first paint [R] | P3 | subset/preload used weights or self-host with `display=swap`
[src/lib/ai/breaker.ts:69] `recordSuccess` uses `Date.now()` ignoring the injected `now` — breaks tests/clocks [R] | P3 | pass `now` through

## SECTION D — Copy & Language

[src/app/privacy/page.tsx:131] Chinese glyphs `خارج中国大陆` inside an Arabic sentence [V] | P1 | replace with `خارج برّ الصين الرئيسي`
[src/app/terms/page.tsx:29] typo `تُحفّظ على التأمّل` (meaningless) [V] | P1 | change to `تُعين على التأمّل`
[src/components/AccountPanel.tsx:209] `email ?? "â€"` renders mojibake em-dash [V] | P1 | replace with `—` (U+2014) in UTF-8
[src/components/WisdomChat.tsx:864] `content.slice(0,40)}â€¦` renders mojibake ellipsis [V] | P1 | replace with `…` (U+2026)
[src/components/PersonaCards.tsx:86] `{epithetAr} Â· {years}` renders mojibake middle dot [V] | P1 | replace with `·` (U+00B7)
[src/components/MemberLibrary.tsx:305] `` ` Â· ${date}` `` renders mojibake separator (second site at line 461) [V] | P1 | replace both with `·`
[src/components/MemberLibrary.tsx:343] busy label `"â€¦"` alone is meaningless [V] | P1 | `"جارٍ التحميل…"`
[src/components/quotes/QuotesApp.tsx:318] `ترجمة {translator} â€” {edition}` renders mojibake dash [V] | P1 | replace with `—`
[src/components/journal/AiConsentSwitch.tsx:100] `"اتركه off"` mixes English into Arabic UI [R] | P1 | `"اتركه مغلقًا"`
[src/components/AdminConsole.tsx:194] `"طلبك غير يحملها"` ungrammatical [R] | P1 | `"طلبك لا يحملها"`
[src/components/Dialogue.tsx:300] `<span aria-hidden>â‡„</span>` mojibake swap arrow (decorative) [V] | P2 | replace with `⇄` (U+21C4)
[src/components/Journal.tsx:132] `"مسجّل الدخول لتبقى محفوظة"` grammar inverted [R] | P2 | `"سجّل الدخول لحفظها على جهازك"`
[src/components/MemberLibrary.tsx:185] leading `…` before Arabic loading text is in the wrong order [R] | P2 | trailing ellipsis: "جارٍ فتح مكتبتك…"
[src/components/GateDialog.tsx:139] `لا بطاقة، ولا تجديد تلقائي، ولا رقم بطاقة` repeats "card" twice in one sentence [R] | P2 | `لا بطاقة، ولا تجديد تلقائي`
[src/components/GateDialog.tsx:165] `remaining===0` prints `لديك 0 من المحاولات`, contradicting the calm-invitation rule [R] | P2 | hide the count when `remaining<=0`
[src/components/QuotaMeter.tsx:49] `${remaining} من الأسئلة` ignores Arabic plural/dual rules [R] | P2 | `Intl.PluralRules("ar")` one/two/few/many forms
[src/components/Shell.tsx:88] theme toggle shows `Parchment` (EN) in Arabic UI vs `الوضع الداكن` the other way [R] | P2 | route both labels through `t({ar,en})`
[src/components/AccountPanel.tsx:331] `Parchment` shown raw in the Arabic theme switcher [R] | P2 | `t({ar:"فاتح (رقّي)",en:"Parchment"})`
[src/components/PersonaCards.tsx:75] `nameEn` Latin rendered with no `lang="en"`/`dir` — bidi and pronunciation break [R] | P2 | `<span lang="en" dir="ltr">`
[src/components/journal/JournalApp.tsx:768] placeholder `"اكتب…"` generic [R] | P2 | use `template.hint` as placeholder
[src/components/PricingGrid.tsx:100] `key={i}` index key [R] | P2 | key by `tier.id`
[src/components/AdminConsole.tsx:207] `"وضع الإله · لوحة الإدارة"` deity wording [R] | P2 | keep `"لوحة الإدارة"` only
[src/components/riddle/RiddleSession.tsx:216] `"فُتح لك N أيام في Oracle"` English mid-Arabic [R] | P2 | `"فُتح لك N أيام في العرّاف"`
[src/app/refund/page.tsx:25] `فعاد إليها مالك` awkward/ungrammatical [R] | P2 | `فمالُك عائدٌ إليك`
[src/app/error.tsx:33] English-only body under an Arabic H1, no Arabic equivalent [R] | P3 | add Arabic sentence `dir="rtl"`, keep English secondary `dir="ltr"`
[src/app/not-found.tsx:19] English-only body under an Arabic H1 [R] | P3 | add Arabic equivalent above the English line
[src/app/tracker/page.tsx:17] og:image alt Arabic-only while title/description bilingual [R] | P3 | bilingual alt matching og:title
[src/components/GateDialog.tsx:121] `alt=""` on priority `/gate.png`, flags empty-alt checks [R] | P3 | `aria-hidden` if decorative, else meaningful alt
[src/components/AuthPanel.tsx:427] `placeholder:text-ink-3` with no `placeholder` prop anywhere in `Field` — dead style [R] | P3 | add real placeholders or drop the class
[src/components/Logo.tsx:41] `aria-label` mixes languages without `lang` [R] | P3 | Arabic-only label or split spans
[src/components/LegalDocument.tsx:100] Latin `01` numerals mixed into Arabic headings [R] | P3 | locale-consistent numbering

## SECTION E — Security & Privacy

[src/app/admin/page.tsx:12] no server-side admin gate (see SEC A entry); admin console markup served 200 to anyone — privilege actions depend on per-API gating, unverified here [V-partial] | P1 | gate with `hasAdminSession()`+`notFound()` like god-mode-admin
[src/app/oracle/page.tsx:26] `<MemberLibrary requiredTier="oracle"/>` (same `sanctum/page.tsx:30`) enforces tier client-side only — bypassable [R] | P1 | verify entitlement server-side, `notFound()`/redirect when lacking
[src/lib/riddle/secret.ts:24] falls back to `ANON_SESSION_SECRET` — one HMAC key for two purposes [R] | P1 | require a distinct `RIDDLE_SIGNING_SECRET`
[src/lib/admin/session.ts:48] admin cookie falls back through two unrelated secrets — cross-protocol key reuse [R] | P1 | require `ADMIN_PAGE_SECRET` only
[src/lib/ai/providers/index.ts:39] `baseUrl` allows `http` — plaintext upstream possible in prod [R] | P1 | require https like `anthropic.ts:46`
[firestore.rules:306] legacy entries allow admin create/update — an admin can forge any user's tracker rows [R] | P1 | make writes self-only
[storage.rules:40] `hasOracle` reads only subscriptions tier, ignores grants/trial — denies riddle-won oracle PDFs [R] | P1 | mirror `getEntitlements` sources
[src/components/MembershipBanner.tsx:155] `href` from Firestore rendered unchecked in `Link` [R] | P1 | allow only `/`-relative or https, fallback `/membership`
[src/components/PremiumShield.tsx:63] listeners attached to `document`, blocking the whole page instead of the scoped subtree [R] | P1 | attach to the container ref
[src/components/admin/SiteBuilder.tsx:281] preview iframe `src=/?preview` without `sandbox` [R] | P1 | `sandbox="allow-scripts allow-same-origin"`
[src/components/AccountPanel.tsx:148] `x-confirm-delete: uid` + [AccountPanel.tsx:164] `{uid}` body — reviewed: server derives uid from the verified token and cross-checks (`api/account/route.ts:92,97`, `delete-auth/route.ts:36,51`); client echo is a staleness guard only. No issue. [V] | P3 | no change; note records the verdict
[src/components/Markdown.tsx:129] `href={node.href}` trusts the parser invariant; no local scheme enforcement — defense-in-depth gap only (parser `markdown.ts:40` allow-lists) [V] | P3 | re-check `SAFE_SCHEME` at render, render others as text
[src/lib/quota.ts:146] salt shorter than 32 chars silently skips the IP check — degraded config is invisible [V] | P2 | log a warning when skipping
[src/lib/security/csp.ts:59] `connect-src` pre-lists paddle/lemonsqueezy before any integration — widens exfil surface [R] | P2 | remove until integrated
[src/lib/log.ts:108] `time()` logs `String(error)`, which may contain prompt/journal text [R] | P2 | redact to error code only
[src/lib/http.ts:17] trusts spoofable `x-real-ip` when `cf-connecting-ip` is absent [R] | P2 | trust only behind a known proxy, else null
[src/lib/auth/guards.ts:105] `Symbol.for` global registry lets any server module forge the authenticated identity [R] | P2 | use a module-private `Symbol`
[firestore.rules:476] `analyticsSessions` update does not restrict keys — attacker can inject arbitrary fields [R] | P2 | enforce `hasOnly` like create
[src/app/account/page.tsx:20] private page relies on `noindex`+robots only, no server auth redirect [R] | P2 | check session server-side or document client-local data
[src/app/robots.ts:14] hardcoded `blocked` list duplicates `HIDDEN_ROUTES`, will drift [R] | P2 | derive `disallow` from `[...HIDDEN_ROUTES,"/account","/api/"]`
[src/app/god-mode-admin/page.tsx:25] `alternates.canonical:"/admin"` points at a different URL, advertising a hidden route to crawlers [R] | P3 | remove `alternates` or canonicalize self
