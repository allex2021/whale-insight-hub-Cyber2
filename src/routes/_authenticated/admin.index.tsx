import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Send, Trash2, Edit2, X, MessageSquare, Hash } from "lucide-react";
import { listChannels, saveChannel, deleteChannel, testChannel } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: ChannelsPage,
});

type FormState = {
  id?: string;
  name: string;
  channel_type: "telegram" | "discord";
  bot_token: string;
  chat_id: string;
  webhook_url: string;
  enabled: boolean;
  min_confidence: number;
  filter_assets: string;
  filter_sides: string[];
};

const empty: FormState = {
  name: "",
  channel_type: "telegram",
  bot_token: "",
  chat_id: "",
  webhook_url: "",
  enabled: true,
  min_confidence: 60,
  filter_assets: "",
  filter_sides: [],
};

function ChannelsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listChannels);
  const save = useServerFn(saveChannel);
  const del = useServerFn(deleteChannel);
  const test = useServerFn(testChannel);

  const { data, isLoading } = useQuery({ queryKey: ["channels"], queryFn: () => list() });

  const [form, setForm] = useState<FormState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: (f: FormState) =>
      save({
        data: {
          id: f.id,
          name: f.name,
          channel_type: f.channel_type,
          bot_token: f.bot_token || null,
          chat_id: f.chat_id || null,
          webhook_url: f.webhook_url || null,
          enabled: f.enabled,
          min_confidence: f.min_confidence,
          filter_assets: f.filter_assets ? f.filter_assets.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : null,
          filter_sides: f.filter_sides.length > 0 ? (f.filter_sides as ("LONG" | "SHORT" | "NEUTRAL")[]) : null,
        },
      }),
    onSuccess: () => {
      setForm(null);
      setMsg("✅ Saved");
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (e: Error) => setMsg("❌ " + e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: (r) => setMsg(r.ok ? "✅ Test message sent!" : "❌ Test failed: " + r.error),
    onError: (e: Error) => setMsg("❌ " + e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Broadcast Channels</h2>
          <p className="text-sm text-muted-foreground">Telegram groups & Discord webhooks for AI signal broadcasts.</p>
        </div>
        <button
          onClick={() => { setForm(empty); setMsg(null); }}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add channel
        </button>
      </div>

      {msg && (
        <div className="rounded-md border border-border bg-card/50 p-3 text-sm">{msg}</div>
      )}

      {form && (
        <ChannelForm
          state={form}
          onChange={setForm}
          onCancel={() => setForm(null)}
          onSave={() => saveMut.mutate(form)}
          saving={saveMut.isPending}
        />
      )}

      <div className="space-y-2">
        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {data?.channels.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No channels yet. Add a Telegram group or Discord webhook to start broadcasting.
          </div>
        )}
        {data?.channels.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/40 p-3">
            <div className="flex items-center gap-2">
              {c.channel_type === "telegram" ? <MessageSquare className="h-4 w-4 text-[#229ED9]" /> : <Hash className="h-4 w-4 text-[#5865F2]" />}
              <span className="font-semibold">{c.name}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${c.enabled ? "bg-bull/20 text-bull" : "bg-secondary text-muted-foreground"}`}>
                {c.enabled ? "Active" : "Disabled"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              min conf {c.min_confidence}% · {c.filter_assets?.join(",") || "all coins"} · {c.filter_sides?.join("/") || "LONG/SHORT/NEUTRAL"}
            </div>
            <div className="ml-auto flex gap-1">
              <button
                onClick={() => testMut.mutate(c.id)}
                disabled={testMut.isPending}
                className="rounded-md border border-border p-1.5 text-xs hover:border-border-bright"
                title="Send test message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  setForm({
                    id: c.id,
                    name: c.name,
                    channel_type: c.channel_type,
                    bot_token: c.bot_token ?? "",
                    chat_id: c.chat_id ?? "",
                    webhook_url: c.webhook_url ?? "",
                    enabled: c.enabled,
                    min_confidence: c.min_confidence,
                    filter_assets: c.filter_assets?.join(",") ?? "",
                    filter_sides: c.filter_sides ?? [],
                  });
                  setMsg(null);
                }}
                className="rounded-md border border-border p-1.5 text-xs hover:border-border-bright"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { if (confirm(`Delete ${c.name}?`)) delMut.mutate(c.id); }}
                className="rounded-md border border-border p-1.5 text-xs hover:border-bear/40 hover:text-bear"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card/30 p-4 text-xs text-muted-foreground space-y-2">
        <div className="font-semibold text-foreground">📖 Setup help</div>
        <div><strong>Telegram:</strong> 1) Chat <code>@BotFather</code> → <code>/newbot</code> → copy bot token. 2) Add bot to your group. 3) Send a message in the group, then visit <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> → copy <code>chat.id</code> (negative number like <code>-100123…</code>).</div>
        <div><strong>Discord:</strong> Group settings → Integrations → Webhooks → New Webhook → copy URL.</div>
      </div>
    </div>
  );
}

function ChannelForm({
  state, onChange, onCancel, onSave, saving,
}: {
  state: FormState;
  onChange: (s: FormState) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => onChange({ ...state, [k]: v });

  return (
    <div className="rounded-lg border border-[var(--neon-purple)]/40 bg-card/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{state.id ? "Edit channel" : "New channel"}</h3>
        <button onClick={onCancel} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs space-y-1">
          <div className="font-semibold uppercase text-muted-foreground">Name</div>
          <input value={state.name} onChange={(e) => set("name", e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" placeholder="My Trading Group" />
        </label>

        <label className="text-xs space-y-1">
          <div className="font-semibold uppercase text-muted-foreground">Type</div>
          <select value={state.channel_type} onChange={(e) => set("channel_type", e.target.value as "telegram" | "discord")}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            <option value="telegram">Telegram</option>
            <option value="discord">Discord</option>
          </select>
        </label>

        {state.channel_type === "telegram" ? (
          <>
            <label className="text-xs space-y-1 sm:col-span-2">
              <div className="font-semibold uppercase text-muted-foreground">Bot Token</div>
              <input type="password" value={state.bot_token} onChange={(e) => set("bot_token", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
                placeholder="123456789:ABC-DEF..." />
            </label>
            <label className="text-xs space-y-1 sm:col-span-2">
              <div className="font-semibold uppercase text-muted-foreground">Chat ID</div>
              <input value={state.chat_id} onChange={(e) => set("chat_id", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
                placeholder="-1001234567890" />
            </label>
          </>
        ) : (
          <label className="text-xs space-y-1 sm:col-span-2">
            <div className="font-semibold uppercase text-muted-foreground">Webhook URL</div>
            <input type="password" value={state.webhook_url} onChange={(e) => set("webhook_url", e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
              placeholder="https://discord.com/api/webhooks/..." />
          </label>
        )}

        <label className="text-xs space-y-1">
          <div className="font-semibold uppercase text-muted-foreground">Min confidence (%)</div>
          <input type="number" min={0} max={100} value={state.min_confidence}
            onChange={(e) => set("min_confidence", Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
        </label>

        <label className="text-xs space-y-1">
          <div className="font-semibold uppercase text-muted-foreground">Coins (comma-sep, blank = all)</div>
          <input value={state.filter_assets} onChange={(e) => set("filter_assets", e.target.value)}
            placeholder="BTC,ETH,SOL"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono" />
        </label>

        <div className="text-xs space-y-1 sm:col-span-2">
          <div className="font-semibold uppercase text-muted-foreground">Sides (blank = all)</div>
          <div className="flex gap-3">
            {(["LONG", "SHORT", "NEUTRAL"] as const).map((s) => (
              <label key={s} className="flex items-center gap-1.5">
                <input type="checkbox" checked={state.filter_sides.includes(s)}
                  onChange={(e) => set("filter_sides",
                    e.target.checked ? [...state.filter_sides, s] : state.filter_sides.filter((x) => x !== s))} />
                <span className="text-sm">{s}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="text-xs flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" checked={state.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          <span>Enabled (receive broadcasts)</span>
        </label>
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={onSave} disabled={saving || !state.name}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90">
          {saving ? "Saving…" : "Save channel"}
        </button>
        <button onClick={onCancel} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}
