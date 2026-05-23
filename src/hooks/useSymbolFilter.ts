import { useEffect, useState, useCallback } from "react";

export type SymbolKey = "BTC" | "ETH" | "SOL" | "LTC" | "BNB" | "XRP" | "ADA" | "DOGE" | "AVAX";
export const ALL_SYMBOLS: SymbolKey[] = ["BTC", "ETH", "SOL", "LTC", "BNB", "XRP", "ADA", "DOGE", "AVAX"];
const KEY = "whale-symbol-filter";

// External pub/sub so every hook instance stays in sync across panels.
let current: SymbolKey[] = [...ALL_SYMBOLS];
const listeners = new Set<(s: SymbolKey[]) => void>();
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw) as SymbolKey[];
      const filtered = arr.filter((x) => ALL_SYMBOLS.includes(x));
      if (filtered.length > 0) current = filtered;
    }
  } catch { /* ignore */ }
}

export function useSymbolFilter() {
  hydrate();
  const [selected, setSelected] = useState<SymbolKey[]>(current);

  useEffect(() => {
    const fn = (s: SymbolKey[]) => setSelected(s);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const toggle = useCallback((sym: SymbolKey) => {
    const next = current.includes(sym)
      ? current.filter((x) => x !== sym)
      : [...current, sym];
    const safe = next.length === 0 ? [sym] : next;
    current = safe;
    try { localStorage.setItem(KEY, JSON.stringify(safe)); } catch { /* ignore */ }
    listeners.forEach((l) => l(safe));
  }, []);

  const selectAll = useCallback(() => {
    current = [...ALL_SYMBOLS];
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
    listeners.forEach((l) => l(current));
  }, []);

  return { selected, toggle, selectAll, all: ALL_SYMBOLS };
}
