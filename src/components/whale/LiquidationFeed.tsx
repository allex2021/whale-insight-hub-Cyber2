import { useEffect, useRef, useMemo } from "react";
import { Panel, Chip } from "./Panel";
import { Zap } from "lucide-react";
import { useBinanceLiquidations } from "@/hooks/useBinanceLiquidations";
import { useWhaleAlertSound } from "@/hooks/useWhaleAlertSound";
import { useSymbolFilter } from "@/hooks/useSymbolFilter";
import { cn } from "@/lib/utils";

function fmtUsd(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function timeAgo(t: number) {
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export function LiquidationFeed() {
  const events = useBinanceLiquidations(25_000, 80);
  const { selected } = useSymbolFilter();
  const { playPump, playDump } = useWhaleAlertSound();
  const seenRef = useRef<Set<string>>(new Set());
  const firstRun = useRef(true);

  // Filter by symbol filter
  const filtered = useMemo(
    () => events.filter((e) => selected.includes(e.asset as never) || ["BTC", "ETH", "SOL"].includes(e.asset)),
    [events, selected],
  );

  // Aggregate last 60s by side
  const stats = useMemo(() => {
    const cutoff = Date.now() - 60_000;
    let longs = 0, shorts = 0;
    for (const e of events) {
      if (e.time < cutoff) continue;
      if (e.side === "SELL") longs += e.usd;
      else shorts += e.usd;
    }
    return { longs, shorts, total: longs + shorts };
  }, [events]);

  // Sound on ≥$1M liquidations
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      for (const e of events) seenRef.current.add(e.id);
      return;
    }
    for (const e of events) {
      if (seenRef.current.has(e.id)) continue;
      seenRef.current.add(e.id);
      if (e.usd >= 1_000_000) {
        // SELL = long liquidated = bearish event → playDump
        // BUY = short liquidated = bullish event → playPump
        if (e.side === "SELL") playDump("liquidation");
        else playPump("liquidation");
      }
    }
    // Keep set bounded
    if (seenRef.current.size > 500) {
      const arr = Array.from(seenRef.current);
      seenRef.current = new Set(arr.slice(-200));
    }
  }, [events, playPump, playDump]);

  return (
    <Panel
      title="Liquidation Feed"
      subtitle="Binance Futures live · ≥$25k · sound on ≥$1M"
      accent="orange"
      action={
        <div className="flex items-center gap-1.5 text-[10px]">
          <Chip tone="bear">LONGS {fmtUsd(stats.longs)}</Chip>
          <Chip tone="bull">SHORTS {fmtUsd(stats.shorts)}</Chip>
        </div>
      }
    >
      {filtered.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          <Zap className="mx-auto h-5 w-5 animate-pulse" />
          <div className="mt-2">Waiting for liquidations…</div>
        </div>
      ) : (
        <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
          {filtered.slice(0, 40).map((e) => {
            const longLiq = e.side === "SELL"; // long got liquidated
            const big = e.usd >= 500_000;
            return (
              <div key={e.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[11px]",
                  big
                    ? longLiq ? "border-bear/50 bg-bear/10" : "border-bull/50 bg-bull/10"
                    : "border-border bg-secondary/40",
                )}>
                <div className="flex items-center gap-2">
                  <Zap className={cn("h-3 w-3", longLiq ? "text-bear" : "text-bull")} />
                  <span className="font-bold">{e.asset}</span>
                  <span className={longLiq ? "text-bear" : "text-bull"}>
                    {longLiq ? "LONG LIQ" : "SHORT LIQ"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    ${e.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </span>
                  <span className="font-bold">{fmtUsd(e.usd)}</span>
                  <span className="w-7 text-right text-muted-foreground">{timeAgo(e.time)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
