import { useEffect, useState, useRef } from "react";

export type DepthLevel = { price: number; qty: number; usd: number };
export type DepthSnapshot = {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  midPrice: number;
};

/**
 * Binance partial depth stream (top 20, 100ms updates).
 * Returns top-N walls sorted by USD value descending.
 */
export function useBinanceDepth(symbol = "btcusdt", topN = 5) {
  const [snap, setSnap] = useState<DepthSnapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const connect = () => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@depth20@100ms`);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          const bidsRaw: [string, string][] = d.bids ?? [];
          const asksRaw: [string, string][] = d.asks ?? [];
          if (!bidsRaw.length || !asksRaw.length) return;
          const bids: DepthLevel[] = bidsRaw.map(([p, q]) => {
            const price = parseFloat(p); const qty = parseFloat(q);
            return { price, qty, usd: price * qty };
          });
          const asks: DepthLevel[] = asksRaw.map(([p, q]) => {
            const price = parseFloat(p); const qty = parseFloat(q);
            return { price, qty, usd: price * qty };
          });
          const midPrice = (bids[0].price + asks[0].price) / 2;
          // Sort by USD desc, take topN walls
          const topBids = [...bids].sort((a, b) => b.usd - a.usd).slice(0, topN);
          const topAsks = [...asks].sort((a, b) => b.usd - a.usd).slice(0, topN);
          setSnap({ symbol, bids: topBids, asks: topAsks, midPrice });
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (cancelled) return;
        const delay = Math.min(30_000, 1000 * 2 ** retryRef.current);
        retryRef.current += 1;
        setTimeout(connect, delay);
      };
      ws.onopen = () => { retryRef.current = 0; };
    };

    connect();
    return () => { cancelled = true; wsRef.current?.close(); };
  }, [symbol, topN]);

  return snap;
}
