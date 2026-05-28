import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Trash2, Settings as SettingsIcon, Volume2, VolumeX, SlidersHorizontal } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Panel } from "./Panel";
import { timeAgo } from "@/lib/whale/format";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ErrorState, LoadingState } from "./StateView";
import { useBinanceWhaleStream } from "@/hooks/useBinanceWhaleStream";
import { useWhaleAlertSound } from "@/hooks/useWhaleAlertSound";
import { useAlertPrefs, ALERT_TYPES } from "@/hooks/useAlertPrefs";
import { Switch } from "@/components/ui/switch";

interface AlertRow {
  id: string;
  alert_type: string;
  severity: string;
  message: string;
  created_at: string;
  asset: string | null;
  side?: "LONG" | "SHORT";
}

const iconFor = (t: string) => ({
  WHALE: "🐋", LIQ: "⚠️", CASCADE: "💥", FUNDING: "📊",
  NEWS: "📰", SMART: "🎯", CONVERGENCE: "⚡", OPTIONS: "📈",
} as Record<string, string>)[t.toUpperCase()] ?? "🔔";

const fmtUsd = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;

const WHALE_THRESHOLD = 250_000;

export function AlertCenter() {
  const [dbAlerts, setDbAlerts] = useState<AlertRow[] | null>(null);
  const [liveAlerts, setLiveAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [showPrefs, setShowPrefs] = useState(false);
  const { prefs, toggle, isEnabled, setAll } = useAlertPrefs();

  const { trades } = useBinanceWhaleStream(WHALE_THRESHOLD, 50);
  const { playPump, playDump, muted, toggleMuted } = useWhaleAlertSound();
  const seenTradeIds = useRef<Set<string>>(new Set());

  // Fetch DB alerts + realtime subscription
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (!cancelled) { setDbAlerts([]); setLoading(false); }
        return;
      }
      const { data, error } = await supabase
        .from("alerts").select("*")
        .order("created_at", { ascending: false }).limit(50);
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setDbAlerts((data ?? []) as AlertRow[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("alerts-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" },
        (payload) => setDbAlerts((p) => p ? [payload.new as AlertRow, ...p].slice(0, 50) : [payload.new as AlertRow]))
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [tick]);

  // Bridge Binance stream → live whale alerts + beep on BUY/SELL
  useEffect(() => {
    if (trades.length === 0) return;
    if (!isEnabled("WHALE")) return;
    const fresh: AlertRow[] = [];
    let pumpOnce = false;
    let dumpOnce = false;
    for (const t of trades) {
      if (seenTradeIds.current.has(t.id)) continue;
      seenTradeIds.current.add(t.id);
      const side = t.side === "BUY" ? "LONG" : "SHORT";
      fresh.push({
        id: `live-${t.id}`,
        alert_type: "WHALE",
        severity: t.sizeUsd >= 2_000_000 ? "high" : t.sizeUsd >= 1_000_000 ? "medium" : "low",
        message: `${t.asset} ${side} · ${fmtUsd(t.sizeUsd)} @ $${t.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
        created_at: new Date(t.tradeTime).toISOString(),
        asset: t.asset,
        side,
      });
      if (side === "LONG") pumpOnce = true;
      else dumpOnce = true;
    }
    if (fresh.length === 0) return;
    if (seenTradeIds.current.size > 500) {
      seenTradeIds.current = new Set(Array.from(seenTradeIds.current).slice(-300));
    }
    setLiveAlerts((prev) => [...fresh, ...prev].slice(0, 50));
    if (pumpOnce) playPump();
    if (dumpOnce) setTimeout(() => playDump(), pumpOnce ? 220 : 0);
  }, [trades, playPump, playDump]);

  const merged = useMemo(() => {
    const all = [...liveAlerts, ...(dbAlerts ?? [])];
    return all
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 80);
  }, [liveAlerts, dbAlerts]);

  const clearAll = () => { setDbAlerts([]); setLiveAlerts([]); };

  return (
    <Panel
      title="Alert Center"
      subtitle={`Live feed · whale trades ≥ ${fmtUsd(WHALE_THRESHOLD)} + alert engine`}
      accent="orange"
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMuted}
            title={muted ? "Unmute beep" : "Mute beep"}
            className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] hover:border-border-bright"
          >
            {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3 text-[var(--neon-blue)]" />}
            {muted ? "Muted" : "Sound"}
          </button>
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
      {loading && !dbAlerts && liveAlerts.length === 0 && <LoadingState />}
      {error && <ErrorState error={error} onRetry={() => setTick((t) => t + 1)} />}
      {(dbAlerts || liveAlerts.length > 0) && (
        <div className="max-h-[420px] space-y-2 overflow-y-auto scrollbar-thin pr-1">
          {merged.map((a) => {
            const borderCls =
              a.side === "LONG" ? "border-bull/40"
              : a.side === "SHORT" ? "border-bear/40"
              : a.severity === "high" ? "border-bear/40"
              : a.severity === "medium" ? "border-[var(--neon-orange)]/40"
              : "border-border";
            return (
              <div key={a.id} className={cn("flex items-start gap-3 rounded-md border bg-secondary/40 p-2.5 text-xs", borderCls)}>
                <span className="text-xl leading-none">{iconFor(a.alert_type)}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {a.alert_type}{a.asset ? ` · ${a.asset}` : ""}
                      {a.side && (
                        <span className={cn("ml-2 font-mono text-[10px]", a.side === "LONG" ? "text-bull" : "text-bear")}>
                          {a.side}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(new Date(a.created_at).getTime())}</span>
                  </div>
                  <p className="text-muted-foreground mt-0.5">{a.message}</p>
                </div>
              </div>
            );
          })}
          {merged.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto h-6 w-6 opacity-50" />
              <div className="mt-2">Waiting for whale activity… Big trades ≥ {fmtUsd(WHALE_THRESHOLD)} will appear here live.</div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
