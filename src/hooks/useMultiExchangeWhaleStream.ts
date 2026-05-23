import { useEffect, useRef, useState } from "react";
import { useBinanceWhaleStream, type WhaleTrade } from "./useBinanceWhaleStream";
import {
  subscribeMultiExchangeTrades,
  subscribeExchangeStatus,
  type ExchangeId,
} from "@/lib/whale/multiExchangeStream";

const STORAGE_KEY = "wip:multi-whale-trades:v1";
const STORAGE_MAX = 300;
const STORAGE_TTL_MS = 6 * 60 * 60 * 1000;

function loadCached(): WhaleTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as WhaleTrade[];
    const cutoff = Date.now() - STORAGE_TTL_MS;
    return arr.filter((t) => t.tradeTime >= cutoff);
  } catch { return []; }
}
function persist(trades: WhaleTrade[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trades.slice(0, STORAGE_MAX))); } catch { /* quota */ }
}

/**
 * Merged whale-trade firehose across Binance + Bybit + OKX + Hyperliquid.
 * Returns trades sorted newest-first plus a per-exchange connection map.
 */
export function useMultiExchangeWhaleStream(minUsd = 100_000, max = 200) {
  const { trades: binanceTrades, connected: binanceConnected } = useBinanceWhaleStream(minUsd, max);
  const [extraTrades, setExtraTrades] = useState<WhaleTrade[]>(() => loadCached());
  const [status, setStatus] = useState<Record<ExchangeId, boolean>>({
    binance: false, bybit: false, okx: false, hyperliquid: false,
  });
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unsubT = subscribeMultiExchangeTrades((t) => {
      if (t.sizeUsd < minUsd) return;
      if (seenRef.current.has(t.id)) return;
      seenRef.current.add(t.id);
      setExtraTrades((prev) => {
        const next = [t, ...prev].slice(0, max);
        persist(next);
        return next;
      });
      if (seenRef.current.size > 1000) {
        seenRef.current = new Set([...seenRef.current].slice(-500));
      }
    });
    const unsubS = subscribeExchangeStatus((s) => setStatus(s));
    return () => { unsubT(); unsubS(); };
  }, [minUsd, max]);

  // Merge + de-dup across sources
  const merged = (() => {
    const map = new Map<string, WhaleTrade>();
    for (const t of binanceTrades) map.set(t.id, t);
    for (const t of extraTrades) if (!map.has(t.id)) map.set(t.id, t);
    return Array.from(map.values())
      .sort((a, b) => b.tradeTime - a.tradeTime)
      .slice(0, max);
  })();

  const mergedStatus: Record<ExchangeId, boolean> = {
    ...status,
    binance: binanceConnected || status.binance,
  };

  return { trades: merged, status: mergedStatus };
}
