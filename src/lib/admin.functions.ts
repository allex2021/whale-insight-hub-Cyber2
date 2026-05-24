import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchToChannel, formatSignalText, type ChannelRow } from "./broadcast.server";

async function ensureAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });

export const listChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("broadcast_channels")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { channels: (data ?? []) as ChannelRow[] };
  });

const ChannelInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  channel_type: z.enum(["telegram", "discord"]),
  bot_token: z.string().max(500).nullable().optional(),
  chat_id: z.string().max(100).nullable().optional(),
  webhook_url: z.string().max(500).nullable().optional(),
  enabled: z.boolean().default(true),
  min_confidence: z.number().int().min(0).max(100).default(60),
  filter_assets: z.array(z.string().max(20)).nullable().optional(),
  filter_sides: z.array(z.enum(["LONG", "SHORT", "NEUTRAL"])).nullable().optional(),
});

export const saveChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ChannelInput.parse(data))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    if (data.channel_type === "telegram" && (!data.bot_token || !data.chat_id)) {
      throw new Error("Telegram channels need bot_token and chat_id");
    }
    if (data.channel_type === "discord" && !data.webhook_url) {
      throw new Error("Discord channels need webhook_url");
    }

    const row = {
      name: data.name,
      channel_type: data.channel_type,
      bot_token: data.bot_token ?? null,
      chat_id: data.chat_id ?? null,
      webhook_url: data.webhook_url ?? null,
      enabled: data.enabled,
      min_confidence: data.min_confidence,
      filter_assets: data.filter_assets ?? null,
      filter_sides: data.filter_sides ?? null,
      created_by: context.userId,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("broadcast_channels")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("broadcast_channels")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: ins.id };
    }
  });

export const deleteChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("broadcast_channels")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { data: ch, error } = await supabaseAdmin
      .from("broadcast_channels")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !ch) throw new Error(error?.message ?? "Channel not found");

    const sample = formatSignalText({
      id: "test",
      asset: "BTC",
      direction: "LONG",
      entry: 67800,
      target: 71200,
      stop: 66100,
      confidence: 78,
      timeframe: "4H",
      reasoning: "🔔 Test signal — channel wiring is working correctly.",
    });

    try {
      await dispatchToChannel(ch as ChannelRow, sample);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("broadcast_signals")
      .select("id, status, error, sent_at, created_at, signal_id, channel_id, ai_signals(asset, direction, confidence, timeframe), broadcast_channels(name, channel_type)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { broadcasts: data ?? [] };
  });
