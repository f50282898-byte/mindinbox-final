/**
 * The ambient voice — a drone synthesised in the browser, not a file.
 *
 * ## Why no audio file
 *
 * A three-minute ambient loop is 3–5MB of MP3 or 6–10MB of lossless, and every
 * visitor pays for all of it on first play before hearing a second of it. Built
 * from oscillators and filters it is **zero bytes of payload** — the code that is
 * already in the bundle — and it never loops audibly, because nothing is sampled.
 *
 * ## The voicing
 *
 * A root at ~55Hz (A1) with a fifth and an octave above it, all slightly detuned
 * against each other. The beating between those detunes is what produces the slow
 * shimmer a static sine cannot: the waveform is never quite the same twice, so the
 * ear never finds a period and never locks onto it.
 *
 * An LFO moves the filter cutoff on a ~40s cycle. Forty seconds is deliberate —
 * faster and it reads as a wobble, slower and it stops being noticed at all.
 *
 * ## Everything is built lazily
 *
 * `AudioContext`, its oscillators and its filters are only constructed inside
 * `start()`, after a real user gesture. Browsers refuse to start audio without
 * one, and building the graph eagerly on page load would both fail and cost
 * memory on a page the reader never used audio from.
 */

/** Root, fifth, octave — A1, E2, A2. */
const VOICES = [
  { hz: 55.0, detune: 0, gain: 0.5 },
  { hz: 82.41, detune: +4, gain: 0.24 },
  { hz: 110.0, detune: -6, gain: 0.16 },
] as const;

/** Where the low-pass sits at rest, and how far the LFO swings it. */
const CUTOFF_BASE = 320;
const CUTOFF_SWING = 190;

/** Fade length. Long enough that the onset is never a click. */
const FADE_MS = 1400;

/** The LFO's period in seconds. See the note above on why forty. */
const LFO_PERIOD_S = 40;

export interface DroneHandle {
  /** Resolves once the fade-in has finished. */
  start: () => Promise<void>;
  /** Resolves once the graph has been torn down and the context released. */
  stop: () => Promise<void>;
}

export function createDrone(): DroneHandle | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  let sources: OscillatorNode[] = [];
  let stopping: Promise<void> | null = null;

  return {
    async start() {
      // Already running, or coming up the fade. Either way, do not rebuild.
      if (ctx) {
        if (ctx.state === "suspended") await ctx.resume();
        return;
      }

      ctx = new Ctor();
      if (ctx.state === "suspended") await ctx.resume();

      master = ctx.createGain();
      // Start silent and ramp up: starting at full gain is the click everyone
      // associates with bad web audio.
      master.gain.setValueAtTime(0.0001, ctx.currentTime);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(CUTOFF_BASE, ctx.currentTime);
      filter.Q.setValueAtTime(0.7, ctx.currentTime);

      // The shimmer: cutoff drifting on a long cycle.
      lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(1 / LFO_PERIOD_S, ctx.currentTime);
      lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(CUTOFF_SWING, ctx.currentTime);
      lfo.connect(lfoGain).connect(filter.frequency);

      sources = VOICES.map((v) => {
        const osc = ctx!.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(v.hz, ctx!.currentTime);
        osc.detune.setValueAtTime(v.detune, ctx!.currentTime);

        const g = ctx!.createGain();
        g.gain.setValueAtTime(v.gain, ctx!.currentTime);

        osc.connect(g).connect(filter);
        return osc;
      });

      filter.connect(master).connect(ctx.destination);

      const t = ctx.currentTime;
      master.gain.exponentialRampToValueAtTime(0.16, t + FADE_MS / 1000);

      lfo.start();
      for (const osc of sources) osc.start();
    },

    async stop() {
      if (!ctx || !master || stopping) return stopping ?? undefined;

      stopping = (async () => {
        const c = ctx;
        const m = master;
        const fadeEnd = c.currentTime + FADE_MS / 1000;

        // Cancel scheduled values first: without this, the fade-in ramp still
        // queued against the same AudioParam fights the fade-out and the drone
        // lurches instead of fading.
        m.gain.cancelScheduledValues(c.currentTime);
        m.gain.setValueAtTime(Math.max(m.gain.value, 0.0001), c.currentTime);
        m.gain.exponentialRampToValueAtTime(0.0001, fadeEnd);

        await new Promise<void>((resolve) => setTimeout(resolve, FADE_MS + 120));

        for (const osc of sources) {
          try {
            osc.stop();
          } catch {
            // Already stopped; nothing to do.
          }
        }
        try {
          lfo?.stop();
        } catch {
          // Same.
        }
        sources = [];
        lfo = null;
        lfoGain = null;
        master = null;
        ctx = null;

        // Release the hardware. A suspended context still holds a real device slot
        // on some platforms, and this page is not the owner of the audio hardware.
        await c.close().catch(() => undefined);
        stopping = null;
      })();

      return stopping;
    },
  };
}