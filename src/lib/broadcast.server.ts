/**
 * Broadcast sender helpers (Telegram + Discord).
 * Server-only — never import from client code.
 */

export type ChannelRow = {
  id: string;
  name: string;
  channel_type: "telegram" | "discord";
  bot_token: string | null;
  chat_id: string | null;
  webhook_url: string | null;
  enabled: boolean;
  min_confidence: number;
  filter_assets: string[] | null;
  filter_sides: string[] | null;
};

export type SignalRow = {
  id: string;
  asset: string;
  direction: string;
  entry: number | null;
  target: number | null;
  stop: number | null;
  confidence: number;
  timeframe: string;
  reasoning: string | null;
};

export function formatSignalText(s: SignalRow): string {
  const arrow = s.direction === "LONG" ? "🟢 LONG" : s.direction === "SHORT" ? "🔴 SHORT" : "⚪ NEUTRAL";
  const lines = [
    `${arrow} ${s.asset} · ${s.timeframe} · conf ${s.confidence}%`,
    s.entry != null ? `Entry: $${Number(s.entry).toLocaleString()}` : null,
    s.target != null ? `Target: $${Number(s.target).toLocaleString()}` : null,
    s.stop != null ? `Stop:   $${Number(s.stop).toLocaleString()}` : null,
    "",
    s.reasoning ?? "",
    "",
    "— Whale Intelligence Pro",
  ].filter(Boolean);
  return lines.join("\n");
}

export async function sendTelegram(token: string, chatId: string, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Telegram ${r.status}: ${body.slice(0, 200)}`);
  }
}

export async function sendDiscord(webhookUrl: string, text: string) {
  const r = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Discord ${r.status}: ${body.slice(0, 200)}`);
  }
}

export async function dispatchToChannel(ch: ChannelRow, text: string) {
  if (ch.channel_type === "telegram") {
    if (!ch.bot_token || !ch.chat_id) throw new Error("Telegram credentials missing");
    await sendTelegram(ch.bot_token, ch.chat_id, text);
  } else if (ch.channel_type === "discord") {
    if (!ch.webhook_url) throw new Error("Discord webhook URL missing");
    await sendDiscord(ch.webhook_url, text);
  } else {
    throw new Error(`Unknown channel type: ${ch.channel_type}`);
  }
}

export function matchesFilters(ch: ChannelRow, s: SignalRow): boolean {
  if (s.confidence < ch.min_confidence) return false;
  if (ch.filter_assets && ch.filter_assets.length > 0 && !ch.filter_assets.includes(s.asset)) return false;
  if (ch.filter_sides && ch.filter_sides.length > 0 && !ch.filter_sides.includes(s.direction)) return false;
  return true;
}
