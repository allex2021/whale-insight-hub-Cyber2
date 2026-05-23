import { useEffect, useState } from "react";
import { subscribeBinanceStream } from "@/lib/whale/binanceStream";

export type Liquidation = {
  id: string;
  symbol: string;
  asset: string;
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  usd: number;
  time: number;
};

const stripUsdt = (s: string) => s.replace(/USDT$|USD$|BUSD$/i, "");

/**
 * Binance Futures all-symbols force-order (liquidation) stream via shared WS.
 */
export function useBinanceLiquidations(minUsd = 25_000, max = 60) {
  const [events, setEvents] = useState<Liquidation[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    return subscribeBinanceStream("futures", "!forceOrder@arr", (d) => {
      const msg = d as { o?: { ap?: string; p?: string; q: string; s: string; S: string; T: number } };
      const o = msg.o;
      if (!o) return;
      const price = parseFloat(o.ap ?? o.p ?? "0");
      const qty = parseFloat(o.q);
      const usd = price * qty;
      if (usd < minUsd) return;
      const ev: Liquidation = {
        id: `${o.s}-${o.T}-${Math.random().toString(36).slice(2, 7)}`,
        symbol: o.s,
        asset: stripUsdt(o.s),
        side: o.S as "BUY" | "SELL",
        price, qty, usd,
        time: o.T,
      };
      setEvents((prev) => [ev, ...prev].slice(0, max));
    });
  }, [minUsd, max]);

  return events;
}
