import { useCallback, useEffect, useRef, useState } from "react";
import { getSoundSettings, type SoundKey } from "./useSoundSettings";

const STORAGE_KEY = "whale-alert-sound-muted";

/**
 * Web Audio beeps — no asset file, no API call.
 * Each beep type can be muted individually via useSoundSettings.
 * The legacy global mute (toggleMuted) still works as a master switch.
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

  const noteAt = useCallback(
    (
      ctx: AudioContext,
      freq: number,
      startOffset: number,
      duration: number,
      volume: number,
      type: OscillatorType = "triangle",
    ) => {
      const t0 = ctx.currentTime + startOffset;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      gain.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      osc.connect(gain);
      osc.start(t0);
      osc.stop(t0 + duration + 0.04);

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

  const shouldPlay = useCallback((key: SoundKey): { ok: boolean; vol: number } => {
    if (muted) return { ok: false, vol: 0 };
    const s = getSoundSettings();
    return { ok: !!s.enabled[key], vol: s.volume };
  }, [muted]);

  // LONG / BUY — rising chime (C5 → G5). Accepts override key (e.g. "liquidation").
  const playPump = useCallback((key: SoundKey = "pump") => {
    const { ok, vol } = shouldPlay(key);
    if (!ok) return;
    const ctx = ensureCtx(); if (!ctx) return;
    try {
      noteAt(ctx, 523.25, 0, 0.18, 0.16 * vol);
      noteAt(ctx, 783.99, 0.11, 0.26, 0.18 * vol);
    } catch { /* ignore */ }
  }, [shouldPlay, ensureCtx, noteAt]);

  // SHORT / SELL — falling chime (G4 → C4)
  const playDump = useCallback((key: SoundKey = "dump") => {
    const { ok, vol } = shouldPlay(key);
    if (!ok) return;
    const ctx = ensureCtx(); if (!ctx) return;
    try {
      noteAt(ctx, 392.0, 0, 0.18, 0.16 * vol);
      noteAt(ctx, 261.63, 0.11, 0.28, 0.18 * vol);
    } catch { /* ignore */ }
  }, [shouldPlay, ensureCtx, noteAt]);

  // URGENT — three-note alert (E5-E5-A5)
  const playUrgent = useCallback(() => {
    const { ok, vol } = shouldPlay("urgent");
    if (!ok) return;
    const ctx = ensureCtx(); if (!ctx) return;
    try {
      noteAt(ctx, 659.25, 0,    0.14, 0.20 * vol, "square");
      noteAt(ctx, 659.25, 0.18, 0.14, 0.20 * vol, "square");
      noteAt(ctx, 880.0,  0.38, 0.30, 0.22 * vol, "square");
    } catch { /* ignore */ }
  }, [shouldPlay, ensureCtx, noteAt]);

  const playBeep = playPump;

  return { playBeep, playPump, playDump, playUrgent, muted, toggleMuted };
}
