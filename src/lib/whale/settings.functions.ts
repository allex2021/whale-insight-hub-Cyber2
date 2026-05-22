import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SettingsSchema = z.object({
  whale_min_usd: z.number().min(10_000).max(100_000_000),
  watchlist: z.array(z.string().regex(/^[A-Z]{2,10}$/)).min(1).max(20),
  telegram_bot_token: z.string().max(200).nullable().optional(),
  telegram_chat_id: z.string().max(100).nullable().optional(),
  enable_alerts: z.boolean(),
});

export const getMySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? {
      user_id: userId,
      whale_min_usd: 1_000_000,
      watchlist: ["BTC", "ETH", "SOL"],
      telegram_bot_token: null,
      telegram_chat_id: null,
      enable_alerts: true,
    };
  });

export const saveMySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTelegramTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_settings")
      .select("telegram_bot_token, telegram_chat_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.telegram_bot_token || !data?.telegram_chat_id) {
      throw new Error("Telegram bot token and chat ID required (save settings first).");
    }
    const r = await fetch(`https://api.telegram.org/bot${data.telegram_bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: data.telegram_chat_id,
        text: "🐋 *Whale Intelligence Pro* — test alert ✅\nYour bot is connected.",
        parse_mode: "Markdown",
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.description ?? `Telegram HTTP ${r.status}`);
    return { ok: true };
  });
