import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "whale-alert-sound-muted";

/**
 * Web Audio beeps — no asset file, no API call.
 * - playPump   : LONG / BUY whale (high beep, 900Hz)
 * - playDump   : SHORT / SELL whale (low beep, 380Hz)
 * - playUrgent : breaking news (triple beep, 1200Hz)
 */
export function useWhaleAlertSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setMuted(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const ensureCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }, []);

  const beepAt = useCallback(
    (ctx: AudioContext, freq: number, startOffset: number, duration = 0.15, volume = 0.18) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + startOffset;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    },
    [],
  );

  const playPump = useCallback(() => {
    if (muted) return;
    const ctx = ensureCtx(); if (!ctx) return;
    try { beepAt(ctx, 900, 0); } catch { /* ignore */ }
  }, [muted, ensureCtx, beepAt]);

  const playDump = useCallback(() => {
    if (muted) return;
    const ctx = ensureCtx(); if (!ctx) return;
    try { beepAt(ctx, 380, 0, 0.18); } catch { /* ignore */ }
  }, [muted, ensureCtx, beepAt]);

  const playUrgent = useCallback(() => {
    if (muted) return;
    const ctx = ensureCtx(); if (!ctx) return;
    try {
      beepAt(ctx, 1200, 0, 0.12, 0.22);
      beepAt(ctx, 1200, 0.18, 0.12, 0.22);
      beepAt(ctx, 1500, 0.36, 0.16, 0.22);
    } catch { /* ignore */ }
  }, [muted, ensureCtx, beepAt]);

  // Backwards-compat alias
  const playBeep = playPump;

  return { playBeep, playPump, playDump, playUrgent, muted, toggleMuted };
}
