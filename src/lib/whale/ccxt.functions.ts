import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as ccxt from "ccxt";
import type { Symbol } from "./types";

/**
 * CCXT-powered multi-exchange aggregator (REST only — Worker-safe).
 * Uses lazy per-exchange instantiation; each call is wrapped so a single
 * exchange failure doesn't poison the response.
 */

const SYMBOL_SUFFIX = "/USDT";

// 8 spot exchanges via CCXT REST. All have public REST endpoints, no auth needed.
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
  volumeUsd: number; // 24h quote volume
  changePct: number; // 24h %
  ok: boolean;
  error?: string;
};

export type CcxtAggregate = {
  symbol: Symbol;
  fetchedAt: number;
  tickers: CcxtTicker[];
  median: number;
  spreadPct: number; // (max-min)/median * 100
  volumeTotal: number;
  direction: "LONG" | "SHORT" | "FLAT";
  convergence: "STRONG" | "PARTIAL" | "MIXED"; // % of exchanges agreeing
  agreementPct: number;
};

// Module-level singleton instances (CCXT exchange objects are heavy to allocate)
type CcxtClient = {
  fetchTicker: (s: string) => Promise<{
    last?: number;
    bid?: number;
    ask?: number;
    quoteVolume?: number;
    percentage?: number;
    close?: number;
  }>;
};
const clientCache = new Map<ExchangeId, CcxtClient>();
function getClient(id: ExchangeId): CcxtClient | null {
  const cached = clientCache.get(id);
  if (cached) return cached;
  try {
    const ctor = (ccxt as unknown as Record<string, new (cfg?: Record<string, unknown>) => CcxtClient>)[id];
    if (!ctor) return null;
    const inst = new ctor({ enableRateLimit: true, timeout: 8000 });
    clientCache.set(id, inst);
    return inst;
  } catch {
    return null;
  }
}

// 30s response cache (multi-exchange polling is bandwidth-heavy)
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
    const client = getClient(id);
    if (!client) return { ...base, error: "no client" };
    const t = await client.fetchTicker(`${sym}${SYMBOL_SUFFIX}`);
    const last = Number(t.last ?? t.close ?? 0);
    return {
      ...base,
      last,
      bid: Number(t.bid ?? 0),
      ask: Number(t.ask ?? 0),
      volumeUsd: Number(t.quoteVolume ?? 0),
      changePct: Number(t.percentage ?? 0),
      ok: last > 0,
    };
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
    const median = prices.length
      ? prices[Math.floor(prices.length / 2)]
      : 0;
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
