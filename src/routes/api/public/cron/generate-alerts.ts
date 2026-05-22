import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Cron-driven alert engine.
 *
 * Auth: requires `apikey` header == Supabase anon key.
 * Logic: scans whale_trades from the last 5 minutes and, for each user_settings
 * row, generates `WHALE` alerts when a trade matches their watchlist & threshold.
 * If the user has Telegram credentials configured, the alert is pushed.
 */
export const Route = createFileRoute("/api/public/cron/generate-alerts")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

async function handler({ request }: { request: Request }) {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const provided = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sinceIso = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: trades, error: tErr } = await supabaseAdmin
    .from("whale_trades")
    .select("asset, side, size_usd, price, trade_time")
    .gte("trade_time", sinceIso)
    .order("trade_time", { ascending: false })
    .limit(500);
  if (tErr) return Response.json({ error: tErr.message }, { status: 500 });

  const { data: users, error: uErr } = await supabaseAdmin
    .from("user_settings")
    .select("user_id, whale_min_usd, watchlist, enable_alerts, telegram_bot_token, telegram_chat_id")
    .eq("enable_alerts", true);
  if (uErr) return Response.json({ error: uErr.message }, { status: 500 });

  let alertsCreated = 0;
  let telegramsSent = 0;

  for (const u of users ?? []) {
    const watchSet = new Set((u.watchlist as string[]).map((s) => s.toUpperCase()));
    const threshold = Number(u.whale_min_usd);
    const matches = (trades ?? []).filter(
      (t) => watchSet.has(t.asset.toUpperCase()) && Number(t.size_usd) >= threshold,
    );
    if (matches.length === 0) continue;

    // Dedup: skip trades already alerted in last 10 min for this user
    const dedupIso = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("alerts")
      .select("payload")
      .eq("user_id", u.user_id)
      .eq("alert_type", "WHALE")
      .gte("created_at", dedupIso);
    const seenKeys = new Set(
      (recent ?? [])
        .map((r) => {
          const p = r.payload as { key?: string } | null;
          return p?.key;
        })
        .filter(Boolean),
    );

    for (const t of matches) {
      const key = `${t.asset}-${t.side}-${t.price}-${t.trade_time}`;
      if (seenKeys.has(key)) continue;

      const sizeM = (Number(t.size_usd) / 1_000_000).toFixed(2);
      const sideEmoji = t.side === "BUY" ? "🟢" : "🔴";
      const message = `${sideEmoji} ${t.side} ${t.asset} $${sizeM}M @ $${Number(t.price).toLocaleString()}`;
      const severity = Number(t.size_usd) >= threshold * 5 ? "high" : Number(t.size_usd) >= threshold * 2 ? "medium" : "info";

      const { error: insErr } = await supabaseAdmin.from("alerts").insert({
        user_id: u.user_id,
        alert_type: "WHALE",
        asset: t.asset,
        severity,
        message,
        payload: { key, size_usd: t.size_usd, price: t.price, side: t.side },
      });
      if (insErr) continue;
      alertsCreated++;

      if (u.telegram_bot_token && u.telegram_chat_id) {
        try {
          const r = await fetch(`https://api.telegram.org/bot${u.telegram_bot_token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: u.telegram_chat_id,
              text: `🐋 *Whale Alert*\n${message}\n_Severity: ${severity}_`,
              parse_mode: "Markdown",
              disable_web_page_preview: true,
            }),
          });
          if (r.ok) telegramsSent++;
        } catch {
          // ignore telegram errors per-user
        }
      }
    }
  }

  return Response.json({
    ok: true,
    scanned_trades: trades?.length ?? 0,
    users: users?.length ?? 0,
    alerts_created: alertsCreated,
    telegrams_sent: telegramsSent,
  });
}
