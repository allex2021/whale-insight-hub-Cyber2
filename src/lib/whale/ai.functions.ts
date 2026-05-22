import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GenerateInput = z.object({
  asset: z.enum(["BTC", "ETH", "SOL"]),
  price: z.number().positive(),
  recentTradesSummary: z.string().max(2000),
});

const SignalSchema = z.object({
  direction: z.enum(["LONG", "SHORT", "NEUTRAL"]),
  entry: z.number(),
  target: z.number(),
  stop: z.number(),
  confidence: z.number().min(0).max(100),
  reasoning: z.string().max(500),
});

/**
 * Generate a fresh AI trading signal using the Lovable AI Gateway and persist it.
 * Uses Google Gemini 2.5 Flash via the gateway — no API key needed from the user.
 */
export const generateAISignal = createServerFn({ method: "POST" })
  .inputValidator((data) => GenerateInput.parse(data))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const system =
      "You are a senior crypto perp trader. Output ONLY structured trading signals. " +
      "Use realistic risk/reward (>= 1.8). Confidence reflects evidence strength.";
    const user = `Asset: ${data.asset}
Current price: $${data.price}
Recent large-trade flow (last 5 min):
${data.recentTradesSummary}

Produce one perp trading signal for ${data.asset} on the 4H timeframe.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_signal",
              description: "Emit a structured trading signal.",
              parameters: {
                type: "object",
                properties: {
                  direction: { type: "string", enum: ["LONG", "SHORT", "NEUTRAL"] },
                  entry: { type: "number" },
                  target: { type: "number" },
                  stop: { type: "number" },
                  confidence: { type: "number" },
                  reasoning: { type: "string" },
                },
                required: ["direction", "entry", "target", "stop", "confidence", "reasoning"],
                additionalProperties: false,
              },
            },
          },
        ],
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

    // Persist
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
        timeframe: "4H",
        model: "google/gemini-2.5-flash",
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to save signal: ${error.message}`);
    return row;
  });

/** Fetch the latest N signals from the database (one per asset, newest first). */
export const fetchLatestSignals = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("ai_signals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);

    // Keep only latest signal per asset
    const seen = new Set<string>();
    const latest = (data ?? []).filter((s) => {
      if (seen.has(s.asset)) return false;
      seen.add(s.asset);
      return true;
    });
    return { signals: latest };
  });
