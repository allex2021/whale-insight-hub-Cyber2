import { useCallback, useEffect, useState } from "react";

const KEY = "wip:followed-wallets";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((a) => typeof a === "string") : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent("wip:followed-wallets-changed"));
  } catch {}
}

export function useFollowedWallets() {
  const [followed, setFollowed] = useState<string[]>([]);

  useEffect(() => {
    setFollowed(read());
    const sync = () => setFollowed(read());
    window.addEventListener("wip:followed-wallets-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("wip:followed-wallets-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((address: string) => {
    const lower = address.toLowerCase();
    const cur = read();
    const next = cur.includes(lower) ? cur.filter((a) => a !== lower) : [...cur, lower];
    write(next);
    setFollowed(next);
  }, []);

  const isFollowed = useCallback(
    (address: string) => followed.includes(address.toLowerCase()),
    [followed],
  );

  return { followed, toggle, isFollowed };
}

// --- Copy signal history ---
export type CopySignal = {
  id: string;
  ts: number;
  alias: string;
  address: string;
  coin: string;
  side: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target: number;
  leverage: number;
  positionUsd: number;
  riskUsd: number;
  accountUsd: number;
  riskPct: number;
};

const SIG_KEY = "wip:copy-signals";

export function readSignals(): CopySignal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SIG_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveSignal(sig: CopySignal) {
  const cur = readSignals();
  const next = [sig, ...cur].slice(0, 50);
  try {
    localStorage.setItem(SIG_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("wip:copy-signals-changed"));
  } catch {}
}

export function clearSignals() {
  try {
    localStorage.removeItem(SIG_KEY);
    window.dispatchEvent(new CustomEvent("wip:copy-signals-changed"));
  } catch {}
}

export function useCopySignals() {
  const [signals, setSignals] = useState<CopySignal[]>([]);
  useEffect(() => {
    setSignals(readSignals());
    const sync = () => setSignals(readSignals());
    window.addEventListener("wip:copy-signals-changed", sync);
    return () => window.removeEventListener("wip:copy-signals-changed", sync);
  }, []);
  return { signals, save: saveSignal, clear: clearSignals };
}
