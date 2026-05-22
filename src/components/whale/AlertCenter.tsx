import { useEffect, useState } from "react";
import { Bell, Send, Trash2 } from "lucide-react";
import { Panel, Chip } from "./Panel";
import { timeAgo } from "@/lib/whale/format";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ErrorState, LoadingState } from "./StateView";

interface AlertRow {
  id: string;
  alert_type: string;
  severity: string;
  message: string;
  created_at: string;
  asset: string | null;
}

const ALERT_TYPES = [
  { key: "whale", icon: "🐋", label: "Whale moves" },
  { key: "cascade", icon: "💥", label: "Cascade risk" },
  { key: "funding", icon: "📊", label: "Funding anomaly" },
  { key: "news", icon: "📰", label: "Major news" },
  { key: "smart", icon: "🎯", label: "Smart wallet" },
  { key: "converge", icon: "⚡", label: "Convergence" },
  { key: "options", icon: "📈", label: "Options block" },
  { key: "liq", icon: "⚠️", label: "Liq danger" },
];

const iconFor = (t: string) => ({
  WHALE: "🐋", LIQ: "⚠️", CASCADE: "💥", FUNDING: "📊",
  NEWS: "📰", SMART: "🎯", CONVERGENCE: "⚡", OPTIONS: "📈",
} as Record<string, string>)[t.toUpperCase()] ?? "🔔";

export function AlertCenter() {
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ALERT_TYPES.map((a) => [a.key, true]))
  );
  const [thresholds, setThresholds] = useState({ size: 1_000_000, cascade: 70, news: 8, smart: 90 });
  const [tg, setTg] = useState({ token: "", chat: "" });
  const [status, setStatus] = useState<"connected" | "disconnected" | "testing" | "error">("disconnected");
  const [tgError, setTgError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (!cancelled) { setAlerts([]); setLoading(false); }
        return;
      }
      const { data, error } = await supabase
        .from("alerts").select("*")
        .order("created_at", { ascending: false }).limit(50);
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setAlerts(data ?? []);
      setLoading(false);
    })();

    // realtime subscription for new alerts
    const channel = supabase
      .channel("alerts-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" },
        (payload) => setAlerts((p) => p ? [payload.new as AlertRow, ...p].slice(0, 50) : [payload.new as AlertRow]))
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [tick]);

  const clearAll = async () => {
    setAlerts([]);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel
        title="Alert Center"
        subtitle="Live feed from your account (realtime DB)"
        accent="orange"
        action={
          <button onClick={clearAll}
            className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] hover:border-border-bright">
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        }
      >
        {loading && !alerts && <LoadingState />}
        {error && <ErrorState error={error} onRetry={() => setTick((t) => t + 1)} />}
        {alerts && (
          <div className="max-h-[420px] space-y-2 overflow-y-auto scrollbar-thin pr-1">
            {alerts.map((a) => (
              <div key={a.id} className={cn(
                "flex items-start gap-3 rounded-md border bg-secondary/40 p-2.5 text-xs",
                a.severity === "high" ? "border-bear/40" : a.severity === "medium" ? "border-[var(--neon-orange)]/40" : "border-border",
              )}>
                <span className="text-xl leading-none">{iconFor(a.alert_type)}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{a.alert_type}{a.asset ? ` · ${a.asset}` : ""}</span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(new Date(a.created_at).getTime())}</span>
                  </div>
                  <p className="text-muted-foreground mt-0.5">{a.message}</p>
                </div>
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Bell className="mx-auto h-6 w-6 opacity-50" />
                <div className="mt-2">No alerts yet — sign in to receive your stream.</div>
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Telegram Config" subtitle="Route alerts to your bot" accent="blue">
        <div className="space-y-4 text-xs">
          <div>
            <div className="mb-2 text-[10px] uppercase text-muted-foreground">Alert types</div>
            <div className="grid grid-cols-2 gap-1.5">
              {ALERT_TYPES.map((t) => (
                <label key={t.key} className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5">
                  <input type="checkbox" checked={enabled[t.key]}
                    onChange={(e) => setEnabled((p) => ({ ...p, [t.key]: e.target.checked }))}
                    className="h-3.5 w-3.5 accent-[var(--neon-blue)]" />
                  <span>{t.icon} {t.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Min position $" value={thresholds.size} onChange={(v) => setThresholds((p) => ({ ...p, size: v }))} />
            <Field label="Min cascade %" value={thresholds.cascade} onChange={(v) => setThresholds((p) => ({ ...p, cascade: v }))} />
            <Field label="Min news score" value={thresholds.news} onChange={(v) => setThresholds((p) => ({ ...p, news: v }))} />
            <Field label="Min smart score" value={thresholds.smart} onChange={(v) => setThresholds((p) => ({ ...p, smart: v }))} />
          </div>

          <div className="space-y-2">
            <label className="block">
              <span className="text-[10px] uppercase text-muted-foreground">Bot token</span>
              <input value={tg.token} onChange={(e) => setTg((p) => ({ ...p, token: e.target.value }))}
                placeholder="123456:ABC..."
                className="mt-1 w-full rounded-md border border-border bg-secondary px-2 py-1.5 font-mono text-xs" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase text-muted-foreground">Chat ID</span>
              <input value={tg.chat} onChange={(e) => setTg((p) => ({ ...p, chat: e.target.value }))}
                placeholder="-1001234567890"
                className="mt-1 w-full rounded-md border border-border bg-secondary px-2 py-1.5 font-mono text-xs" />
            </label>
          </div>

          {tgError && <div className="rounded-md border border-bear/40 bg-bear/10 p-2 text-[11px] text-bear">{tgError}</div>}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <Chip tone={status === "connected" ? "bull" : status === "testing" ? "warn" : status === "error" ? "bear" : "default"}>
              <span className={cn("h-1.5 w-1.5 rounded-full",
                status === "connected" ? "bg-bull pulse-dot" :
                status === "testing" ? "bg-[var(--neon-yellow)]" :
                status === "error" ? "bg-bear" : "bg-muted-foreground")} />
              {status === "connected" ? "Connected" : status === "testing" ? "Testing..." : status === "error" ? "Failed" : "Disconnected"}
            </Chip>
            <button
              onClick={async () => {
                setTgError(null);
                if (!tg.token || !tg.chat) { setStatus("disconnected"); setTgError("Provide both token and chat ID."); return; }
                setStatus("testing");
                try {
                  const r = await fetch(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: tg.chat, text: "🐋 Whale Intelligence Pro — test alert ✅" }),
                  });
                  const j = await r.json();
                  if (!r.ok || !j.ok) throw new Error(j.description ?? `HTTP ${r.status}`);
                  setStatus("connected");
                } catch (e) {
                  setStatus("error");
                  setTgError(e instanceof Error ? e.message : String(e));
                }
              }}
              className="flex items-center gap-1.5 rounded-md border border-[var(--neon-blue)]/50 bg-[var(--neon-blue)]/15 px-3 py-1.5 font-semibold text-[var(--neon-blue)] hover:bg-[var(--neon-blue)]/25"
            >
              <Send className="h-3 w-3" /> Send test
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-border bg-secondary px-2 py-1.5 font-mono text-xs" />
    </label>
  );
}
