import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  asset: z.enum(["BTC", "ETH", "SOL"]).default("BTC"),
}).default({ asset: "BTC" });

const EvidenceItem = z.object({
  label: z.string().max(60),
  value: z.string().max(80),
  tone: z.enum(["BULL", "BEAR", "NEUTRAL", "WARN"]),
});

const ReportSchema = z.object({
  asset: z.string(),
  generatedAt: z.string(),
  sentiment: z.object({
    state: z.enum(["EXTREME_FEAR", "FEAR", "NEUTRAL", "GREED", "EXTREME_GREED"]),
    rsiExhaustion: z.enum(["OVERSOLD", "NEUTRAL", "OVERBOUGHT"]),
    summary: z.string().max(400),
    metrics: z.array(EvidenceItem).max(5),
  }),
  whaleIntent: z.object({
    bias: z.enum(["ACCUMULATION", "DISTRIBUTION", "MIXED", "QUIET"]),
    summary: z.string().max(400),
    actors: z.array(z.object({
      name: z.string().max(40),
      action: z.string().max(120),
      tone: z.enum(["BULL", "BEAR", "NEUTRAL"]),
    })).max(5),
  }),
  liquidationTraps: z.array(z.object({
    side: z.enum(["LONG", "SHORT"]),
    level: z.string().max(20),
    notionalUsd: z.string().max(20),
    note: z.string().max(120),
  })).max(5),
  forecast: z.object({
    bias: z.enum(["BULLISH", "BEARISH", "RANGE_BOUND", "VOLATILE"]),
    horizonHours: z.number().min(6).max(48),
    confidence: z.number().min(0).max(100),
    headline: z.string().max(160),
    rationale: z.string().max(500),
    keyResistance: z.string().max(20),
    keySupport: z.string().max(20),
    invalidation: z.string().max(160),
  }),
});

export type ObserverReport = z.infer<typeof ReportSchema>;

async function jget(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

async function buildContext(asset: string) {
  const sym = `${asset}USDT`;
  const ctx: Record<string, string> = {};
  await Promise.allSettled([
    jget(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`).then((j) => {
      const x = j as { lastPrice: string; priceChangePercent: string; quoteVolume: string };
      ctx.price = `$${parseFloat(x.lastPrice).toLocaleString()}`;
      ctx.change24h = `${parseFloat(x.priceChangePercent).toFixed(2)}%`;
      ctx.vol24h = `$${(parseFloat(x.quoteVolume) / 1e9).toFixed(2)}B`;
    }),
    jget(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`).then((j) => {
      const x = j as { lastFundingRate: string };
      ctx.funding = `${(parseFloat(x.lastFundingRate) * 100).toFixed(4)}%`;
    }),
    jget(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=1h&limit=24`).then((rows) => {
      const arr = rows as Array<{ sumOpenInterestValue: string }>;
      if (arr.length >= 2) {
        const f = parseFloat(arr[0].sumOpenInterestValue);
        const l = parseFloat(arr[arr.length - 1].sumOpenInterestValue);
        ctx.oiChange24h = `${(((l - f) / f) * 100).toFixed(2)}%`;
      }
    }),
    jget(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=1h&limit=1`).then((rows) => {
      const arr = rows as Array<{ longShortRatio: string }>;
      if (arr[0]) ctx.longShortRatio = parseFloat(arr[0].longShortRatio).toFixed(2);
    }),
    jget(`https://api.alternative.me/fng/?limit=1`).then((j) => {
      const x = j as { data: Array<{ value: string; value_classification: string }> };
      if (x.data?.[0]) ctx.fearGreed = `${x.data[0].value} (${x.data[0].value_classification})`;
    }),
  ]);
  return ctx;
}

export const generateObserverReport = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data ?? {}))
  .handler(async ({ data }) => {
    const KEY = process.env.LOVABLE_API_KEY;
    if (!KEY) throw new Error("LOVABLE_API_KEY not configured");

    const ctx = await buildContext(data.asset);
    const ctxLines = Object.entries(ctx).map(([k, v]) => `- ${k}: ${v}`).join("\n");

    const system =
      "You are the AI Market Observer for an institutional crypto terminal. " +
      "You compile concise 4-hour intelligence reports for professional traders. " +
      "You must be specific, numeric, and decisive — never generic. " +
      "Use the provided live market context. For unknown items, infer reasonable estimates and flag confidence accordingly. " +
      "Liquidation trap levels should be plausible price levels near current price. " +
      "Whale actors: reference real desks (Jump, Wintermute, Cumberland, Amber, GSR, B2C2) plausibly.";

    const user = `Generate the 4H AI Observer report for ${data.asset}.

LIVE MARKET CONTEXT:
${ctxLines || "(degraded — infer from typical regime)"}

Build a forward-looking 12-24h forecast. Be decisive. Include:
- Sentiment state + RSI exhaustion read
- Whale & VC intent log (top desks, last 4h)
- 3-5 liquidation traps (price level, notional USD, side)
- Forecast: direction, headline, confidence score, key resistance, key support, invalidation level`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_report",
            description: "Emit a structured 4H market observer report.",
            parameters: {
              type: "object",
              properties: {
                sentiment: {
                  type: "object",
                  properties: {
                    state: { type: "string", enum: ["EXTREME_FEAR", "FEAR", "NEUTRAL", "GREED", "EXTREME_GREED"] },
                    rsiExhaustion: { type: "string", enum: ["OVERSOLD", "NEUTRAL", "OVERBOUGHT"] },
                    summary: { type: "string" },
                    metrics: {
                      type: "array", maxItems: 5,
                      items: {
                        type: "object",
                        properties: {
                          label: { type: "string" }, value: { type: "string" },
                          tone: { type: "string", enum: ["BULL", "BEAR", "NEUTRAL", "WARN"] },
                        },
                        required: ["label", "value", "tone"],
                      },
                    },
                  },
                  required: ["state", "rsiExhaustion", "summary", "metrics"],
                },
                whaleIntent: {
                  type: "object",
                  properties: {
                    bias: { type: "string", enum: ["ACCUMULATION", "DISTRIBUTION", "MIXED", "QUIET"] },
                    summary: { type: "string" },
                    actors: {
                      type: "array", maxItems: 5,
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" }, action: { type: "string" },
                          tone: { type: "string", enum: ["BULL", "BEAR", "NEUTRAL"] },
                        },
                        required: ["name", "action", "tone"],
                      },
                    },
                  },
                  required: ["bias", "summary", "actors"],
                },
                liquidationTraps: {
                  type: "array", maxItems: 5,
                  items: {
                    type: "object",
                    properties: {
                      side: { type: "string", enum: ["LONG", "SHORT"] },
                      level: { type: "string" },
                      notionalUsd: { type: "string" },
                      note: { type: "string" },
                    },
                    required: ["side", "level", "notionalUsd", "note"],
                  },
                },
                forecast: {
                  type: "object",
                  properties: {
                    bias: { type: "string", enum: ["BULLISH", "BEARISH", "RANGE_BOUND", "VOLATILE"] },
                    horizonHours: { type: "number" },
                    confidence: { type: "number" },
                    headline: { type: "string" },
                    rationale: { type: "string" },
                    keyResistance: { type: "string" },
                    keySupport: { type: "string" },
                    invalidation: { type: "string" },
                  },
                  required: ["bias", "horizonHours", "confidence", "headline", "rationale", "keyResistance", "keySupport", "invalidation"],
                },
              },
              required: ["sentiment", "whaleIntent", "liquidationTraps", "forecast"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_report" } },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("AI rate limit — try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`AI gateway ${res.status}`);
    }

    const json = await res.json() as { choices?: Array<{ message?: { tool_calls?: Array<{ function: { arguments: string } }> } }> };
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("AI returned no report");
    const args = JSON.parse(call.function.arguments);
    const report = ReportSchema.parse({
      ...args,
      asset: data.asset,
      generatedAt: new Date().toISOString(),
    });
    return report;
  });
