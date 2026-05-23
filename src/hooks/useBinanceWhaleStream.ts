import { useEffect, useState } from "react";
import { subscribeBinanceStream } from "@/lib/whale/binanceStream";

export type WhaleAsset = "BTC" | "ETH" | "SOL" | "LTC" | "BNB" | "XRP" | "ADA" | "DOGE" | "AVAX";

export type WhaleTrade = {
  id: string;
  asset: WhaleAsset;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  sizeUsd: number;
  tradeTime: number;
  exchange: "binance";
};

const ASSET_MAP: Record<string, WhaleAsset> = {
  BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL", LTCUSDT: "LTC",
  BNBUSDT: "BNB", XRPUSDT: "XRP", ADAUSDT: "ADA", DOGEUSDT: "DOGE", AVAXUSDT: "AVAX",
};
const SYMBOLS = Object.keys(ASSET_MAP);

/**
 * Real-time Binance aggregated-trades stream via shared WS multiplex.
 */
export function useBinanceWhaleStream(minUsd = 100_000, max = 100) {
  const [trades, setTrades] = useState<WhaleTrade[]>([]);
  const [connected, setConnected] = useState(true); // multiplex is opaque; assume on

  useEffect(() => {
    if (typeof window === "undefined") return;
    setConnected(true);
    const unsubs = SYMBOLS.map((sym) =>
      subscribeBinanceStream("spot", `${sym.toLowerCase()}@aggTrade`, (d) => {
        const data = d as { s: string; p: string; q: string; a: number; m: boolean; T: number };
        const asset = ASSET_MAP[data.s];
        if (!asset) return;
        const price = parseFloat(data.p);
        const quantity = parseFloat(data.q);
        const sizeUsd = price * quantity;
        if (sizeUsd < minUsd) return;
        const trade: WhaleTrade = {
          id: `${data.s}-${data.a}`,
          asset,
          side: data.m ? "SELL" : "BUY",
          price, quantity, sizeUsd,
          tradeTime: data.T,
          exchange: "binance",
        };
        setTrades((prev) => [trade, ...prev].slice(0, max));
      }),
    );
    return () => { unsubs.forEach((u) => u()); setConnected(false); };
  }, [minUsd, max]);

  return { trades, connected };
}

/** Latest prices derived from ticker stream (shared WS). */
export function useBinancePriceStream() {
  const [prices, setPrices] = useState<Record<string, { price: number; change24h: number }>>({});
  useEffect(() => {
    if (typeof window === "undefined") return;
    const targets = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LTCUSDT"];
    const unsubs = targets.map((sym) =>
      subscribeBinanceStream("spot", `${sym.toLowerCase()}@ticker`, (d) => {
        const data = d as { s: string; c: string; P: string };
        const asset = ASSET_MAP[data.s];
        if (!asset) return;
        setPrices((prev) => ({
          ...prev,
          [asset]: { price: parseFloat(data.c), change24h: parseFloat(data.P) },
        }));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, []);
  return prices;
}
