import { useEffect, useState } from "react";
import { subscribeBinanceStream } from "@/lib/whale/binanceStream";

export type DepthLevel = { price: number; qty: number; usd: number };
export type DepthSnapshot = {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  midPrice: number;
};

/**
 * Binance partial depth (top 20, 100ms) via shared WS multiplex.
 * Returns top-N walls sorted by USD value descending.
 */
export function useBinanceDepth(symbol = "btcusdt", topN = 5) {
  const [snap, setSnap] = useState<DepthSnapshot | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stream = `${symbol.toLowerCase()}@depth20@100ms`;
    return subscribeBinanceStream("spot", stream, (d) => {
      const data = d as { bids: [string, string][]; asks: [string, string][] };
      const bidsRaw = data.bids ?? [];
      const asksRaw = data.asks ?? [];
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
      const topBids = [...bids].sort((a, b) => b.usd - a.usd).slice(0, topN);
      const topAsks = [...asks].sort((a, b) => b.usd - a.usd).slice(0, topN);
      setSnap({ symbol, bids: topBids, asks: topAsks, midPrice });
    });
  }, [symbol, topN]);

  return snap;
}
