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

  const [fngRes, cgRes] = await Promise.all([
    fetch("https://api.alternative.me/fng/?limit=1"),
    fetch("https://api.coingecko.com/api/v3/global"),
  ]);
  if (!fngRes.ok) throw new Error(`alternative.me ${fngRes.status}`);
  if (!cgRes.ok) throw new Error(`coingecko ${cgRes.status}`);

  const fng = (await fngRes.json()) as { data?: Array<{ value: string; value_classification: string }> };
  const cg = (await cgRes.json()) as { data?: { total_market_cap?: { usd?: number }; total_volume?: { usd?: number }; market_cap_percentage?: { btc?: number } } };

  const fngEntry = fng.data?.[0];
  const d = cg.data;
  if (!fngEntry || !d) throw new Error("Empty payload from upstream");

  const result: MarketGlobalsDTO = {
    fearGreed: { value: parseInt(fngEntry.value, 10), label: fngEntry.value_classification },
    marketCap: d.total_market_cap?.usd ?? 0,
    btcDominance: d.market_cap_percentage?.btc ?? 0,
    totalVolume: d.total_volume?.usd ?? 0,
  };
  cache = { at: Date.now(), data: result };
  return result;
});
