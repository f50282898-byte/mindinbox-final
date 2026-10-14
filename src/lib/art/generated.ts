/**
 * GENERATED FILE — do not edit by hand.
 * Written by `scripts/build-art.mjs`. Re-run `npm run art:build` to refresh it.
 *
 * Which artwork actually exists on disk. `ArtLayer` imports this instead of
 * fetching `art-manifest.json` at runtime, so the `<picture>` is present in the
 * server-rendered HTML and an above-the-fold image can be given a real
 * `fetchpriority` rather than arriving after LCP was already recorded.
 *
 * An id that is `false` is not an error: the layer renders the caller's
 * `fallback` and the page shows its token background.
 */

export const ART_AVAILABLE: Readonly<Record<string, boolean>> = {
  "colonnade": true,
  "gate": true,
  "hourglass": true,
  "agora": true,
  "cityscape": true,
  "astrolabe": true
};
