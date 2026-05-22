import type { MarketGlobals, PriceTick, Symbol } from "./types";

const CG_KEY = "CG-6MUtrwpTSrmGptHK2AbT4VoP";

export async function fetchPrices(signal?: AbortSignal): Promise<PriceTick[]> {
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(["BTCUSDT","ETHUSDT","SOLUSDT"]))}`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error("binance failed");
    const arr = await r.json() as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
    const map: Record<string, Symbol> = { BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL" };
    return arr.map((d) => ({
      symbol: map[d.symbol],
      price: parseFloat(d.lastPrice),
      change24h: parseFloat(d.priceChangePercent),
    }));
  } catch {
    return [
      { symbol: "BTC", price: 97_850, change24h: 2.34 },
      { symbol: "ETH", price: 3_720, change24h: 1.82 },
      { symbol: "SOL", price: 215, change24h: -0.95 },
    ];
  }
}

export async function fetchGlobals(signal?: AbortSignal): Promise<MarketGlobals> {
  let fearGreed = { value: 64, label: "Greed" };
  let marketCap = 3.42e12;
  let btcDominance = 56.2;
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1", { signal });
    const j = await r.json();
    const v = parseInt(j.data?.[0]?.value ?? "0", 10);
    if (v) fearGreed = { value: v, label: j.data[0].value_classification };
  } catch { /* keep fallback */ }
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/global", {
      signal,
      headers: { "x-cg-demo-api-key": CG_KEY },
    });
    const j = await r.json();
    const d = j.data;
    if (d) {
      marketCap = d.total_market_cap?.usd ?? marketCap;
      btcDominance = d.market_cap_percentage?.btc ?? btcDominance;
    }
  } catch { /* keep fallback */ }
  return { fearGreed, marketCap, btcDominance };
}
