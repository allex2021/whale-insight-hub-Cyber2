import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GenerateInput = z.object({
  asset: z.string().min(2).max(10).regex(/^[A-Z0-9]+$/),
  price: z.number().positive(),
  recentTradesSummary: z.string().max(2000),
  timeframe: z.enum(["15m", "1H", "4H", "1D"]).default("4H"),
});

const EvidenceItem = z.object({
  label: z.string().max(40),
  value: z.string().max(40),
  bias: z.enum(["BULL", "BEAR", "NEUTRAL"]),
});

const SignalSchema = z.object({
  direction: z.enum(["LONG", "SHORT", "NEUTRAL"]),
  entry: z.number(),
  target: z.number(),
  stop: z.number(),
  confidence: z.number().min(0).max(100),
  reasoning: z.string().max(500),
  evidence: z.array(EvidenceItem).max(6),
});

async function jget(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

type MarketCtx = {
  funding: number;
  oiChange24h: number;
  priceChange24h: number;
  longShortRatio: number;
  volume24h: number;
};

async function fetchMarketContext(asset: string): Promise<Partial<MarketCtx>> {
  const sym = `${asset}USDT`;
  const out: Partial<MarketCtx> = {};
  await Promise.allSettled([
    jget(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`).then(
      (j) => { out.funding = parseFloat(j.lastFundingRate) * 100; },
    ),
    jget(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`).then(
      (j) => { out.priceChange24h = parseFloat(j.priceChangePercent); out.volume24h = parseFloat(j.quoteVolume); },
    ),
    jget(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=1h&limit=24`).then(
      (rows: Array<{ sumOpenInterestValue: string }>) => {
        if (rows.length >= 2) {
          const f = parseFloat(rows[0].sumOpenInterestValue);
          const l = parseFloat(rows[rows.length - 1].sumOpenInterestValue);
          out.oiChange24h = f ? ((l - f) / f) * 100 : 0;
        }
      },
    ),
    jget(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=1h&limit=1`).then(
      (rows: Array<{ longShortRatio: string }>) => {
        if (rows[0]) out.longShortRatio = parseFloat(rows[0].longShortRatio);
      },
    ),
  ]);
  return out;
}

export const generateAISignal = createServerFn({ method: "POST" })
  .inputValidator((data) => GenerateInput.parse(data))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const ctx = await fetchMarketContext(data.asset);

    const ctxLines = [
      ctx.funding !== undefined && `Funding rate: ${ctx.funding.toFixed(4)}% (${ctx.funding > 0.01 ? "longs paying — overheated" : ctx.funding < -0.01 ? "shorts paying — squeeze risk" : "neutral"})`,
      ctx.oiChange24h !== undefined && `Open Interest 24h: ${ctx.oiChange24h >= 0 ? "+" : ""}${ctx.oiChange24h.toFixed(2)}%`,
      ctx.priceChange24h !== undefined && `Price 24h: ${ctx.priceChange24h >= 0 ? "+" : ""}${ctx.priceChange24h.toFixed(2)}%`,
      ctx.longShortRatio !== undefined && `Long/Short Ratio: ${ctx.longShortRatio.toFixed(2)} (${ctx.longShortRatio > 1.3 ? "crowded long" : ctx.longShortRatio < 0.77 ? "crowded short" : "balanced"})`,
      ctx.volume24h !== undefined && `Volume 24h: $${(ctx.volume24h / 1e9).toFixed(2)}B`,
    ].filter(Boolean).join("\n");

    const tfHorizon: Record<string, string> = {
      "15m": "scalp (next 1-4 hours)",
      "1H": "intraday (next 4-12 hours)",
      "4H": "swing (next 1-3 days)",
      "1D": "position (next 3-10 days)",
    };

    const system =
      "You are a senior crypto perp trader. Combine whale flow, funding, OI, and L/S positioning into a single high-conviction signal. " +
      "Use realistic risk/reward (>= 1.8). Stops must respect typical volatility for the timeframe. " +
      "Confidence (0-100) must reflect evidence strength — disagree with the crowd when contrarian setups appear. " +
      "Return 3-5 evidence items, each with a short label, numeric value, and bias (BULL/BEAR/NEUTRAL).";

    const user = `Asset: ${data.asset}
Current price: $${data.price}
Timeframe: ${data.timeframe} (${tfHorizon[data.timeframe]})

Market context:
${ctxLines || "(market context unavailable)"}

Recent large-trade flow (last 5 min):
${data.recentTradesSummary}

Produce one perp trading signal.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_signal",
            description: "Emit a structured trading signal with supporting evidence.",
            parameters: {
              type: "object",
              properties: {
                direction: { type: "string", enum: ["LONG", "SHORT", "NEUTRAL"] },
                entry: { type: "number" },
                target: { type: "number" },
                stop: { type: "number" },
                confidence: { type: "number" },
                reasoning: { type: "string" },
                evidence: {
                  type: "array",
                  maxItems: 6,
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      value: { type: "string" },
                      bias: { type: "string", enum: ["BULL", "BEAR", "NEUTRAL"] },
                    },
                    required: ["label", "value", "bias"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["direction", "entry", "target", "stop", "confidence", "reasoning", "evidence"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_signal" } },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("AI rate limit reached — try again in a minute.");
      if (res.status === 402) throw new Error("AI credits exhausted — please add funds.");
      const txt = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${txt.slice(0, 200)}`);
    }

    const json = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("AI did not return a tool call");
    const args = JSON.parse(call.function.arguments);
    const parsed = SignalSchema.parse(args);

    const { data: row, error } = await supabaseAdmin
      .from("ai_signals")
      .insert({
        asset: data.asset,
        direction: parsed.direction,
        entry: parsed.entry,
        target: parsed.target,
        stop: parsed.stop,
        confidence: Math.round(parsed.confidence),
        reasoning: parsed.reasoning,
        evidence: parsed.evidence,
        timeframe: data.timeframe,
        model: "google/gemini-2.5-flash",
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to save signal: ${error.message}`);
    return row;
  });

export const fetchLatestSignals = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("ai_signals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);

    // Latest per (asset, timeframe)
    const seen = new Set<string>();
    const latest = (data ?? []).filter((s) => {
      const k = `${s.asset}:${s.timeframe}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { signals: latest };
  });
