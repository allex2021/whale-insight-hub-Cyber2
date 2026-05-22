import { useEffect, useState } from "react";
import { Bell, Trash2, Settings as SettingsIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Panel } from "./Panel";
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

const iconFor = (t: string) => ({
  WHALE: "🐋", LIQ: "⚠️", CASCADE: "💥", FUNDING: "📊",
  NEWS: "📰", SMART: "🎯", CONVERGENCE: "⚡", OPTIONS: "📈",
} as Record<string, string>)[t.toUpperCase()] ?? "🔔";

export function AlertCenter() {
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

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

    const channel = supabase
      .channel("alerts-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" },
        (payload) => setAlerts((p) => p ? [payload.new as AlertRow, ...p].slice(0, 50) : [payload.new as AlertRow]))
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [tick]);

  const clearAll = async () => { setAlerts([]); };

  return (
    <Panel
      title="Alert Center"
      subtitle="Live feed · realtime from the alert engine"
      accent="orange"
      action={
        <div className="flex items-center gap-2">
          <Link to="/settings"
            className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] hover:border-border-bright">
            <SettingsIcon className="h-3 w-3" /> Configure
          </Link>
          <button onClick={clearAll}
            className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] hover:border-border-bright">
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        </div>
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
              <div className="mt-2">No alerts yet. The engine runs every minute — set your thresholds in <Link to="/settings" className="text-[var(--neon-blue)] underline">Settings</Link>.</div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
