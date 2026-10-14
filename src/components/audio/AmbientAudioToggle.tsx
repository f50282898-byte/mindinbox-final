"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDrone, type DroneHandle } from "@/lib/audio/drone";

/**
 * The ambient toggle.
 *
 * ## Off until asked
 *
 * Audio the reader did not request is a defect, not a feature. The default is
 * off, the label says so, and the control is a real `button` with `aria-pressed`
 * so a screen reader announces its state rather than a reader having to infer it
 * from an icon.
 *
 * ## No audio context until the gesture
 *
 * The `AudioContext` is created inside the click handler, not on mount. Every
 * browser blocks audio that did not begin with a gesture, so building it earlier
 * would produce a context that starts suspended — and on some platforms an
 * abandoned context holds a hardware slot for the life of the tab.
 *
 * ## State that survives a re-render but not a remount
 *
 * `useRef`, not `useState`, for the handle: the `DroneHandle` is a mutable
 * object, and putting it in state would make the identity change on every render
 * and re-trigger the effect that owns it. The boolean that drives the UI *is*
 * state, because the label depends on it.
 */

/** Where it sits: bottom-left on mobile (clear of the bottom bar), bottom-right on desktop. */
export function AmbientAudioToggle() {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  const handleRef = useRef<DroneHandle | null>(null);
  // A ref mirroring `on`, so the unmount cleanup reads the current value without
  // listing `on` as a dependency and re-running the effect on every toggle.
  const onRef = useRef(false);

  useEffect(() => {
    // Lets the button render its real label instead of guessing on the server.
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    setReady(Boolean(Ctor));

    return () => {
      // Leaving the page mid-drone must not strand an oscillator. No fade here on
      // purpose: the document is going away and the fade would be inaudible, while
      // awaiting it would keep the context alive for FADE_MS.
      void handleRef.current?.stop();
      handleRef.current = null;
      onRef.current = false;
    };
  }, []);

  const toggle = useCallback(async () => {
    if (onRef.current) {
      onRef.current = false;
      setOn(false);
      await handleRef.current?.stop();
      return;
    }

    if (!handleRef.current) handleRef.current = createDrone();
    if (!handleRef.current) return;

    try {
      await handleRef.current.start();
      onRef.current = true;
      setOn(true);
    } catch {
      // Autoplay policy, no audio device, or a platform with no Web Audio. Leave
      // the control showing "off" rather than pretending it started.
      onRef.current = false;
      setOn(false);
    }
  }, []);

  if (!ready) return null;

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={on}
      aria-label={on ? "كتم العزل الصوتي" : "تشغيل العزل الصوتي"}
      title={on ? "كتم العزل الصوتي" : "العزل الصوتي"}
      className={`pointer-events-auto fixed bottom-24 left-4 z-40 flex size-11 items-center justify-center rounded-full border backdrop-blur-md transition-colors duration-500 md:bottom-8 md:left-auto md:right-8 ${
        on
          ? "border-gold/45 bg-gold/[0.10] text-gold-light"
          : "border-gold/20 bg-black/50 text-gold-muted/70 hover:border-gold/35 hover:text-gold-light"
      }`}
    >
      {/*
        Three bars that breathe while the drone is up. `aria-hidden` — the button's
        label already says what it does, and a decorative icon is not content.
      */}
      <span aria-hidden="true" className="flex items-end gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`block w-[2px] rounded-full bg-current transition-all duration-500 ${
              on ? "animate-veil" : ""
            }`}
            style={{
              height: on ? `${[7, 13, 9][i]}px` : "4px",
              animationDelay: on ? `${i * 0.28}s` : undefined,
            }}
          />
        ))}
      </span>
    </button>
  );
}

export default AmbientAudioToggle;