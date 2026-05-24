import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchToChannel, formatSignalText, matchesFilters, type ChannelRow, type SignalRow } from "@/lib/broadcast.server";
import { generateAISignal } from "@/lib/whale/ai.functions";

/**
 * Hourly cron: scans configured coins, calls AI for each, then broadcasts
 * fresh signals to all enabled channels matching the filters.
 *
 * Auth: `apikey` header == Supabase anon key.
 */
export const Route = createFileRoute("/api/public/cron/broadcast-signals")({
  server: { handlers: { POST: handler, GET: handler } },
});

// Top-30 perp universe by liquidity. Cron scans these every hour.
const ASSETS = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "TRX",
  "DOT", "MATIC", "LTC", "SHIB", "BCH", "NEAR", "UNI", "APT", "ATOM", "ETC",
  "FIL", "ARB", "OP", "INJ", "SUI", "TIA", "SEI", "RUNE", "AAVE", "PEPE",
] as const;
const TIMEFRAME = "4H" as const;
const COOLDOWN_HOURS = 4;

async function handler({ request }: { request: Request }) {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const provided = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 1. Load enabled channels
  const { data: channels, error: chErr } = await supabaseAdmin
    .from("broadcast_channels")
    .select("*")
    .eq("enabled", true);
  if (chErr) return Response.json({ error: chErr.message }, { status: 500 });
  if (!channels || channels.length === 0) {
    return Response.json({ ok: true, note: "no enabled channels", scanned: 0 });
  }

  // 2. Generate fresh signals per asset (skip if cooldown active)
  const cooldownIso = new Date(Date.now() - COOLDOWN_HOURS * 3600_000).toISOString();
  const generated: SignalRow[] = [];
  const errors: string[] = [];

  for (const asset of ASSETS) {
    try {
      const { data: recent } = await supabaseAdmin
        .from("ai_signals")
        .select("id")
        .eq("asset", asset)
        .eq("timeframe", TIMEFRAME)
        .gte("created_at", cooldownIso)
        .limit(1);
      if (recent && recent.length > 0) continue;

      // Use latest whale trades as flow summary
      const { data: trades } = await supabaseAdmin
        .from("whale_trades")
        .select("side, size_usd, price")
        .eq("asset", asset)
        .gte("trade_time", new Date(Date.now() - 5 * 60_000).toISOString())
        .order("trade_time", { ascending: false })
        .limit(20);

      const summary = (trades && trades.length > 0)
        ? trades.map((t) => `${t.side} $${(Number(t.size_usd) / 1e6).toFixed(2)}M @ $${Number(t.price).toLocaleString()}`).join("; ")
        : "(no large trades in last 5 min)";

      // Get current price
      const tickerRes = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${asset}USDT`);
      if (!tickerRes.ok) { errors.push(`${asset}: ticker ${tickerRes.status}`); continue; }
      const ticker = await tickerRes.json() as { price: string };
      const price = parseFloat(ticker.price);
      if (!Number.isFinite(price) || price <= 0) { errors.push(`${asset}: bad price`); continue; }

      const signal = await generateAISignal({
        data: { asset, price, recentTradesSummary: summary, timeframe: TIMEFRAME },
      });
      generated.push(signal as SignalRow);
    } catch (e) {
      errors.push(`${asset}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 3. Broadcast each generated signal to matching channels
  let sent = 0, failed = 0, skipped = 0;
  for (const signal of generated) {
    if (signal.direction === "NEUTRAL") { skipped++; continue; }
    const text = formatSignalText(signal);

    for (const ch of channels as ChannelRow[]) {
      if (!matchesFilters(ch, signal)) { skipped++; continue; }

      // Dedup: skip if already broadcast this signal to this channel
      const { data: dup } = await supabaseAdmin
        .from("broadcast_signals")
        .select("id")
        .eq("signal_id", signal.id)
        .eq("channel_id", ch.id)
        .limit(1);
      if (dup && dup.length > 0) { skipped++; continue; }

      try {
        await dispatchToChannel(ch, text);
        await supabaseAdmin.from("broadcast_signals").insert({
          signal_id: signal.id,
          channel_id: ch.id,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
        sent++;
      } catch (e) {
        await supabaseAdmin.from("broadcast_signals").insert({
          signal_id: signal.id,
          channel_id: ch.id,
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
        failed++;
      }
    }
  }

  return Response.json({
    ok: true,
    channels: channels.length,
    generated: generated.length,
    sent,
    failed,
    skipped,
    errors,
  });
}
