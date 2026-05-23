import { useEffect, useState } from "react";
import { Plus, Trash2, Bell, BellOff } from "lucide-react";
import { Panel } from "./Panel";
import { useCustomAlerts, type CustomAlert, type CustomAlertOp, type CustomAlertMetric } from "@/hooks/useCustomAlerts";
import { useBinanceWhaleStream, useBinancePriceStream } from "@/hooks/useBinanceWhaleStream";
import { useWhaleAlertSound } from "@/hooks/useWhaleAlertSound";
import { cn } from "@/lib/utils";

const ASSETS = ["BTC", "ETH", "SOL", "LTC", "BNB", "XRP", "ADA", "DOGE", "AVAX"];

function timeAgo(ts: number) {
  const d = Math.max(0, Date.now() - ts);
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

export function CustomAlertBuilder() {
  const { alerts, add, remove, toggle, markTriggered } = useCustomAlerts();
  const [asset, setAsset] = useState("BTC");
  const [metric, setMetric] = useState<CustomAlertMetric>("price");
  const [op, setOp] = useState<CustomAlertOp>(">");
  const [value, setValue] = useState("");

  const prices = useBinancePriceStream();
  const { trades } = useBinanceWhaleStream(25_000, 30);
  const { playPump, playDump } = useWhaleAlertSound();

  // Evaluate alerts on every price/trade tick
  useEffect(() => {
    for (const a of alerts) {
      if (!a.enabled) continue;
      // Cooldown 60s
      if (a.lastTriggeredAt && Date.now() - a.lastTriggeredAt < 60_000) continue;

      let triggered = false;
      if (a.metric === "price") {
        const px = prices[a.asset]?.price;
        if (typeof px !== "number") continue;
        triggered = a.op === ">" ? px > a.value : px < a.value;
      } else if (a.metric === "trade_size") {
        // last trade for this asset
        const t = trades.find((tr) => tr.asset === a.asset);
        if (!t) continue;
        triggered = a.op === ">" ? t.sizeUsd > a.value : t.sizeUsd < a.value;
      }

      if (triggered) {
        markTriggered(a.id);
        if (a.op === ">") playPump(); else playDump();
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`${a.asset} alert`, {
            body: `${a.metric === "price" ? "Price" : "Trade size"} ${a.op} ${a.value.toLocaleString()}`,
          });
        }
      }
    }
  }, [alerts, prices, trades, markTriggered, playPump, playDump]);

  const handleAdd = () => {
    const v = parseFloat(value);
    if (!isFinite(v) || v <= 0) return;
    add({ asset, metric, op, value: v, enabled: true });
    setValue("");
  };

  const requestNotif = () => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  return (
    <Panel
      title="Custom Alert Builder"
      subtitle="User-defined price + whale-trade alerts · sound + browser notification on trigger"
      accent="orange"
      action={
        <button
          onClick={requestNotif}
          className="rounded border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          Enable Notifications
        </button>
      }
    >
      {/* Builder */}
      <div className="mb-4 grid grid-cols-2 gap-2 rounded border border-border/60 bg-card/30 p-3 sm:grid-cols-5">
        <select
          value={asset}
          onChange={(e) => setAsset(e.target.value)}
          className="rounded border border-border bg-card px-2 py-1.5 text-xs font-mono"
        >
          {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as CustomAlertMetric)}
          className="rounded border border-border bg-card px-2 py-1.5 text-xs font-mono"
        >
          <option value="price">Price ($)</option>
          <option value="trade_size">Trade Size ($)</option>
        </select>
        <select
          value={op}
          onChange={(e) => setOp(e.target.value as CustomAlertOp)}
          className="rounded border border-border bg-card px-2 py-1.5 text-xs font-mono"
        >
          <option value=">">{">"} (greater)</option>
          <option value="<">{"<"} (less)</option>
        </select>
        <input
          type="number"
          inputMode="decimal"
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="rounded border border-border bg-card px-2 py-1.5 text-xs font-mono"
        />
        <button
          onClick={handleAdd}
          className="flex items-center justify-center gap-1 rounded border border-[var(--neon-yellow)]/40 bg-[var(--neon-yellow)]/15 px-2 py-1.5 text-xs font-bold text-[var(--neon-yellow)] hover:bg-[var(--neon-yellow)]/25"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {/* List */}
      {alerts.length === 0 ? (
        <div className="rounded border border-dashed border-border/60 bg-card/20 px-3 py-6 text-center text-xs text-muted-foreground">
          No custom alerts yet. Example: BTC price &gt; 95000, or ETH trade_size &gt; 500000.
        </div>
      ) : (
        <div className="space-y-1.5">
          {alerts.map((a) => <AlertRow key={a.id} a={a} onToggle={() => toggle(a.id)} onRemove={() => remove(a.id)} />)}
        </div>
      )}
    </Panel>
  );
}

function AlertRow({ a, onToggle, onRemove }: { a: CustomAlert; onToggle: () => void; onRemove: () => void }) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-2 rounded border px-3 py-2",
      a.enabled ? "border-border bg-card/40" : "border-border/40 bg-card/20 opacity-60",
    )}>
      <div className="flex items-center gap-3 text-xs">
        <button onClick={onToggle} className={cn(a.enabled ? "text-[var(--neon-yellow)]" : "text-muted-foreground")}>
          {a.enabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
        </button>
        <span className="font-mono font-bold text-foreground">{a.asset}</span>
        <span className="text-muted-foreground">{a.metric === "price" ? "Price" : "Trade size"}</span>
        <span className="font-mono text-[var(--neon-blue)]">{a.op}</span>
        <span className="font-mono font-bold text-foreground">${a.value.toLocaleString()}</span>
        {a.lastTriggeredAt && (
          <span className="text-[10px] text-[var(--neon-yellow)]">⚡ fired {timeAgo(a.lastTriggeredAt)}</span>
        )}
      </div>
      <button onClick={onRemove} className="text-muted-foreground transition-colors hover:text-bear">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
