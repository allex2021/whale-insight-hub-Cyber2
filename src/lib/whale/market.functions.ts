import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ExchangeSignal, NewsItem, Symbol } from "./types";

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

// ============ NEWS (CryptoCompare free API — no auth required) ============
let newsCache: { at: number; data: NewsItem[] } | null = null;

export const fetchNewsServer = createServerFn({ method: "GET" }).handler(async (): Promise<NewsItem[]> => {
  if (newsCache && Date.now() - newsCache.at < 60_000) return newsCache.data;
  const r = await fetch("https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest");
  if (!r.ok) throw new Error(`cryptocompare ${r.status}`);
  const j = await r.json() as { Data?: Array<{ id: string; title: string; url: string; source: string; source_info?: { name: string }; published_on: number; upvotes?: string; downvotes?: string; categories?: string; body?: string }> };
  const data: NewsItem[] = (j.Data ?? []).slice(0, 20).map((p) => {
    const up = parseInt(p.upvotes ?? "0", 10);
    const down = parseInt(p.downvotes ?? "0", 10);
    const net = up - down;
    const title = p.title.toLowerCase();
    const bullishKw = /(surge|rally|soar|gain|bullish|jump|breakout|approve|adopt|all-time)/i.test(title);
    const bearishKw = /(crash|plunge|drop|bearish|sell-off|hack|ban|sue|liquidat|reject)/i.test(title);
    const verdict: "BULLISH" | "BEARISH" | "NEUTRAL" = bullishKw && !bearishKw ? "BULLISH" : bearishKw && !bullishKw ? "BEARISH" : net > 0 ? "BULLISH" : net < 0 ? "BEARISH" : "NEUTRAL";
    const score = Math.min(10, Math.max(1, Math.round(5 + (bullishKw ? 2 : 0) - (bearishKw ? 2 : 0) + Math.sign(net))));
    const impact: "HIGH" | "MEDIUM" | "LOW" = score >= 8 ? "HIGH" : score >= 5 ? "MEDIUM" : "LOW";
    return {
      id: String(p.id),
      source: p.source_info?.name ?? p.source,
      title: p.title,
      url: p.url,
      publishedAt: p.published_on * 1000,
      ai: { score, verdict, impact, summary: (p.body ?? "").slice(0, 140) || `Categories: ${p.categories ?? "general"}` },
    };
  });
  newsCache = { at: Date.now(), data };
  return data;
});

// ============ CROSS-EXCHANGE SIGNAL (server-side aggregation) ============
async function jget(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url.split("/")[2]} ${r.status}`);
  return r.json();
}
async function binanceTicker(sym: Symbol) {
  const j = await jget(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}USDT`);
  return { vol: parseFloat(j.quoteVolume), priceChange: parseFloat(j.priceChangePercent) };
}
async function bybitTicker(sym: Symbol) {
  const j = await jget(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}USDT`);
  const t = j.result?.list?.[0];
  return { vol: parseFloat(t?.turnover24h ?? "0"), priceChange: parseFloat(t?.price24hPcnt ?? "0") * 100 };
}
async function okxTicker(sym: Symbol) {
  const j = await jget(`https://www.okx.com/api/v5/market/ticker?instId=${sym}-USDT-SWAP`);
  const t = j.data?.[0];
  const last = parseFloat(t?.last ?? "0"), open = parseFloat(t?.open24h ?? "0");
  return { vol: parseFloat(t?.volCcy24h ?? "0") * last, priceChange: open ? ((last - open) / open) * 100 : 0 };
}
async function binanceFunding(sym: Symbol) {
  const j = await jget(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}USDT`);
  return parseFloat(j.lastFundingRate) * 100;
}
async function bybitFunding(sym: Symbol) {
  const j = await jget(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}USDT`);
  return parseFloat(j.result?.list?.[0]?.fundingRate ?? "0") * 100;
}
async function okxFunding(sym: Symbol) {
  const j = await jget(`https://www.okx.com/api/v5/public/funding-rate?instId=${sym}-USDT-SWAP`);
  return parseFloat(j.data?.[0]?.fundingRate ?? "0") * 100;
}
async function binanceOIChange(sym: Symbol) {
  const j = await jget(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}USDT&period=1h&limit=24`) as Array<{ sumOpenInterestValue: string }>;
  if (j.length < 2) return 0;
  const first = parseFloat(j[0].sumOpenInterestValue);
  const last = parseFloat(j[j.length - 1].sumOpenInterestValue);
  return first ? ((last - first) / first) * 100 : 0;
}

const xcache = new Map<string, { at: number; data: ExchangeSignal[] }>();

export const fetchExchangeSignalsServer = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: Symbol }) => z.object({ symbol: z.enum(["BTC", "ETH", "SOL", "LTC"]) }).parse(d))
  .handler(async ({ data }): Promise<ExchangeSignal[]> => {
    const sym = data.symbol;
    const c = xcache.get(sym);
    if (c && Date.now() - c.at < 30_000) return c.data;
    const [bin, byb, okx, oi, binF, bybF, okxF] = await Promise.all([
      binanceTicker(sym),
      bybitTicker(sym).catch(() => ({ vol: 0, priceChange: 0 })),
      okxTicker(sym).catch(() => ({ vol: 0, priceChange: 0 })),
      binanceOIChange(sym).catch(() => 0),
      binanceFunding(sym).catch(() => 0),
      bybitFunding(sym).catch(() => 0),
      okxFunding(sym).catch(() => 0),
    ]);
    const mk = (exchange: string, vol: number, priceChange: number, funding: number, oiChg: number): ExchangeSignal => {
      const direction = priceChange >= 0 ? "LONG" : "SHORT";
      const signal: "BUY" | "SELL" = direction === "LONG" ? "BUY" : "SELL";
      const strength = Math.min(100, Math.round(Math.abs(priceChange) * 8 + Math.abs(oiChg) * 2 + Math.abs(funding) * 200));
      return { exchange, direction, oiChange: oiChg, funding: funding / 100, volume: vol, signal, strength };
    };
    const rows = [
      mk("Binance", bin.vol, bin.priceChange, binF, oi),
      mk("Bybit", byb.vol, byb.priceChange, bybF, oi),
      mk("OKX", okx.vol, okx.priceChange, okxF, oi),
    ];
    xcache.set(sym, { at: Date.now(), data: rows });
    return rows;
  });
