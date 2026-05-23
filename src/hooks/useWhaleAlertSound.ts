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

  // Pleasant tonal note with harmonic overtone + soft attack/release envelope.
  const noteAt = useCallback(
    (
      ctx: AudioContext,
      freq: number,
      startOffset: number,
      duration = 0.22,
      volume = 0.16,
      type: OscillatorType = "triangle",
    ) => {
      const t0 = ctx.currentTime + startOffset;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      gain.connect(ctx.destination);

      // Fundamental
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      osc.connect(gain);
      osc.start(t0);
      osc.stop(t0 + duration + 0.04);

      // Soft harmonic for richness
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq * 2, t0);
      gain2.gain.setValueAtTime(0.0001, t0);
      gain2.gain.exponentialRampToValueAtTime(volume * 0.35, t0 + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t0 + duration * 0.8);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(t0);
      osc2.stop(t0 + duration + 0.04);
    },
    [],
  );

  // LONG / BUY — rising two-note chime (C5 → G5)
  const playPump = useCallback(() => {
    if (muted) return;
    const ctx = ensureCtx(); if (!ctx) return;
    try {
      noteAt(ctx, 523.25, 0, 0.18, 0.16);    // C5
      noteAt(ctx, 783.99, 0.11, 0.26, 0.18); // G5
    } catch { /* ignore */ }
  }, [muted, ensureCtx, noteAt]);

  // SHORT / SELL — falling two-note chime (G4 → C4)
  const playDump = useCallback(() => {
    if (muted) return;
    const ctx = ensureCtx(); if (!ctx) return;
    try {
      noteAt(ctx, 392.0, 0, 0.18, 0.16);    // G4
      noteAt(ctx, 261.63, 0.11, 0.28, 0.18); // C4
    } catch { /* ignore */ }
  }, [muted, ensureCtx, noteAt]);

  // URGENT — three-note alert (E5-E5-A5) with brighter timbre
  const playUrgent = useCallback(() => {
    if (muted) return;
    const ctx = ensureCtx(); if (!ctx) return;
    try {
      noteAt(ctx, 659.25, 0,    0.14, 0.20, "square");
      noteAt(ctx, 659.25, 0.18, 0.14, 0.20, "square");
      noteAt(ctx, 880.0,  0.38, 0.30, 0.22, "square");
    } catch { /* ignore */ }
  }, [muted, ensureCtx, noteAt]);

  // Backwards-compat alias
  const playBeep = playPump;

  return { playBeep, playPump, playDump, playUrgent, muted, toggleMuted };
}
