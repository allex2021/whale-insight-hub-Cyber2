import { useCallback, useEffect, useState } from "react";

export const ALERT_TYPES = [
  "WHALE", "LIQ", "CASCADE", "FUNDING", "NEWS", "SMART", "CONVERGENCE", "OPTIONS",
] as const;
export type AlertType = typeof ALERT_TYPES[number];

const KEY = "alert-prefs:v1";

type Prefs = Record<AlertType, boolean>;

const defaults: Prefs = ALERT_TYPES.reduce((acc, t) => {
  acc[t] = true;
  return acc;
}, {} as Prefs);

function read(): Prefs {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch { return defaults; }
}

function write(p: Prefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new CustomEvent("alert-prefs-changed"));
}

export function useAlertPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(defaults);

  useEffect(() => {
    setPrefs(read());
    const onChange = () => setPrefs(read());
    window.addEventListener("alert-prefs-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("alert-prefs-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const toggle = useCallback((t: AlertType) => {
    const next = { ...read(), [t]: !read()[t] };
    write(next);
  }, []);

  const isEnabled = useCallback((t: string) => {
    const key = t.toUpperCase() as AlertType;
    return prefs[key] ?? true;
  }, [prefs]);

  const setAll = useCallback((v: boolean) => {
    write(ALERT_TYPES.reduce((acc, t) => { acc[t] = v; return acc; }, {} as Prefs));
  }, []);

  return { prefs, toggle, isEnabled, setAll };
}
