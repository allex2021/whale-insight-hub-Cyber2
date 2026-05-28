import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ───────────────────────────── Types ─────────────────────────────
export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export type Trade = { t: number; side: "BUY" | "SELL"; price: number; qty: number; reason: string };
export type EquityPoint = { t: number; equity: number; price: number };

export type BacktestResult = {
  asset: string;
  strategy: string;
  interval: string;
  candles: number;
  startPrice: number;
  endPrice: number;
  buyHoldPct: number;
  pnlPct: number;
  trades: Trade[];
  equity: EquityPoint[];
  metrics: {
    winRate: number;
    maxDrawdownPct: number;
    sharpe: number;
    totalTrades: number;
    finalEquity: number;
  };
};

// ──────────────────────── Binance klines ─────────────────────────
const SYMBOL_MAP: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT", LTC: "LTCUSDT",
  XRP: "XRPUSDT", BNB: "BNBUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
};

async function fetchKlines(asset: string, interval: string, limit: number): Promise<Candle[]> {
  const symbol = SYMBOL_MAP[asset.toUpperCase()] ?? `${asset.toUpperCase()}USDT`;
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const raw = (await res.json()) as unknown[][];
    return raw.map((k) => ({
      t: Number(k[0]),
      o: Number(k[1]),
      h: Number(k[2]),
      l: Number(k[3]),
      c: Number(k[4]),
      v: Number(k[5]),
    }));
  } finally {
    clearTimeout(t);
  }
}

// ──────────────────────── Metrics helpers ────────────────────────
function computeMetrics(equity: EquityPoint[], trades: Trade[], initial: number) {
  if (!equity.length) return { winRate: 0, maxDrawdownPct: 0, sharpe: 0, totalTrades: 0, finalEquity: initial };
  let peak = equity[0].equity;
  let maxDD = 0;
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    peak = Math.max(peak, equity[i].equity);
    const dd = (peak - equity[i].equity) / peak;
    if (dd > maxDD) maxDD = dd;
    const prev = equity[i - 1].equity;
    if (prev > 0) rets.push((equity[i].equity - prev) / prev);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(365) : 0; // annualized-ish

  // win rate: paired BUY→SELL
  let wins = 0, pairs = 0, openPrice = 0;
  for (const tr of trades) {
    if (tr.side === "BUY") openPrice = tr.price;
    else if (tr.side === "SELL" && openPrice > 0) {
      pairs++;
      if (tr.price > openPrice) wins++;
      openPrice = 0;
    }
  }
  return {
    winRate: pairs > 0 ? wins / pairs : 0,
    maxDrawdownPct: maxDD * 100,
    sharpe,
    totalTrades: trades.length,
    finalEquity: equity[equity.length - 1].equity,
  };
}

// ─────────────────────────── Strategies ──────────────────────────
// IMPORTANT: every signal is computed strictly from candles[0..i-1].close
// Trades execute at candles[i].open → zero look-ahead bias.

type StrategyFn = (candles: Candle[], params: Record<string, number>) => { trades: Trade[]; equity: EquityPoint[] };

const sma = (arr: number[], period: number, end: number): number | null => {
  if (end < period) return null;
  let sum = 0;
  for (let i = end - period; i < end; i++) sum += arr[i];
  return sum / period;
};

const smaCross: StrategyFn = (candles, p) => {
  const fast = Math.max(2, Math.floor(p.fast ?? 10));
  const slow = Math.max(fast + 1, Math.floor(p.slow ?? 30));
  const initial = 10_000;
  let cash = initial, qty = 0;
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  const closes = candles.map((c) => c.c);

  for (let i = 1; i < candles.length; i++) {
    const fNow = sma(closes, fast, i);
    const sNow = sma(closes, slow, i);
    const fPrev = sma(closes, fast, i - 1);
    const sPrev = sma(closes, slow, i - 1);
    const px = candles[i].o;
    if (fNow != null && sNow != null && fPrev != null && sPrev != null) {
      const crossUp = fPrev <= sPrev && fNow > sNow;
      const crossDn = fPrev >= sPrev && fNow < sNow;
      if (crossUp && cash > 0) {
        qty = cash / px; cash = 0;
        trades.push({ t: candles[i].t, side: "BUY", price: px, qty, reason: `SMA${fast}↑${slow}` });
      } else if (crossDn && qty > 0) {
        cash = qty * px;
        trades.push({ t: candles[i].t, side: "SELL", price: px, qty, reason: `SMA${fast}↓${slow}` });
        qty = 0;
      }
    }
    equity.push({ t: candles[i].t, equity: cash + qty * candles[i].c, price: candles[i].c });
  }
  return { trades, equity };
};

const grid: StrategyFn = (candles, p) => {
  const levels = Math.max(3, Math.floor(p.levels ?? 8));
  const rangePct = Math.max(0.02, p.rangePct ?? 0.15); // ±15% from start
  const initial = 10_000;
  const startPx = candles[0].c;
  const lo = startPx * (1 - rangePct);
  const hi = startPx * (1 + rangePct);
  const step = (hi - lo) / levels;
  const gridLines = Array.from({ length: levels + 1 }, (_, i) => lo + i * step);
  const perOrder = initial / levels;

  let cash = initial, qty = 0;
  const positions: { price: number; qty: number }[] = [];
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  // last known price to detect crossings; start from candle 0 close
  let lastPx = candles[0].c;

  for (let i = 1; i < candles.length; i++) {
    const px = candles[i].o;
    // BUY when price crosses a grid line downward
    for (const g of gridLines) {
      if (lastPx > g && px <= g && cash >= perOrder) {
        const q = perOrder / px;
        qty += q; cash -= perOrder;
        positions.push({ price: px, qty: q });
        trades.push({ t: candles[i].t, side: "BUY", price: px, qty: q, reason: `grid@${g.toFixed(2)}` });
      }
    }
    // SELL the oldest open position whose price+step ≤ px (take-profit one step up)
    for (let k = positions.length - 1; k >= 0; k--) {
      if (px >= positions[k].price + step) {
        const q = positions[k].qty;
        cash += q * px; qty -= q;
        trades.push({ t: candles[i].t, side: "SELL", price: px, qty: q, reason: `grid+1` });
        positions.splice(k, 1);
      }
    }
    lastPx = candles[i].c;
    equity.push({ t: candles[i].t, equity: cash + qty * candles[i].c, price: candles[i].c });
  }
  return { trades, equity };
};

const dca: StrategyFn = (candles, p) => {
  const everyN = Math.max(1, Math.floor(p.everyN ?? 24)); // buy every N candles
  const buys = Math.max(2, Math.floor(p.buys ?? 20));
  const initial = 10_000;
  const perBuy = initial / buys;
  let cash = initial, qty = 0, done = 0;
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];

  for (let i = 1; i < candles.length; i++) {
    const px = candles[i].o;
    if (done < buys && i % everyN === 0 && cash >= perBuy) {
      const q = perBuy / px;
      qty += q; cash -= perBuy; done++;
      trades.push({ t: candles[i].t, side: "BUY", price: px, qty: q, reason: `DCA ${done}/${buys}` });
    }
    equity.push({ t: candles[i].t, equity: cash + qty * candles[i].c, price: candles[i].c });
  }
  return { trades, equity };
};

const STRATS: Record<string, StrategyFn> = { sma_cross: smaCross, grid, dca };

// ─────────────────────────── Server fn ───────────────────────────
const inputSchema = z.object({
  asset: z.string().min(2).max(10),
  strategy: z.enum(["sma_cross", "grid", "dca"]),
  interval: z.enum(["15m", "1h", "4h", "1d"]).default("1h"),
  limit: z.number().int().min(100).max(1000).default(500),
  params: z.record(z.string(), z.number()).optional().default({}),
});

export const runBacktest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<BacktestResult> => {
    const candles = await fetchKlines(data.asset, data.interval, data.limit);
    if (candles.length < 50) throw new Error("Not enough candles");

    const fn = STRATS[data.strategy];
    const { trades, equity } = fn(candles, data.params ?? {});
    const initial = 10_000;
    const metrics = computeMetrics(equity, trades, initial);
    const startPrice = candles[0].c;
    const endPrice = candles[candles.length - 1].c;
    const pnlPct = ((metrics.finalEquity - initial) / initial) * 100;
    const buyHoldPct = ((endPrice - startPrice) / startPrice) * 100;

    return {
      asset: data.asset.toUpperCase(),
      strategy: data.strategy,
      interval: data.interval,
      candles: candles.length,
      startPrice,
      endPrice,
      buyHoldPct,
      pnlPct,
      trades: trades.slice(-200), // cap payload
      equity: equity.filter((_, i) => i % Math.max(1, Math.floor(equity.length / 240)) === 0),
      metrics,
    };
  });
