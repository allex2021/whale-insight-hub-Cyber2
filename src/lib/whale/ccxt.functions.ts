import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Symbol } from "./types";

/**
 * Multi-exchange aggregator using direct public REST endpoints.
 * (CCXT was dropped because it does dynamic requires that don't bundle
 * for the Cloudflare Worker runtime.)
 */

const EXCHANGE_IDS = [
  "binance",
  "bybit",
  "okx",
  "kraken",
  "coinbase",
  "mexc",
  "gate",
  "kucoin",
] as const;
type ExchangeId = (typeof EXCHANGE_IDS)[number];

export type CcxtTicker = {
  exchange: ExchangeId;
  symbol: Symbol;
  last: number;
  bid: number;
  ask: number;
  volumeUsd: number;
  changePct: number;
  ok: boolean;
  error?: string;
};

export type CcxtAggregate = {
  symbol: Symbol;
  fetchedAt: number;
  tickers: CcxtTicker[];
  median: number;
  spreadPct: number;
  volumeTotal: number;
  direction: "LONG" | "SHORT" | "FLAT";
  convergence: "STRONG" | "PARTIAL" | "MIXED";
  agreementPct: number;
};

const num = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

async function jget(url: string, timeoutMs = 7000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

type RawTicker = { last: number; bid: number; ask: number; volumeUsd: number; changePct: number };

async function fetchBinance(sym: Symbol): Promise<RawTicker> {
  const j = (await jget(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}USDT`)) as Record<string, unknown>;
  return {
    last: num(j.lastPrice),
    bid: num(j.bidPrice),
    ask: num(j.askPrice),
    volumeUsd: num(j.quoteVolume),
    changePct: num(j.priceChangePercent),
  };
}

async function fetchBybit(sym: Symbol): Promise<RawTicker> {
  const j = (await jget(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${sym}USDT`)) as {
    result?: { list?: Array<Record<string, unknown>> };
  };
  const t = j.result?.list?.[0] ?? {};
  return {
    last: num(t.lastPrice),
    bid: num(t.bid1Price),
    ask: num(t.ask1Price),
    volumeUsd: num(t.turnover24h),
    changePct: num(t.price24hPcnt) * 100,
  };
}

async function fetchOkx(sym: Symbol): Promise<RawTicker> {
  const j = (await jget(`https://www.okx.com/api/v5/market/ticker?instId=${sym}-USDT`)) as {
    data?: Array<Record<string, unknown>>;
  };
  const t = j.data?.[0] ?? {};
  const last = num(t.last);
  const open = num(t.open24h);
  return {
    last,
    bid: num(t.bidPx),
    ask: num(t.askPx),
    volumeUsd: num(t.volCcy24h) * last,
    changePct: open > 0 ? ((last - open) / open) * 100 : 0,
  };
}

async function fetchKraken(sym: Symbol): Promise<RawTicker> {
  const pair = `${sym === "BTC" ? "XBT" : sym}USDT`;
  const j = (await jget(`https://api.kraken.com/0/public/Ticker?pair=${pair}`)) as {
    result?: Record<string, Record<string, unknown>>;
  };
  const key = Object.keys(j.result ?? {})[0];
  const t = (key ? j.result?.[key] : {}) as Record<string, unknown>;
  const c = Array.isArray(t.c) ? (t.c as unknown[]) : [];
  const o = num(t.o);
  const last = num(c[0]);
  const v = Array.isArray(t.v) ? (t.v as unknown[]) : [];
  return {
    last,
    bid: num(Array.isArray(t.b) ? (t.b as unknown[])[0] : 0),
    ask: num(Array.isArray(t.a) ? (t.a as unknown[])[0] : 0),
    volumeUsd: num(v[1]) * last,
    changePct: o > 0 ? ((last - o) / o) * 100 : 0,
  };
}

async function fetchCoinbase(sym: Symbol): Promise<RawTicker> {
  const pair = `${sym}-USD`;
  const [stats, ticker] = await Promise.all([
    jget(`https://api.exchange.coinbase.com/products/${pair}/stats`) as Promise<Record<string, unknown>>,
    jget(`https://api.exchange.coinbase.com/products/${pair}/ticker`) as Promise<Record<string, unknown>>,
  ]);
  const last = num(ticker.price);
  const open = num(stats.open);
  return {
    last,
    bid: num(ticker.bid),
    ask: num(ticker.ask),
    volumeUsd: num(stats.volume) * last,
    changePct: open > 0 ? ((last - open) / open) * 100 : 0,
  };
}

async function fetchMexc(sym: Symbol): Promise<RawTicker> {
  const j = (await jget(`https://api.mexc.com/api/v3/ticker/24hr?symbol=${sym}USDT`)) as Record<string, unknown>;
  return {
    last: num(j.lastPrice),
    bid: num(j.bidPrice),
    ask: num(j.askPrice),
    volumeUsd: num(j.quoteVolume),
    changePct: num(j.priceChangePercent),
  };
}

async function fetchGate(sym: Symbol): Promise<RawTicker> {
  const pair = `${sym}_USDT`;
  const j = (await jget(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${pair}`)) as Array<
    Record<string, unknown>
  >;
  const t = j?.[0] ?? {};
  return {
    last: num(t.last),
    bid: num(t.highest_bid),
    ask: num(t.lowest_ask),
    volumeUsd: num(t.quote_volume),
    changePct: num(t.change_percentage),
  };
}

async function fetchKucoin(sym: Symbol): Promise<RawTicker> {
  const pair = `${sym}-USDT`;
  const j = (await jget(`https://api.kucoin.com/api/v1/market/stats?symbol=${pair}`)) as {
    data?: Record<string, unknown>;
  };
  const t = j.data ?? {};
  return {
    last: num(t.last),
    bid: num(t.buy),
    ask: num(t.sell),
    volumeUsd: num(t.volValue),
    changePct: num(t.changeRate) * 100,
  };
}

const FETCHERS: Record<ExchangeId, (s: Symbol) => Promise<RawTicker>> = {
  binance: fetchBinance,
  bybit: fetchBybit,
  okx: fetchOkx,
  kraken: fetchKraken,
  coinbase: fetchCoinbase,
  mexc: fetchMexc,
  gate: fetchGate,
  kucoin: fetchKucoin,
};

const aggCache = new Map<Symbol, { at: number; data: CcxtAggregate }>();

async function fetchOne(id: ExchangeId, sym: Symbol): Promise<CcxtTicker> {
  const base: CcxtTicker = {
    exchange: id,
    symbol: sym,
    last: 0,
    bid: 0,
    ask: 0,
    volumeUsd: 0,
    changePct: 0,
    ok: false,
  };
  try {
    const r = await FETCHERS[id](sym);
    return { ...base, ...r, ok: r.last > 0 };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message.slice(0, 80) : "fetch failed" };
  }
}

export const fetchCcxtAggregate = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: Symbol }) =>
    z.object({ symbol: z.enum(["BTC", "ETH", "SOL", "LTC"]) }).parse(d),
  )
  .handler(async ({ data }): Promise<CcxtAggregate> => {
    const sym = data.symbol;
    const cached = aggCache.get(sym);
    if (cached && Date.now() - cached.at < 30_000) return cached.data;

    const tickers = await Promise.all(EXCHANGE_IDS.map((id) => fetchOne(id, sym)));
    const valid = tickers.filter((t) => t.ok);

    const prices = valid.map((t) => t.last).sort((a, b) => a - b);
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
    const spreadPct =
      median > 0 && prices.length > 1
        ? ((prices[prices.length - 1] - prices[0]) / median) * 100
        : 0;
    const volumeTotal = valid.reduce((s, t) => s + t.volumeUsd, 0);

    const ups = valid.filter((t) => t.changePct > 0).length;
    const downs = valid.filter((t) => t.changePct < 0).length;
    const direction: CcxtAggregate["direction"] =
      ups > downs ? "LONG" : downs > ups ? "SHORT" : "FLAT";
    const agreeCount = Math.max(ups, downs);
    const agreementPct = valid.length ? Math.round((agreeCount / valid.length) * 100) : 0;
    const convergence: CcxtAggregate["convergence"] =
      agreementPct >= 75 ? "STRONG" : agreementPct >= 55 ? "PARTIAL" : "MIXED";

    const data_: CcxtAggregate = {
      symbol: sym,
      fetchedAt: Date.now(),
      tickers,
      median,
      spreadPct,
      volumeTotal,
      direction,
      convergence,
      agreementPct,
    };
    aggCache.set(sym, { at: Date.now(), data: data_ });
    return data_;
  });
