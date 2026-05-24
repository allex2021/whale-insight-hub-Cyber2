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

  const fallback: MarketGlobalsDTO = cache?.data ?? {
    fearGreed: { value: 50, label: "Neutral" },
    marketCap: 0,
    btcDominance: 0,
    totalVolume: 0,
  };

  try {
    const [fngRes, cgRes] = await Promise.all([
      fetch("https://api.alternative.me/fng/?limit=1").catch(() => null),
      fetch("https://api.coingecko.com/api/v3/global", {
        headers: { accept: "application/json" },
      }).catch(() => null),
    ]);

    const result: MarketGlobalsDTO = { ...fallback };

    if (fngRes?.ok) {
      const fng = (await fngRes.json()) as { data?: Array<{ value: string; value_classification: string }> };
      const e = fng.data?.[0];
      if (e) result.fearGreed = { value: parseInt(e.value, 10), label: e.value_classification };
    }

    if (cgRes?.ok) {
      const cg = (await cgRes.json()) as { data?: { total_market_cap?: { usd?: number }; total_volume?: { usd?: number }; market_cap_percentage?: { btc?: number } } };
      const d = cg.data;
      if (d) {
        result.marketCap = d.total_market_cap?.usd ?? result.marketCap;
        result.btcDominance = d.market_cap_percentage?.btc ?? result.btcDominance;
        result.totalVolume = d.total_volume?.usd ?? result.totalVolume;
      }
    } else if (cgRes) {
      console.warn(`coingecko /global ${cgRes.status} — using fallback`);
    }

    cache = { at: Date.now(), data: result };
    return result;
  } catch (err) {
    console.error("fetchMarketGlobals failed:", err);
    return fallback;
  }
});

// ============ NEWS (CoinDesk + CryptoCompare fallback — no auth) ============
let newsCache: { at: number; data: NewsItem[] } | null = null;
const NEWS_TTL_MS = 10 * 60_000; // 10 min — AI calls are expensive
const NEWS_STALE_MS = 60 * 60_000; // serve stale up to 1h on upstream errors

async function fetchCoinDesk(): Promise<CoinDeskNewsRow[]> {
  const r = await fetch("https://data-api.coindesk.com/news/v1/article/list?lang=EN&limit=20");
  if (!r.ok) throw new Error(`coindesk ${r.status}`);
  const j = (await r.json()) as { Data?: CoinDeskNewsRow[] };
  return Array.isArray(j?.Data) ? j.Data.slice(0, 20) : [];
}

async function fetchCryptoCompare(): Promise<CoinDeskNewsRow[]> {
  const r = await fetch("https://min-api.cryptocompare.com/data/v2/news/?lang=EN");
  if (!r.ok) throw new Error(`cryptocompare ${r.status}`);
  const j = (await r.json()) as {
    Data?: Array<{ id?: string; title?: string; url?: string; published_on?: number; body?: string; source?: string; categories?: string }>;
  };
  return (j.Data ?? []).slice(0, 20).map((p) => ({
    ID: Number(p.id) || undefined,
    TITLE: p.title,
    URL: p.url,
    PUBLISHED_ON: p.published_on,
    BODY: p.body,
    SOURCE_DATA: { NAME: p.source ?? "CryptoCompare" },
    KEYWORDS: p.categories,
  }));
}

type CoinDeskNewsRow = {
  ID?: number;
  TITLE?: string;
  URL?: string;
  PUBLISHED_ON?: number;
  BODY?: string;
  UPVOTES?: number;
  DOWNVOTES?: number;
  SENTIMENT?: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | string;
  SOURCE_DATA?: { NAME?: string };
  KEYWORDS?: string;
};

function heuristicAnalyze(p: CoinDeskNewsRow): NewsItem["ai"] {
  const up = Number(p.UPVOTES ?? 0);
  const down = Number(p.DOWNVOTES ?? 0);
  const net = up - down;
  const title = (p.TITLE ?? "").toLowerCase();
  const bullishKw = /(surge|rally|soar|gain|bullish|jump|breakout|approve|adopt|all-time)/i.test(title);
  const bearishKw = /(crash|plunge|drop|bearish|sell-off|hack|ban|sue|liquidat|reject)/i.test(title);
  const sentiment = String(p.SENTIMENT ?? "").toUpperCase();
  const verdict: "BULLISH" | "BEARISH" | "NEUTRAL" =
    sentiment === "POSITIVE" || (bullishKw && !bearishKw) ? "BULLISH" :
    sentiment === "NEGATIVE" || (bearishKw && !bullishKw) ? "BEARISH" :
    net > 0 ? "BULLISH" : net < 0 ? "BEARISH" : "NEUTRAL";
  const score = Math.min(10, Math.max(1, Math.round(5 + (bullishKw ? 2 : 0) - (bearishKw ? 2 : 0) + Math.sign(net))));
  const impact: "HIGH" | "MEDIUM" | "LOW" = score >= 8 ? "HIGH" : score >= 5 ? "MEDIUM" : "LOW";
  return {
    score, verdict, impact,
    summary: (p.BODY ?? "").slice(0, 140) || `Keywords: ${p.KEYWORDS ?? "general"}`,
    confidence: 50,
    assets: [],
    aiPowered: false,
  };
}

type AIAnalysisResult = {
  id: string;
  score: number;
  verdict: "BULLISH" | "BEARISH" | "NEUTRAL";
  impact: "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  assets: string[];
  summary: string;
};

async function batchAnalyzeWithAI(items: { id: string; title: string; body?: string }[]): Promise<Map<string, AIAnalysisResult>> {
  const out = new Map<string, AIAnalysisResult>();
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY || items.length === 0) return out;

  const payload = items.map((it) => ({ id: it.id, title: it.title, snippet: (it.body ?? "").slice(0, 280) }));

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You are a crypto market analyst. For each news item, return: " +
              "score (1-10 market significance), verdict (BULLISH/BEARISH/NEUTRAL), " +
              "impact (HIGH/MEDIUM/LOW price impact), confidence (0-100 your conviction), " +
              "assets (uppercase tickers affected, e.g. ['BTC','ETH'], empty if macro), " +
              "summary (one sentence, <=140 chars, focused on trade implication). " +
              "Be decisive — avoid NEUTRAL unless truly mixed. Hacks/SEC enforcement/bans = BEARISH. ETF approvals/institutional adoption = BULLISH.",
          },
          { role: "user", content: `Analyze these ${payload.length} headlines:\n${JSON.stringify(payload)}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_analyses",
            description: "Emit sentiment analysis for each news item.",
            parameters: {
              type: "object",
              properties: {
                analyses: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      score: { type: "number" },
                      verdict: { type: "string", enum: ["BULLISH", "BEARISH", "NEUTRAL"] },
                      impact: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                      confidence: { type: "number" },
                      assets: { type: "array", items: { type: "string" } },
                      summary: { type: "string" },
                    },
                    required: ["id", "score", "verdict", "impact", "confidence", "assets", "summary"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["analyses"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_analyses" } },
      }),
    });
    if (!res.ok) {
      console.warn(`News AI gateway ${res.status} — falling back to heuristic`);
      return out;
    }
    const json = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return out;
    const args = JSON.parse(call.function.arguments) as { analyses: AIAnalysisResult[] };
    for (const a of args.analyses ?? []) out.set(String(a.id), a);
  } catch (e) {
    console.error("batchAnalyzeWithAI failed:", e);
  }
  return out;
}

export const fetchNewsServer = createServerFn({ method: "GET" }).handler(async (): Promise<NewsItem[]> => {
  if (newsCache && Date.now() - newsCache.at < NEWS_TTL_MS) return newsCache.data;
  try {
    let rows: CoinDeskNewsRow[] = [];
    try {
      rows = await fetchCoinDesk();
    } catch (cdErr) {
      console.warn("CoinDesk failed, trying CryptoCompare:", cdErr);
      rows = await fetchCryptoCompare();
    }
    if (rows.length === 0) throw new Error("no news rows");

    // Batched Gemini analysis on top 12 headlines (single AI call)
    const top = rows.slice(0, 12).map((p, i) => ({
      id: String(p.ID ?? i),
      title: p.TITLE ?? "Untitled",
      body: p.BODY ?? "",
    }));
    const aiMap = await batchAnalyzeWithAI(top);

    const data: NewsItem[] = rows.map((p, index) => {
      const id = String(p.ID ?? index);
      const aiRow = aiMap.get(id);
      const ai: NewsItem["ai"] = aiRow
        ? {
            score: Math.round(aiRow.score),
            verdict: aiRow.verdict,
            impact: aiRow.impact,
            summary: aiRow.summary,
            confidence: Math.round(aiRow.confidence),
            assets: aiRow.assets,
            aiPowered: true,
          }
        : heuristicAnalyze(p);
      return {
        id,
        source: p.SOURCE_DATA?.NAME ?? "CoinDesk",
        title: p.TITLE ?? "Untitled",
        url: p.URL ?? "#",
        publishedAt: (p.PUBLISHED_ON ?? Math.floor(Date.now() / 1000)) * 1000,
        ai,
      };
    });
    newsCache = { at: Date.now(), data };
    return data;
  } catch (error) {
    console.error("Failed to fetch crypto news:", error);
    // Serve stale cache up to 1h on upstream failure
    if (newsCache && Date.now() - newsCache.at < NEWS_STALE_MS) return newsCache.data;
    if (newsCache) return newsCache.data;
    newsCache = { at: Date.now(), data: [] };
    return [];
  }
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
