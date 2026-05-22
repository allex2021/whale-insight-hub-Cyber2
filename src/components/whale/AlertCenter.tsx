import { useEffect, useState } from "react";
import { Bell, Send, Trash2 } from "lucide-react";
import { Panel, Chip } from "./Panel";
import { MOCK_GLOBAL_ALERTS } from "@/lib/whale/mock";
import { timeAgo } from "@/lib/whale/format";
import type { Alert } from "@/lib/whale/types";
import { cn } from "@/lib/utils";

const ALERT_TYPES = [
  { key: "whale", icon: "🐋", label: "Whale moves" },
  { key: "cascade", icon: "💥", label: "Cascade risk" },
  { key: "funding", icon: "📊", label: "Funding anomaly" },
  { key: "news", icon: "📰", label: "Major news" },
  { key: "smart", icon: "🎯", label: "Smart wallet" },
  { key: "converge", icon: "⚡", label: "Convergence" },
  { key: "options", icon: "📈", label: "Options block" },
  { key: "liq", icon: "⚠️", label: "Liq danger" },
  { key: "diverg", icon: "🔀", label: "Divergence" },
  { key: "unlock", icon: "🔓", label: "Token unlock" },
];

export function AlertCenter() {
  const [alerts, setAlerts] = useState<Alert[]>(MOCK_GLOBAL_ALERTS);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ALERT_TYPES.map((a) => [a.key, true]))
  );
  const [thresholds, setThresholds] = useState({ size: 1_000_000, cascade: 70, news: 8, smart: 90 });
  const [tg, setTg] = useState({ token: "", chat: "" });
  const [status, setStatus] = useState<"connected" | "disconnected" | "testing">("disconnected");

  useEffect(() => {
    // Periodically inject new mock alerts
    const id = setInterval(() => {
      const samples = [
        { type: "WHALE", icon: "🐋", title: "WHALE MOVE", description: "Hyperion opened SHORT ETH $2.1M @ 5x", severity: "medium" as const },
        { type: "LIQ", icon: "⚠️", title: "LIQ DANGER", description: "Cipher_Bot within 3% of liquidation", severity: "high" as const },
        { type: "CONVERGENCE", icon: "⚡", title: "CONVERGENCE", description: "ETH: 3/3 exchanges aligned LONG", severity: "medium" as const },
      ];
      const s = samples[Math.floor(Math.random() * samples.length)];
      setAlerts((prev) => [{ id: `a-${Date.now()}`, ...s, timestamp: Date.now() }, ...prev].slice(0, 30));
    }, 22_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel
        title="Alert Center"
        subtitle="Live feed of triggered signals"
        accent="orange"
        action={
          <button
            onClick={() => setAlerts([])}
            className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] hover:border-border-bright"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        }
      >
        <div className="max-h-[420px] space-y-2 overflow-y-auto scrollbar-thin pr-1">
          {alerts.map((a) => (
            <div key={a.id} className={cn(
              "flex items-start gap-3 rounded-md border bg-secondary/40 p-2.5 text-xs",
              a.severity === "high" ? "border-bear/40" : a.severity === "medium" ? "border-[var(--neon-orange)]/40" : "border-border",
            )}>
              <span className="text-xl leading-none">{a.icon}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{a.title}</span>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(a.timestamp)}</span>
                </div>
                <p className="text-muted-foreground mt-0.5">{a.description}</p>
              </div>
              <button onClick={() => setAlerts((p) => p.filter((x) => x.id !== a.id))}
                className="text-muted-foreground hover:text-foreground">×</button>
            </div>
          ))}
          {alerts.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto h-6 w-6 opacity-50" />
              <div className="mt-2">No active alerts</div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Telegram Config" subtitle="Route alerts to your bot" accent="blue">
        <div className="space-y-4 text-xs">
          <div>
            <div className="mb-2 text-[10px] uppercase text-muted-foreground">Alert types</div>
            <div className="grid grid-cols-2 gap-1.5">
              {ALERT_TYPES.map((t) => (
                <label key={t.key} className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={enabled[t.key]}
                    onChange={(e) => setEnabled((p) => ({ ...p, [t.key]: e.target.checked }))}
                    className="h-3.5 w-3.5 accent-[var(--neon-blue)]"
                  />
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
              <input
                value={tg.token}
                onChange={(e) => setTg((p) => ({ ...p, token: e.target.value }))}
                placeholder="123456:ABC..."
                className="mt-1 w-full rounded-md border border-border bg-secondary px-2 py-1.5 font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase text-muted-foreground">Chat ID</span>
              <input
                value={tg.chat}
                onChange={(e) => setTg((p) => ({ ...p, chat: e.target.value }))}
                placeholder="-1001234567890"
                className="mt-1 w-full rounded-md border border-border bg-secondary px-2 py-1.5 font-mono text-xs"
              />
            </label>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <Chip tone={status === "connected" ? "bull" : status === "testing" ? "warn" : "bear"}>
              <span className={cn("h-1.5 w-1.5 rounded-full", status === "connected" ? "bg-bull pulse-dot" : status === "testing" ? "bg-[var(--neon-yellow)]" : "bg-bear")} />
              {status === "connected" ? "Connected" : status === "testing" ? "Testing..." : "Disconnected"}
            </Chip>
            <button
              onClick={async () => {
                if (!tg.token || !tg.chat) { setStatus("disconnected"); return; }
                setStatus("testing");
                try {
                  await fetch(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: tg.chat, text: "🐋 Whale Intelligence Pro — test alert ✅" }),
                  });
                  setStatus("connected");
                } catch { setStatus("disconnected"); }
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
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-border bg-secondary px-2 py-1.5 font-mono text-xs"
      />
    </label>
  );
}
