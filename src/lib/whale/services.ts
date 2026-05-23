import type { MarketGlobals, PriceTick, Symbol, FundingRow, ExchangeSignal, OptionTrade, NewsItem } from "./types";

const CG_KEY = "CG-6MUtrwpTSrmGptHK2AbT4VoP";
const CORS = (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`;

async function jget(url: string, signal?: AbortSignal, init?: RequestInit) {
  const r = await fetch(url, { ...init, signal });
  if (!r.ok) throw new Error(`${url.split("/")[2]} ${r.status}`);
  return r.json();
}

// ============ PRICES ============
export async function fetchPrices(signal?: AbortSignal): Promise<PriceTick[]> {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(["BTCUSDT","ETHUSDT","SOLUSDT","LTCUSDT"]))}`;
  const arr = await jget(url, signal) as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
  const map: Record<string, Symbol> = { BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL", LTCUSDT: "LTC" };
  return arr.map((d) => ({
    symbol: map[d.symbol],
    price: parseFloat(d.lastPrice),
    change24h: parseFloat(d.priceChangePercent),
  }));
}

// ============ GLOBALS ============
export async function fetchGlobals(signal?: AbortSignal): Promise<MarketGlobals> {
  const [fng, cg] = await Promise.all([
    jget("https://api.alternative.me/fng/?limit=1", signal),
    jget("https://api.coingecko.com/api/v3/global", signal, { headers: { "x-cg-demo-api-key": CG_KEY } }),
  ]);
  const v = parseInt(fng.data?.[0]?.value ?? "0", 10);
  const d = cg.data;
  if (!d) throw new Error("CoinGecko returned no data");
  return {
    fearGreed: { value: v, label: fng.data[0].value_classification },
    marketCap: d.total_market_cap?.usd,
    btcDominance: d.market_cap_percentage?.btc,
  };
}

// ============ FUNDING (Binance + Bybit + OKX) ============
const SYMBOLS: Symbol[] = ["BTC", "ETH", "SOL", "LTC"];

async function binanceFunding(sym: Symbol, signal?: AbortSignal) {
  const j = await jget(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}USDT`, signal);
  return parseFloat(j.lastFundingRate) * 100;
}
async function binanceFundingHistory(sym: Symbol, signal?: AbortSignal): Promise<number[]> {
  const j = await jget(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}USDT&limit=24`, signal) as Array<{ fundingRate: string }>;
  return j.map((x) => parseFloat(x.fundingRate) * 100);
}
async function bybitFunding(sym: Symbol, signal?: AbortSignal) {
  const j = await jget(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}USDT`, signal);
  return parseFloat(j.result?.list?.[0]?.fundingRate ?? "0") * 100;
}
async function okxFunding(sym: Symbol, signal?: AbortSignal) {
  const j = await jget(`https://www.okx.com/api/v5/public/funding-rate?instId=${sym}-USDT-SWAP`, signal);
  return parseFloat(j.data?.[0]?.fundingRate ?? "0") * 100;
}

export async function fetchFunding(signal?: AbortSignal): Promise<FundingRow[]> {
  const rows = await Promise.all(SYMBOLS.map(async (sym) => {
    const [bin, byb, okx, hist] = await Promise.all([
      binanceFunding(sym, signal),
      bybitFunding(sym, signal).catch(() => NaN),
      okxFunding(sym, signal).catch(() => NaN),
      binanceFundingHistory(sym, signal),
    ]);
    const valid = [bin, byb, okx].filter((v) => !Number.isNaN(v));
    const avg = valid.reduce((s, v) => s + v, 0) / valid.length;
    const status = avg > 0.05 ? "Overheated long" : avg > 0.01 ? "Bullish bias" : avg < -0.05 ? "Heavy shorts" : avg < -0.01 ? "Bearish bias" : "Neutral";
    const squeezeProb = Math.min(100, Math.round(Math.abs(avg) * 1500));
    return {
      symbol: sym,
      binance: bin / 100,
      bybit: byb / 100,
      okx: okx / 100,
      avg: avg / 100,
      status,
      squeezeProb,
      history: hist,
    } satisfies FundingRow;
  }));
  return rows;
}

// ============ OPEN INTEREST / HEATMAP (multi-exchange) ============
export interface LiqBucket { price: number; longLiq: number; shortLiq: number }
export interface LiqCluster { price: number; usd: number; side: "LONG" | "SHORT"; distancePct: number }
export type LiqRange = "1H" | "4H" | "12H" | "24H";
export interface LiqHeatmap {
  buckets: LiqBucket[];
  spot: number;
  symbol: Symbol;
  range: LiqRange;
  totalOI: number;
  oiDeltaPct: number;
  longTotal: number;
  shortTotal: number;
  topClusters: LiqCluster[];
  exchanges: { binance: number; bybit: number; okx: number };
}

const RANGE_MAP: Record<LiqRange, { period: string; limit: number; spread: number }> = {
  "1H":  { period: "5m",  limit: 12, spread: 0.05 },
  "4H":  { period: "15m", limit: 16, spread: 0.10 },
  "12H": { period: "1h",  limit: 12, spread: 0.15 },
  "24H": { period: "1h",  limit: 24, spread: 0.22 },
};

async function bybitOI(sym: Symbol, signal?: AbortSignal): Promise<number> {
  const j = await jget(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}USDT`, signal);
  const t = j.result?.list?.[0];
  const oi = parseFloat(t?.openInterest ?? "0");
  const last = parseFloat(t?.lastPrice ?? "0");
  return oi * last;
}
async function okxOI(sym: Symbol, signal?: AbortSignal): Promise<number> {
  const j = await jget(`https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${sym}-USDT-SWAP`, signal);
  const oiCcy = parseFloat(j.data?.[0]?.oiCcy ?? "0");
  const t = await jget(`https://www.okx.com/api/v5/market/ticker?instId=${sym}-USDT-SWAP`, signal);
  const last = parseFloat(t.data?.[0]?.last ?? "0");
  return oiCcy * last;
}

export async function fetchLiqHeatmap(
  opts: { symbol?: Symbol; range?: LiqRange } = {},
  signal?: AbortSignal,
): Promise<LiqHeatmap> {
  const symbol: Symbol = opts.symbol ?? "BTC";
  const range: LiqRange = opts.range ?? "4H";
  const { period, limit, spread } = RANGE_MAP[range];

  const [oiHist, ticker, byb, okx] = await Promise.all([
    jget(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}USDT&period=${period}&limit=${limit}`, signal) as Promise<Array<{ sumOpenInterestValue: string; timestamp: number }>>,
    jget(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}USDT`, signal) as Promise<{ price: string }>,
    bybitOI(symbol, signal).catch(() => 0),
    okxOI(symbol, signal).catch(() => 0),
  ]);

  const spot = parseFloat(ticker.price);
  const binanceOIVal = oiHist.length ? parseFloat(oiHist[oiHist.length - 1].sumOpenInterestValue) : 0;
  const binanceOIFirst = oiHist.length ? parseFloat(oiHist[0].sumOpenInterestValue) : 0;
  const oiDeltaPct = binanceOIFirst ? ((binanceOIVal - binanceOIFirst) / binanceOIFirst) * 100 : 0;
  const totalOI = binanceOIVal + byb + okx;

  // Liquidation density model: derive cluster zones from common leverage tiers.
  // Long liqs sit below spot (where longs get liquidated), shorts above.
  // Common leverage clusters: 10x (~10%), 20x (~5%), 25x (~4%), 50x (~2%), 100x (~1%).
  const BUCKETS = 60;
  const step = (spot * spread * 2) / BUCKETS;
  const half = BUCKETS / 2;

  // Bias toward longs/shorts from OI delta: rising OI in a downtrend = more long liq risk, etc.
  const longBias = 1 + Math.max(-0.4, Math.min(0.4, oiDeltaPct / 50));
  const shortBias = 1 + Math.max(-0.4, Math.min(0.4, -oiDeltaPct / 50));

  // Range-scaled leverage cluster positions (as fraction of spread)
  const clusterFracs = [0.05, 0.10, 0.18, 0.35, 0.60, 0.85].map((f) => f);
  const buckets: LiqBucket[] = [];
  for (let i = -half; i < half; i++) {
    const price = +(spot + step * i).toFixed(symbol === "SOL" ? 2 : 0);
    const dist = Math.abs(i) / half; // 0..1 fraction of spread
    const weight = clusterFracs.reduce((s, f) => {
      const sharpness = 14 / (1 + f * 3); // tighter peaks for low-lev clusters
      return s + Math.exp(-Math.pow((dist - f) * sharpness, 2));
    }, 0);
    const base = (totalOI / BUCKETS) * weight * 0.06;
    const longLiq  = i < 0 ? base * longBias  : 0;
    const shortLiq = i > 0 ? base * shortBias : 0;
    buckets.push({ price, longLiq, shortLiq });
  }

  const longTotal = buckets.reduce((s, b) => s + b.longLiq, 0);
  const shortTotal = buckets.reduce((s, b) => s + b.shortLiq, 0);

  // Top 6 clusters (mix of long and short)
  const clusters: LiqCluster[] = buckets
    .map((b) => {
      const usd = b.longLiq + b.shortLiq;
      const side: "LONG" | "SHORT" = b.longLiq > b.shortLiq ? "LONG" : "SHORT";
      return { price: b.price, usd, side, distancePct: ((b.price - spot) / spot) * 100 };
    })
    .filter((c) => c.usd > 0)
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 6);

  return {
    buckets, spot, symbol, range,
    totalOI, oiDeltaPct, longTotal, shortTotal,
    topClusters: clusters,
    exchanges: { binance: binanceOIVal, bybit: byb, okx },
  };
}

// ============ CROSS-EXCHANGE SIGNAL ============
async function binanceTicker(sym: Symbol, signal?: AbortSignal) {
  const j = await jget(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}USDT`, signal);
  return { vol: parseFloat(j.quoteVolume), priceChange: parseFloat(j.priceChangePercent) };
}
async function bybitTicker(sym: Symbol, signal?: AbortSignal) {
  const j = await jget(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}USDT`, signal);
  const t = j.result?.list?.[0];
  return { vol: parseFloat(t?.turnover24h ?? "0"), priceChange: parseFloat(t?.price24hPcnt ?? "0") * 100 };
}
async function okxTicker(sym: Symbol, signal?: AbortSignal) {
  const j = await jget(`https://www.okx.com/api/v5/market/ticker?instId=${sym}-USDT-SWAP`, signal);
  const t = j.data?.[0];
  const last = parseFloat(t?.last ?? "0"), open = parseFloat(t?.open24h ?? "0");
  return { vol: parseFloat(t?.volCcy24h ?? "0") * last, priceChange: open ? ((last - open) / open) * 100 : 0 };
}
async function binanceOIChange(sym: Symbol, signal?: AbortSignal) {
  const j = await jget(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}USDT&period=1h&limit=24`, signal) as Array<{ sumOpenInterestValue: string }>;
  if (j.length < 2) return 0;
  const first = parseFloat(j[0].sumOpenInterestValue);
  const last = parseFloat(j[j.length - 1].sumOpenInterestValue);
  return first ? ((last - first) / first) * 100 : 0;
}

export async function fetchExchangeSignals(sym: Symbol, signal?: AbortSignal): Promise<ExchangeSignal[]> {
  const [bin, byb, okx, oi, binF, bybF, okxF] = await Promise.all([
    binanceTicker(sym, signal),
    bybitTicker(sym, signal),
    okxTicker(sym, signal),
    binanceOIChange(sym, signal),
    binanceFunding(sym, signal),
    bybitFunding(sym, signal),
    okxFunding(sym, signal),
  ]);
  const mk = (exchange: string, vol: number, priceChange: number, funding: number, oiChg: number): ExchangeSignal => {
    const direction = priceChange >= 0 ? "LONG" : "SHORT";
    const signal: "BUY" | "SELL" = direction === "LONG" ? "BUY" : "SELL";
    const strength = Math.min(100, Math.round(Math.abs(priceChange) * 8 + Math.abs(oiChg) * 2 + Math.abs(funding) * 200));
    return { exchange, direction, oiChange: oiChg, funding: funding / 100, volume: vol, signal, strength };
  };
  return [
    mk("Binance", bin.vol, bin.priceChange, binF, oi),
    mk("Bybit", byb.vol, byb.priceChange, bybF, oi),
    mk("OKX", okx.vol, okx.priceChange, okxF, oi),
  ];
}

// ============ OPTIONS (Deribit) ============
export async function fetchOptions(currency: "BTC" | "ETH" = "BTC", signal?: AbortSignal): Promise<OptionTrade[]> {
  const j = await jget(`https://www.deribit.com/api/v2/public/get_last_trades_by_currency?currency=${currency}&kind=option&count=60`, signal);
  const trades = j.result?.trades ?? [];
  return trades.map((t: { timestamp: number; instrument_name: string; price: number; amount: number; index_price: number; direction: string }) => {
    // Parse instrument_name like BTC-30MAY26-100000-C
    const parts = t.instrument_name.split("-");
    const expiry = parts[1] ?? "";
    const strike = parseInt(parts[2] ?? "0", 10);
    const type: "CALL" | "PUT" = parts[3] === "C" ? "CALL" : "PUT";
    const premium = t.price * t.amount * t.index_price;
    return {
      time: t.timestamp,
      exchange: "Deribit",
      symbol: currency,
      type,
      strike,
      expiry,
      premium,
      side: t.direction === "buy" ? "BUY" : "SELL",
      size: t.amount,
      unusual: premium > 250_000,
    } satisfies OptionTrade;
  });
}

// ============ NEWS (CryptoPanic) ============
export async function fetchNews(signal?: AbortSignal): Promise<NewsItem[]> {
  const j = await jget("https://cryptopanic.com/api/free/v1/posts/?public=true&kind=news", signal);
  const results = j.results ?? [];
  return results.slice(0, 20).map((p: { id: number; title: string; source: { title: string }; url: string; published_at: string; votes?: { positive: number; negative: number; important: number } }) => {
    const votes = p.votes ?? { positive: 0, negative: 0, important: 0 };
    const net = votes.positive - votes.negative;
    const verdict: "BULLISH" | "BEARISH" | "NEUTRAL" = net > 0 ? "BULLISH" : net < 0 ? "BEARISH" : "NEUTRAL";
    const score = Math.min(10, Math.max(1, Math.round(5 + net * 0.7 + (votes.important ?? 0))));
    const impact: "HIGH" | "MEDIUM" | "LOW" = score >= 8 ? "HIGH" : score >= 5 ? "MEDIUM" : "LOW";
    return {
      id: String(p.id),
      source: p.source.title,
      title: p.title,
      url: p.url,
      publishedAt: new Date(p.published_at).getTime(),
      ai: { score, verdict, impact, summary: `Community sentiment: ${verdict.toLowerCase()} (+${votes.positive}/-${votes.negative}/⚡${votes.important ?? 0})` },
    } satisfies NewsItem;
  });
}

// ============ CORRELATION (CoinGecko) ============
export interface CorrSeries {
  label: string;
  corr: number;
  interp: string;
  data: Array<{ day: number; btc: number; other: number }>;
}

async function cgPrices(id: string, days: number, signal?: AbortSignal): Promise<number[]> {
  const j = await jget(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`, signal, { headers: { "x-cg-demo-api-key": CG_KEY } }) as { prices: [number, number][] };
  return j.prices.map((p) => p[1]);
}
function pearson(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  const aa = a.slice(-n), bb = b.slice(-n);
  const ma = aa.reduce((s, x) => s + x, 0) / n;
  const mb = bb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = aa[i] - ma, xb = bb[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return num / Math.sqrt(da * db);
}

export async function fetchCorrelation(signal?: AbortSignal): Promise<CorrSeries[]> {
  const days = 14;
  const [btc, eth, gold, link] = await Promise.all([
    cgPrices("bitcoin", days, signal),
    cgPrices("ethereum", days, signal),
    cgPrices("tether-gold", days, signal),
    cgPrices("chainlink", days, signal),
  ]);
  const build = (label: string, other: number[]): CorrSeries => {
    const n = Math.min(btc.length, other.length);
    const data = Array.from({ length: n }, (_, i) => ({ day: i, btc: btc[btc.length - n + i], other: other[other.length - n + i] }));
    const corr = pearson(btc, other);
    const interp = corr > 0.7 ? "Strong positive" : corr > 0.3 ? "Mild positive" : corr > -0.3 ? "Decoupled" : corr > -0.7 ? "Mild negative" : "Strong negative";
    return { label, corr, interp, data };
  };
  return [
    build("BTC vs ETH", eth),
    build("BTC vs Gold (XAUt)", gold),
    build("BTC vs LINK", link),
    build("BTC vs ETH/BTC", eth.map((e, i) => e / btc[i])),
  ];
}
