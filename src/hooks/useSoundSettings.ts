import { useEffect, useState, useCallback } from "react";

export type SoundKey = "pump" | "dump" | "urgent" | "liquidation";

export type SoundSettings = {
  enabled: Record<SoundKey, boolean>;
  volume: number; // 0..1
  voiceEnabled: boolean; // speak trade events instead of beeping
  voiceMinUsd: number; // only speak trades >= this USD size
};

const KEY = "whale-sound-settings-v2";
const DEFAULT: SoundSettings = {
  enabled: { pump: true, dump: true, urgent: true, liquidation: true },
  volume: 0.6,
  voiceEnabled: false,
  voiceMinUsd: 500_000,
};

let current: SoundSettings = DEFAULT;
const listeners = new Set<(s: SoundSettings) => void>();
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SoundSettings>;
      current = {
        enabled: { ...DEFAULT.enabled, ...(parsed.enabled ?? {}) },
        volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULT.volume,
        voiceEnabled: !!parsed.voiceEnabled,
        voiceMinUsd: typeof parsed.voiceMinUsd === "number" ? parsed.voiceMinUsd : DEFAULT.voiceMinUsd,
      };
    }
  } catch { /* ignore */ }
}

function persist(next: SoundSettings) {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((l) => l(next));
}

export function useSoundSettings() {
  hydrate();
  const [settings, setSettings] = useState<SoundSettings>(current);

  useEffect(() => {
    const fn = (s: SoundSettings) => setSettings(s);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const setEnabled = useCallback((key: SoundKey, on: boolean) => {
    persist({ ...current, enabled: { ...current.enabled, [key]: on } });
  }, []);

  const setVolume = useCallback((v: number) => {
    persist({ ...current, volume: Math.max(0, Math.min(1, v)) });
  }, []);

  const setVoiceEnabled = useCallback((on: boolean) => {
    persist({ ...current, voiceEnabled: on });
  }, []);

  const setVoiceMinUsd = useCallback((v: number) => {
    persist({ ...current, voiceMinUsd: Math.max(0, v) });
  }, []);

  return { settings, setEnabled, setVolume, setVoiceEnabled, setVoiceMinUsd };
}

// Read-only snapshot for non-hook callsites (e.g. inside useWhaleAlertSound).
export function getSoundSettings(): SoundSettings {
  hydrate();
  return current;
}
