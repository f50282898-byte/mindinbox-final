/**
 * Per-provider circuit breaker.
 *
 * A provider that has just failed three times in a row is skipped for a minute.
 * Without this, a total outage at provider #1 costs every request the full
 * time-to-first-token budget before failing over — so a slow provider turns into
 * a slow product for everyone.
 *
 * State is per Worker isolate. That is a deliberate simplification: a shared
 * store would need a network round trip to decide whether to even try a
 * provider, which is the cost the breaker exists to avoid. The consequence is
 * that a cold isolate starts closed, which is safe — the worst case is a few
 * wasted attempts, never a wrongly-opened circuit.
 */

export type BreakerState = "closed" | "open" | "half_open";

interface Entry {
  state: BreakerState;
  consecutiveFailures: number;
  /** Epoch ms until which the circuit stays open. */
  openUntil: number;
  /** Epoch ms of the last state change, for the probe window. */
  changedAt: number;
}

export interface BreakerConfig {
  /** Failures in a row before opening. */
  threshold: number;
  /** How long the circuit stays open. */
  cooldownMs: number;
}

const entries = new Map<string, Entry>();

function blank(now: number): Entry {
  return { state: "closed", consecutiveFailures: 0, openUntil: 0, changedAt: now };
}

export function breakerState(id: string, config: BreakerConfig, now: number): BreakerState {
  const entry = entries.get(id);
  if (!entry) return "closed";

  if (entry.state === "open") {
    if (now >= entry.openUntil) {
      // Cooldown elapsed: allow exactly one probe through, then decide.
      entry.state = "half_open";
      entry.changedAt = now;
      return "half_open";
    }
    return "open";
  }

  return entry.state;
}

/** Whether an attempt may be made right now. */
export function canAttempt(id: string, config: BreakerConfig, now: number): boolean {
  return breakerState(id, config, now) !== "open";
}

/**
 * Records a successful attempt. Closes the circuit.
 *
 * Called once the first token has arrived — an upstream that answers but then
 * dies mid-stream is a different failure, and the user is already invested.
 */
export function recordSuccess(id: string): void {
  entries.set(id, blank(Date.now()));
}

/**
 * Records a failed attempt.
 *
 * A half-open circuit opens again on a single failure: the probe was our chance
 * to find out, and it failed.
 */
export function recordFailure(id: string, config: BreakerConfig, now: number): void {
  const entry = entries.get(id) ?? blank(now);

  if (entry.state === "half_open") {
    entry.state = "open";
    entry.openUntil = now + config.cooldownMs;
    entry.changedAt = now;
    entries.set(id, entry);
    return;
  }

  entry.consecutiveFailures += 1;
  if (entry.consecutiveFailures >= config.threshold) {
    entry.state = "open";
    entry.openUntil = now + config.cooldownMs;
    entry.changedAt = now;
  }
  entries.set(id, entry);
}

/** Snapshot for the health endpoint. Contains no secrets. */
export function breakerSnapshot(config: BreakerConfig, now: number): Record<string, BreakerState> {
  const out: Record<string, BreakerState> = {};
  for (const id of entries.keys()) out[id] = breakerState(id, config, now);
  return out;
}

/** Test seam: forget every circuit. */
export function resetBreakers(): void {
  entries.clear();
}
