import { useEffect, useState, useCallback } from "react";

export type SoundKey = "pump" | "dump" | "urgent" | "liquidation";

export type SoundSettings = {
  enabled: Record<SoundKey, boolean>;
  volume: number; // 0..1
};

const KEY = "whale-sound-settings-v1";
const DEFAULT: SoundSettings = {
  enabled: { pump: true, dump: true, urgent: true, liquidation: true },
  volume: 0.6,
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

  return { settings, setEnabled, setVolume };
}

// Read-only snapshot for non-hook callsites (e.g. inside useWhaleAlertSound).
export function getSoundSettings(): SoundSettings {
  hydrate();
  return current;
}
