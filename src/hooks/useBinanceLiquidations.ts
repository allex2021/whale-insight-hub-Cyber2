import { useEffect, useState, useRef } from "react";

export type Liquidation = {
  id: string;
  symbol: string;     // e.g. BTCUSDT
  asset: string;      // e.g. BTC
  side: "BUY" | "SELL"; // SELL = long got liquidated; BUY = short got liquidated
  price: number;
  qty: number;
  usd: number;
  time: number;
};

const stripUsdt = (s: string) => s.replace(/USDT$|USD$|BUSD$/i, "");

/**
 * Binance Futures all-symbols force-order (liquidation) stream.
 * Public, no auth. Keeps latest `max` events filtered by minUsd.
 */
export function useBinanceLiquidations(minUsd = 25_000, max = 60) {
  const [events, setEvents] = useState<Liquidation[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const connect = () => {
      const ws = new WebSocket("wss://fstream.binance.com/ws/!forceOrder@arr");
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const o = msg.o ?? msg.data?.o;
          if (!o) return;
          const price = parseFloat(o.ap ?? o.p);
          const qty = parseFloat(o.q);
          const usd = price * qty;
          if (usd < minUsd) return;
          const ev2: Liquidation = {
            id: `${o.s}-${o.T}-${Math.random().toString(36).slice(2, 7)}`,
            symbol: o.s,
            asset: stripUsdt(o.s),
            side: o.S as "BUY" | "SELL",
            price, qty, usd,
            time: o.T,
          };
          setEvents((prev) => [ev2, ...prev].slice(0, max));
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
  }, [minUsd, max]);

  return events;
}
