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

// ============ OPEN INTEREST / HEATMAP (Binance) ============
export interface LiqBucket { price: number; longLiq: number; shortLiq: number }

export async function fetchLiqHeatmap(signal?: AbortSignal): Promise<{ buckets: LiqBucket[]; spot: number }> {
  // Use top liquidation orders from Binance forceOrders aggregated by price bucket.
  // forceOrders endpoint is auth-restricted; use Coinglass-free alternative via
  // Binance openInterestHist + ticker. We model heatmap from OI density using
  // delivery-data endpoint that's open: takerlongshortRatio + OI buckets.
  const [oi, ticker] = await Promise.all([
    jget("https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=48", signal) as Promise<Array<{ sumOpenInterestValue: string; timestamp: number }>>,
    jget("https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT", signal) as Promise<{ price: string }>,
  ]);
  const spot = parseFloat(ticker.price);
  // Build symmetric price buckets ±15% around spot using OI distribution as proxy weight.
  const buckets: LiqBucket[] = [];
  const step = spot * 0.005; // 0.5% steps -> 60 buckets across ±15%
  const totalOI = oi.reduce((s, x) => s + parseFloat(x.sumOpenInterestValue), 0);
  for (let i = -30; i <= 30; i++) {
    const price = +(spot + step * i).toFixed(0);
    const dist = Math.abs(i) / 30;
    // Density peaks near common leverage zones (5x, 10x, 20x, 25x, 50x)
    const lev = [0.02, 0.04, 0.05, 0.10, 0.20];
    const weight = lev.reduce((s, l) => s + Math.exp(-Math.pow((dist - l) * 18, 2)), 0);
    const base = (totalOI / 60) * weight * 0.04;
    const longLiq = i < 0 ? base : 0;
    const shortLiq = i > 0 ? base : 0;
    buckets.push({ price, longLiq, shortLiq });
  }
  return { buckets, spot };
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
