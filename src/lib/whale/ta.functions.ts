import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { RSI, MACD } from "technicalindicators";
import type { Symbol } from "./types";

/**
 * Multi-timeframe technical indicators via Binance public klines.
 * - Fear & Greed Index from alternative.me (no key).
 * - RSI(14) and MACD(12,26,9) computed across 1h / 4h / 1d.
 */

export type FearGreed = {
  value: number; // 0..100
  classification: string;
  fetchedAt: number;
};

let fgCache: { at: number; data: FearGreed } | null = null;

export const fetchFearGreed = createServerFn({ method: "GET" }).handler(
  async (): Promise<FearGreed> => {
    if (fgCache && Date.now() - fgCache.at < 5 * 60_000) return fgCache.data;
    const r = await fetch("https://api.alternative.me/fng/?limit=1");
    if (!r.ok) throw new Error(`fng ${r.status}`);
    const j = (await r.json()) as {
      data?: Array<{ value: string; value_classification: string }>;
    };
    const d = j.data?.[0];
    const out: FearGreed = {
      value: Number(d?.value) || 0,
      classification: d?.value_classification || "Unknown",
      fetchedAt: Date.now(),
    };
    fgCache = { at: Date.now(), data: out };
    return out;
  },
);

export type TfReading = {
  interval: "1h" | "4h" | "1d";
  rsi: number;
  macd: number;
  signal: number;
  hist: number;
  trend: "BULL" | "BEAR" | "NEUTRAL";
  lastClose: number;
};

export type MultiTfTA = {
  symbol: Symbol;
  fetchedAt: number;
  readings: TfReading[];
  bias: "BULL" | "BEAR" | "MIXED";
  bullCount: number;
};

const INTERVALS: TfReading["interval"][] = ["1h", "4h", "1d"];
const taCache = new Map<Symbol, { at: number; data: MultiTfTA }>();

async function getCloses(sym: Symbol, interval: string, limit = 200): Promise<number[]> {
  const r = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${sym}USDT&interval=${interval}&limit=${limit}`,
  );
  if (!r.ok) throw new Error(`klines ${interval} ${r.status}`);
  const j = (await r.json()) as Array<unknown[]>;
  return j.map((k) => Number(k[4]));
}

function lastN<T>(arr: T[], n: number): T[] {
  return arr.length <= n ? arr : arr.slice(arr.length - n);
}

export const fetchMultiTfTA = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: Symbol }) =>
    z.object({ symbol: z.enum(["BTC", "ETH", "SOL", "LTC"]) }).parse(d),
  )
  .handler(async ({ data }): Promise<MultiTfTA> => {
    const sym = data.symbol;
    const cached = taCache.get(sym);
    if (cached && Date.now() - cached.at < 60_000) return cached.data;

    const readings = await Promise.all(
      INTERVALS.map(async (interval): Promise<TfReading> => {
        const closes = await getCloses(sym, interval, 200);
        const rsiArr = RSI.calculate({ period: 14, values: closes }) as number[];
        const macdArr = MACD.calculate({
          values: closes,
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
          SimpleMAOscillator: false,
          SimpleMASignal: false,
        }) as Array<{ MACD?: number; signal?: number; histogram?: number }>;
        const rsi = lastN(rsiArr, 1)[0] ?? 50;
        const last = macdArr[macdArr.length - 1] ?? {};
        const macd = Number(last.MACD ?? 0);
        const signal = Number(last.signal ?? 0);
        const hist = Number(last.histogram ?? 0);
        const trend: TfReading["trend"] =
          rsi > 55 && hist > 0 ? "BULL" : rsi < 45 && hist < 0 ? "BEAR" : "NEUTRAL";
        return {
          interval,
          rsi,
          macd,
          signal,
          hist,
          trend,
          lastClose: closes[closes.length - 1] ?? 0,
        };
      }),
    );

    const bullCount = readings.filter((r) => r.trend === "BULL").length;
    const bearCount = readings.filter((r) => r.trend === "BEAR").length;
    const bias: MultiTfTA["bias"] =
      bullCount >= 2 ? "BULL" : bearCount >= 2 ? "BEAR" : "MIXED";

    const out: MultiTfTA = {
      symbol: sym,
      fetchedAt: Date.now(),
      readings,
      bias,
      bullCount,
    };
    taCache.set(sym, { at: Date.now(), data: out });
    return out;
  });
