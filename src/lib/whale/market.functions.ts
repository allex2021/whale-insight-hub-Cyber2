import { createServerFn } from "@tanstack/react-start";

/**
 * Server-side proxy for CoinGecko global market data.
 * Avoids browser CORS and keeps the API key off the client.
 * Simple in-memory cache (60s) to stay well under rate limits.
 */
let cache: { at: number; data: MarketGlobalsDTO } | null = null;

export type MarketGlobalsDTO = {
  fearGreed: { value: number; label: string };
  marketCap: number;
  btcDominance: number;
  totalVolume: number;
};

export const fetchMarketGlobals = createServerFn({ method: "GET" }).handler(async (): Promise<MarketGlobalsDTO> => {
  if (cache && Date.now() - cache.at < 60_000) return cache.data;

  let fearGreed = { value: 50, label: "Neutral" };
  let marketCap = 0;
  let btcDominance = 0;
  let totalVolume = 0;

  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1");
    const j = (await r.json()) as { data?: Array<{ value: string; value_classification: string }> };
    const v = parseInt(j.data?.[0]?.value ?? "0", 10);
    if (v) fearGreed = { value: v, label: j.data![0].value_classification };
  } catch { /* keep default */ }

  try {
    const r = await fetch("https://api.coingecko.com/api/v3/global");
    const j = (await r.json()) as { data?: { total_market_cap?: { usd?: number }; total_volume?: { usd?: number }; market_cap_percentage?: { btc?: number } } };
    const d = j.data;
    if (d) {
      marketCap = d.total_market_cap?.usd ?? 0;
      btcDominance = d.market_cap_percentage?.btc ?? 0;
      totalVolume = d.total_volume?.usd ?? 0;
    }
  } catch { /* keep default */ }

  const result = { fearGreed, marketCap, btcDominance, totalVolume };
  cache = { at: Date.now(), data: result };
  return result;
});
