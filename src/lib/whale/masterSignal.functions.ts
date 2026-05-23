import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  asset: z.enum(["BTC", "ETH", "SOL"]),
  price: z.number().positive(),
  direction: z.enum(["LONG", "SHORT", "NEUTRAL"]),
  confidence: z.number().min(0).max(100),
  confluenceScore: z.number().min(0).max(100),
  fundingRate: z.number(),
  longShortRatio: z.number(),
  orderBookImbalance: z.number(),
  fearGreedIndex: z.number(),
  openInterestChange1h: z.number(),
  whaleNetUsd: z.number(),
  whaleBuyCount: z.number(),
  whaleSellCount: z.number(),
  priceChange24h: z.number().optional(),
});

const Output = z.object({
  verdict: z.enum(["AGREE", "DISAGREE", "UPGRADE", "DOWNGRADE", "CAUTION"]),
  summary: z.string().transform((s) => s.slice(0, 600)),
  keyRisk: z.string().transform((s) => s.slice(0, 400)),
  bullishFactors: z.array(z.string().transform((s) => s.slice(0, 240))).max(8),
  bearishFactors: z.array(z.string().transform((s) => s.slice(0, 240))).max(8),
  suggestedConfidence: z.number().min(0).max(100),
});

export const generateMasterAISignal = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const system =
      "You are a senior crypto perp desk strategist. You receive a rule-based master signal " +
      "aggregated from whale flow, derivatives positioning, sentiment, and order book data. " +
      "Critique it: do you AGREE, DISAGREE, want to UPGRADE conviction, DOWNGRADE, or flag CAUTION? " +
      "Be concise, evidence-driven, contrarian when warranted.";

    const userMsg = `Asset: ${data.asset} @ $${data.price}
Rule-based call: ${data.direction} (${data.confidence}% conviction)

Market state:
- Confluence score: ${data.confluenceScore}/100
- Funding rate: ${(data.fundingRate * 100).toFixed(4)}%
- Long/Short ratio: ${data.longShortRatio.toFixed(2)}
- Order book imbalance (top 20): ${(data.orderBookImbalance * 100).toFixed(1)}%
- Fear & Greed: ${data.fearGreedIndex}/100
- OI Δ 1h: ${data.openInterestChange1h.toFixed(2)}%
- Whale 6h: ${data.whaleBuyCount} buys / ${data.whaleSellCount} sells, net $${(data.whaleNetUsd / 1e6).toFixed(2)}M
- Price 24h: ${(data.priceChange24h ?? 0).toFixed(2)}%

Return a structured verdict.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_verdict",
            description: "Emit structured AI verdict on the master signal.",
            parameters: {
              type: "object",
              properties: {
                verdict: { type: "string", enum: ["AGREE", "DISAGREE", "UPGRADE", "DOWNGRADE", "CAUTION"] },
                summary: { type: "string" },
                keyRisk: { type: "string" },
                bullishFactors: { type: "array", items: { type: "string" }, maxItems: 5 },
                bearishFactors: { type: "array", items: { type: "string" }, maxItems: 5 },
                suggestedConfidence: { type: "number" },
              },
              required: ["verdict", "summary", "keyRisk", "bullishFactors", "bearishFactors", "suggestedConfidence"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_verdict" } },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("AI rate limit reached — try again in a minute.");
      if (res.status === 402) throw new Error("AI credits exhausted — please add funds.");
      const t = await res.text();
      throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
    }

    const json = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("AI did not return a verdict");
    return Output.parse(JSON.parse(call.function.arguments));
  });
