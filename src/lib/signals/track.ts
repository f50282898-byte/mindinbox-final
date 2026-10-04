"use client";

/**
 * Signal collection.
 *
 * ## The only path out of the browser
 *
 * `sendBeacon` to `/api/signals`, same origin, one request. No third-party pixel, no
 * `fetch` to anywhere else, no image beacon. This is the whole network surface of
 * the feature and `e2e/signals.spec.ts` asserts it by counting requests.
 *
 * ## The gate is here, not at the receiver
 *
 * `track()` consults consent **before** building a payload, so a refused signal is
 * never serialised, never queued, and never sent. The receiver checks again —
 * because a client-side-only gate is not a gate — but if this check is the one that
 * runs, the acceptance test sees zero requests, which is the observable the brief
 * asks for.
 *
 * ## Unidentified signals
 *
 * A guest's events are counted in memory for the session so the experience can be
 * coherent, and are then **dropped**. They are never written anywhere and never
 * attached to a uid later. Attaching them retroactively is the same disclosure with
 * extra steps and a plausible-looking paper trail.
 */

import {
  decideSignal,
  DEFAULT_GLOBAL,
  type ConsentState,
  type GlobalSwitch,
} from "./consent";
import {
  bucketFor,
  isCollectable,
  type ConsentSwitch,
  type Signal,
  type SignalKind,
} from "./types";

/** Where a batch is posted. Same origin, always. */
const ENDPOINT = "/api/signals";

/** A batch is small on purpose — the vocabulary is five kinds. */
const MAX_BATCH = 20;

interface PendingSignal extends Signal {
  uid?: string;
}

let consent: ConsentState | null = null;
let globalSwitch: GlobalSwitch = { ...DEFAULT_GLOBAL };
let uid: string | null = null;
let timeZone = "UTC";

/**
 * Signals raised before identity is known, held for the session only.
 *
 * Deliberately module-scoped and never persisted: there is no path from here to
 * storage.
 */
const unidentified: PendingSignal[] = [];

/** Set by tests and by the consent screen. */
export function configureSignals(next: {
  consent?: ConsentState | null;
  global?: GlobalSwitch;
  uid?: string | null;
  timeZone?: string;
}): void {
  if ("consent" in next) consent = next.consent ?? null;
  if (next.global) globalSwitch = next.global;
  if ("uid" in next) uid = next.uid ?? null;
  if (next.timeZone) timeZone = next.timeZone;
}

/** For tests: forget everything, including the session-only buffer. */
export function resetSignals(): void {
  consent = null;
  globalSwitch = { ...DEFAULT_GLOBAL };
  uid = null;
  timeZone = "UTC";
  unidentified.length = 0;
}

/** Test seam: what is currently held but unidentified. */
export function pendingUnidentified(): readonly Signal[] {
  return unidentified;
}

/**
 * Records one semantic event.
 *
 * Returns whether it was accepted, so callers and tests can assert the gate
 * without watching the network — though the e2e does watch the network, because
 * that is the claim that actually matters.
 */
export function track(
  kind: SignalKind,
  value: string,
  consentSwitch: ConsentSwitch = "conversation"
): boolean {
  const signal: PendingSignal = {
    kind,
    value,
    at: Date.now(),
    consent: consentSwitch,
    identified: Boolean(uid),
    ...(uid ? { uid } : {}),
  };

  // Vocabulary first: a rejected kind must not even reach the consent check,
  // because the consent check is about *this* reader and this kind is not a thing
  // we collect from anyone.
  if (!isCollectable(signal)) return false;

  // The gate. Refusal returns here — nothing is built, nothing is queued.
  const decision = decideSignal(signal, consent, globalSwitch);
  if (!decision.allowed) {
    return false;
  }

  // Only identified signals are ever sent.
  if (!signal.identified) {
    unidentified.push(signal);
    return false;
  }

  void send([signal]);
  return true;
}

/** Records the clock bucket, which is derived from the instant, not typed. */
export function trackTimeOfDay(): boolean {
  return track("time_of_day", bucketFor(Date.now(), timeZone));
}

/**
 * Sends a batch.
 *
 * `sendBeacon` is used because it survives the page being closed mid-request,
 * which matters for a signal raised on navigation. It is fire-and-forget: there is
 * deliberately no `await`, no retry, and no queue-on-failure. A signal that cannot
 * be delivered is dropped rather than buffered, because buffering behavioural data
 * on the reader's disk is exactly the practice this feature exists to avoid.
 */
function send(signals: PendingSignal[]): void {
  if (signals.length === 0) return;
  const batch = signals.slice(0, MAX_BATCH);

  const body = JSON.stringify({
    uid,
    signals: batch.map((s) => ({ kind: s.kind, value: s.value, at: s.at, consent: s.consent })),
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    // `false` means the browser refused to queue it. Nothing is retried, on purpose.
    navigator.sendBeacon(ENDPOINT, blob);
    return;
  }

  // Fallback for environments without `sendBeacon`. Still same-origin, still
  // fire-and-forget, still no retry.
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

/** Flushes anything identified and queued. Called when identity resolves. */
export function flushIdentified(): void {
  unidentified.length = 0;
}

/**
 * Drops every held signal.
 *
 * Called when consent is withdrawn or a pause begins. Existing aggregate documents
 * are removed by `/api/signals/clear`; this only empties the in-memory buffer.
 */
export function dropPending(): void {
  unidentified.length = 0;
}
