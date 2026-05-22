import { useEffect, useRef, useState } from "react";

export type WhaleTrade = {
  id: string;
  asset: "BTC" | "ETH" | "SOL" | "LTC";
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  sizeUsd: number;
  tradeTime: number;
  exchange: "binance";
};

const STREAMS = ["btcusdt@aggTrade", "ethusdt@aggTrade", "solusdt@aggTrade", "ltcusdt@aggTrade"];
const ASSET_MAP: Record<string, WhaleTrade["asset"]> = {
  BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL", LTCUSDT: "LTC",
};

/**
 * Real-time Binance aggregated-trades stream.
 * Filters trades by minimum USD size and keeps the latest N in memory.
 * Auto-reconnects with exponential backoff.
 */
export function useBinanceWhaleStream(minUsd = 100_000, max = 100) {
  const [trades, setTrades] = useState<WhaleTrade[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const connect = () => {
      const url = `wss://stream.binance.com:9443/stream?streams=${STREAMS.join("/")}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retryRef.current = 0;
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const d = msg.data;
          if (!d || !d.s) return;
          const asset = ASSET_MAP[d.s];
          if (!asset) return;
          const price = parseFloat(d.p);
          const quantity = parseFloat(d.q);
          const sizeUsd = price * quantity;
          if (sizeUsd < minUsd) return;
          const trade: WhaleTrade = {
            id: `${d.s}-${d.a}`,
            asset,
            side: d.m ? "SELL" : "BUY", // m: buyer is market maker => taker sold
            price,
            quantity,
            sizeUsd,
            tradeTime: d.T,
            exchange: "binance",
          };
          setTrades((prev) => [trade, ...prev].slice(0, max));
        } catch {
          /* ignore parse errors */
        }
      };

      ws.onerror = () => { /* will close + reconnect */ };

      ws.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        const delay = Math.min(30_000, 1000 * 2 ** retryRef.current);
        retryRef.current += 1;
        setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [minUsd, max]);

  return { trades, connected };
}

/** Latest prices derived from the stream — useful for header tickers. */
export function useBinancePriceStream() {
  const [prices, setPrices] = useState<Record<string, { price: number; change24h: number }>>({});
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ws = new WebSocket(
      "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker",
    );
    ws.onmessage = (ev) => {
      try {
        const { data } = JSON.parse(ev.data);
        const sym = ASSET_MAP[data.s];
        if (!sym) return;
        setPrices((prev) => ({
          ...prev,
          [sym]: { price: parseFloat(data.c), change24h: parseFloat(data.P) },
        }));
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, []);
  return prices;
}
