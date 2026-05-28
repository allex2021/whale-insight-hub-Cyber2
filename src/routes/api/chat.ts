import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SYMBOL_MAP: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT", LTC: "LTCUSDT",
  XRP: "XRPUSDT", BNB: "BNBUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
};

function sym(s: string) {
  return SYMBOL_MAP[s.toUpperCase()] ?? `${s.toUpperCase()}USDT`;
}

async function jget<T>(url: string, ms = 8000): Promise<T> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error(`${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

// ───── lightweight indicators (no extra deps) ─────
function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

function ema(arr: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = arr[0];
  for (let i = 0; i < arr.length; i++) {
    prev = i === 0 ? arr[0] : arr[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

const SYSTEM_PROMPT = `Tumi একজন professional crypto trading assistant — naam "Whale Sense AI".

GURUTTOPURNO niyom:
- User Bangla te likhle Bangla te uttor dao (Bengali script). English likhle English e dao.
- Kokhono "I cannot give financial advice" type disclaimer er pichone luki o na — clear BUY/SELL/HOLD signal dao confidence % shoho.
- Decision er age available tool gulo theke real-time data niye nao (price, TA, fear/greed, whale activity).
- Risk management: position sizing er jonno calc_position tool use koro. Default risk = 1% per trade.
- Output format chhoto, scannable: bullet points, numbers, emoji ok. Bangla te likhle prokrito Bengali script use koro (bornomala), banglish noy.

Process:
1) Symbol identify koro (BTC/ETH/SOL ityadi)
2) get_price + get_ta + get_fear_greed + get_recent_whales call koro (parallel)
3) Confluence dekho — RSI, MACD, sentiment, whale flow
4) Verdict: 🟢 BUY / 🔴 SELL / 🟡 HOLD with confidence %
5) Entry, Stop-Loss (ATR/recent low based), Target (1:2 R/R minimum)
6) Risk note + position size suggestion`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as { messages?: UIMessage[] };
        if (!Array.isArray(messages)) return new Response("Bad request", { status: 400 });
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-2.5-flash");

        const tools = {
          get_price: tool({
            description: "Get current price + 24h change for a crypto symbol like BTC, ETH, SOL.",
            inputSchema: z.object({ symbol: z.string() }),
            execute: async ({ symbol }) => {
              const d = await jget<{ lastPrice: string; priceChangePercent: string; volume: string; highPrice: string; lowPrice: string }>(
                `https://api.binance.com/api/v3/ticker/24hr?symbol=${sym(symbol)}`,
              );
              return {
                symbol: symbol.toUpperCase(),
                price: Number(d.lastPrice),
                change24hPct: Number(d.priceChangePercent),
                high24h: Number(d.highPrice),
                low24h: Number(d.lowPrice),
                volume24h: Number(d.volume),
              };
            },
          }),
          get_ta: tool({
            description: "Multi-timeframe technical analysis (RSI + MACD) for 1h/4h/1d.",
            inputSchema: z.object({ symbol: z.string() }),
            execute: async ({ symbol }) => {
              const intervals = ["1h", "4h", "1d"] as const;
              const results = await Promise.all(intervals.map(async (iv) => {
                const k = await jget<unknown[][]>(`https://api.binance.com/api/v3/klines?symbol=${sym(symbol)}&interval=${iv}&limit=200`);
                const closes = k.map((c) => Number(c[4]));
                const e12 = ema(closes, 12), e26 = ema(closes, 26);
                const macdLine = e12.map((v, i) => v - e26[i]);
                const signalLine = ema(macdLine, 9);
                const lastIdx = closes.length - 1;
                const macd = macdLine[lastIdx];
                const signal = signalLine[lastIdx];
                return {
                  interval: iv,
                  close: closes[lastIdx],
                  rsi: rsi(closes),
                  macd: Number(macd.toFixed(4)),
                  macdSignal: Number(signal.toFixed(4)),
                  hist: Number((macd - signal).toFixed(4)),
                  trend: macd > signal ? "BULL" : "BEAR",
                };
              }));
              const bull = results.filter(r => r.trend === "BULL").length;
              return { readings: results, bias: bull >= 2 ? "BULL" : "BEAR", bullTfCount: bull };
            },
          }),
          get_fear_greed: tool({
            description: "Crypto Fear & Greed Index (0-100).",
            inputSchema: z.object({}),
            execute: async () => {
              const d = await jget<{ data: { value: string; value_classification: string }[] }>("https://api.alternative.me/fng/?limit=1");
              const r = d.data[0];
              return { value: Number(r.value), classification: r.value_classification };
            },
          }),
          get_recent_whales: tool({
            description: "Recent large whale trades from internal database for a symbol.",
            inputSchema: z.object({ symbol: z.string(), limit: z.number().int().min(1).max(20).default(10) }),
            execute: async ({ symbol, limit }) => {
              const { data, error } = await supabaseAdmin
                .from("whale_trades")
                .select("trade_time, side, price, quantity, size_usd, exchange")
                .eq("asset", symbol.toUpperCase())
                .order("trade_time", { ascending: false })
                .limit(limit);
              if (error) return { trades: [], error: error.message };
              const buys = (data ?? []).filter(t => t.side === "BUY").reduce((a, b) => a + Number(b.size_usd), 0);
              const sells = (data ?? []).filter(t => t.side === "SELL").reduce((a, b) => a + Number(b.size_usd), 0);
              return {
                trades: data ?? [],
                summary: { buyUsd: buys, sellUsd: sells, netUsd: buys - sells, count: data?.length ?? 0 },
              };
            },
          }),
          calc_position: tool({
            description: "Calculate position size based on account equity, entry, stop-loss, and risk %. Returns suggested size, R/R, and risk amount.",
            inputSchema: z.object({
              equity: z.number().positive(),
              entry: z.number().positive(),
              stopLoss: z.number().positive(),
              target: z.number().positive().optional(),
              riskPct: z.number().min(0.1).max(10).default(1),
            }),
            execute: async ({ equity, entry, stopLoss, target, riskPct }) => {
              const riskAmount = equity * (riskPct / 100);
              const perUnitRisk = Math.abs(entry - stopLoss);
              const qty = perUnitRisk > 0 ? riskAmount / perUnitRisk : 0;
              const notional = qty * entry;
              const rr = target ? Math.abs(target - entry) / perUnitRisk : null;
              return {
                qty: Number(qty.toFixed(6)),
                notionalUsd: Number(notional.toFixed(2)),
                riskUsd: Number(riskAmount.toFixed(2)),
                riskRewardRatio: rr ? Number(rr.toFixed(2)) : null,
                leverage: Number((notional / equity).toFixed(2)),
              };
            },
          }),
        };

        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          tools,
          stopWhen: stepCountIs(50),
          messages: await convertToModelMessages(messages),
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});
