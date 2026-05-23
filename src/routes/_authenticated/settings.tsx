import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Send, Volume2 } from "lucide-react";
import { getMySettings, saveMySettings, sendTelegramTest } from "@/lib/whale/settings.functions";
import { useSoundSettings, type SoundKey } from "@/hooks/useSoundSettings";
import { useWhaleAlertSound } from "@/hooks/useWhaleAlertSound";


export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings · Whale Intelligence Pro" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(getMySettings);
  const save = useServerFn(saveMySettings);
  const test = useServerFn(sendTelegramTest);

  const { data, isLoading } = useQuery({ queryKey: ["mySettings"], queryFn: () => get() });

  const [form, setForm] = useState({
    whale_min_usd: 1_000_000,
    watchlist: "BTC,ETH,SOL",
    telegram_bot_token: "",
    telegram_chat_id: "",
    enable_alerts: true,
  });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setForm({
        whale_min_usd: Number(data.whale_min_usd),
        watchlist: (data.watchlist as string[]).join(","),
        telegram_bot_token: data.telegram_bot_token ?? "",
        telegram_chat_id: data.telegram_chat_id ?? "",
        enable_alerts: data.enable_alerts,
      });
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const watchlist = form.watchlist.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      return save({ data: {
        whale_min_usd: Number(form.whale_min_usd),
        watchlist,
        telegram_bot_token: form.telegram_bot_token || null,
        telegram_chat_id: form.telegram_chat_id || null,
        enable_alerts: form.enable_alerts,
      }});
    },
    onSuccess: () => { setMsg({ kind: "ok", text: "Settings saved." }); qc.invalidateQueries({ queryKey: ["mySettings"] }); },
    onError: (e) => setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) }),
  });

  const testMut = useMutation({
    mutationFn: () => test(),
    onSuccess: () => setMsg({ kind: "ok", text: "Telegram test sent ✅" }),
    onError: (e) => setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button onClick={() => navigate({ to: "/" })} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </button>
          <h1 className="ml-auto text-sm font-bold">⚙️ Settings</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <section className="rounded-xl border border-border bg-card/60 p-5 space-y-4">
              <h2 className="text-sm font-bold">🐋 Whale alert thresholds</h2>
              <Field label="Minimum whale size (USD)" type="number"
                value={form.whale_min_usd}
                onChange={(v) => setForm((p) => ({ ...p, whale_min_usd: Number(v) }))} />
              <Field label="Watchlist (comma separated tickers)"
                value={form.watchlist}
                onChange={(v) => setForm((p) => ({ ...p, watchlist: String(v) }))} />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.enable_alerts}
                  onChange={(e) => setForm((p) => ({ ...p, enable_alerts: e.target.checked }))}
                  className="h-4 w-4 accent-[var(--neon-blue)]" />
                Enable alert engine
              </label>
            </section>

            <SoundSettingsSection />


            <section className="rounded-xl border border-border bg-card/60 p-5 space-y-4">
              <h2 className="text-sm font-bold">📨 Telegram delivery</h2>
              <p className="text-[11px] text-muted-foreground">
                Create a bot via <span className="font-mono">@BotFather</span>, then paste the token and your chat ID.
                Alerts that match your thresholds will be pushed automatically.
              </p>
              <Field label="Bot token" value={form.telegram_bot_token}
                placeholder="123456:ABCDEF..."
                onChange={(v) => setForm((p) => ({ ...p, telegram_bot_token: String(v) }))} />
              <Field label="Chat ID" value={form.telegram_chat_id}
                placeholder="-1001234567890"
                onChange={(v) => setForm((p) => ({ ...p, telegram_chat_id: String(v) }))} />

              <button
                onClick={() => testMut.mutate()}
                disabled={testMut.isPending}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--neon-blue)]/50 bg-[var(--neon-blue)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--neon-blue)] hover:bg-[var(--neon-blue)]/25 disabled:opacity-50">
                <Send className="h-3 w-3" /> Send test
              </button>
            </section>

            {msg && (
              <div className={`rounded-md border p-3 text-xs ${msg.kind === "ok" ? "border-bull/40 bg-bull/10 text-bull" : "border-bear/40 bg-bear/10 text-bear"}`}>
                {msg.text}
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <Save className="h-4 w-4" /> {saveMut.isPending ? "Saving…" : "Save settings"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string | number; onChange: (v: string | number) => void; type?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2 font-mono text-xs" />
    </label>
  );
}
