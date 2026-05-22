import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Eye, Filter } from "lucide-react";
import { Panel } from "./Panel";
import { StateView } from "./StateView";
import { fetchHyperliquidWhales, type WhalePosition } from "@/lib/whale/hyperliquid.functions";
import { cn } from "@/lib/utils";

type SideFilter = "ALL" | "LONG" | "SHORT";

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85 ? "bg-bull/20 text-bull border-bull/40"
    : score >= 70 ? "bg-[var(--neon-yellow)]/20 text-[var(--neon-yellow)] border-[var(--neon-yellow)]/40"
    : score >= 50 ? "bg-[var(--neon-orange)]/20 text-[var(--neon-orange)] border-[var(--neon-orange)]/40"
    : "bg-bear/20 text-bear border-bear/40";
  return (
    <span className={cn("inline-block min-w-[28px] rounded border px-1.5 py-0.5 text-center font-mono text-[11px] font-bold", color)}>
      {score}
    </span>
  );
}

function fmtCompactUsd(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPrice(n: number) {
  return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toFixed(4);
}

export function WhaleTracker() {
  const fetchFn = useServerFn(fetchHyperliquidWhales);
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["hl-whales"],
    queryFn: () => fetchFn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const [sideFilter, setSideFilter] = useState<SideFilter>("ALL");

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((w) => sideFilter === "ALL" || w.side === sideFilter);
  }, [data, sideFilter]);

  return (
    <Panel
      title="Whale Tracker"
      subtitle={`${filtered.length} live Hyperliquid positions · top traders by 24h volume`}
      accent="blue"
      action={
        <div className="flex items-center gap-2">
          <Filter className="h-3 w-3 text-muted-foreground" />
          {(["ALL", "LONG", "SHORT"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setSideFilter(f)}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[10px] transition-colors",
                sideFilter === f
                  ? "bg-[var(--neon-blue)]/20 text-[var(--neon-blue)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      }
    >
      {isLoading && !data && <StateView state="loading" message="Fetching live whale positions from Hyperliquid…" />}
      {error && !data && <StateView state="error" message={String(error)} onRetry={() => refetch()} />}
      {data && filtered.length === 0 && <StateView state="empty" message="No positions match the current filter." />}

      {data && filtered.length > 0 && (
        <div className="overflow-x-auto -mx-4">
          <table className="w-full min-w-[1000px] text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Wallet</th>
                <th className="px-3 py-2 text-left font-medium">Coin</th>
                <th className="px-3 py-2 text-left font-medium">Side</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 text-right font-medium">Lev</th>
                <th className="px-3 py-2 text-right font-medium">Entry</th>
                <th className="px-3 py-2 text-right font-medium">Current</th>
                <th className="px-3 py-2 text-right font-medium">PnL</th>
                <th className="px-3 py-2 text-right font-medium">Liq Price</th>
                <th className="px-3 py-2 text-center font-medium">Score</th>
                <th className="px-3 py-2 text-center font-medium">AI</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => {
                const profitable = w.unrealizedPnl >= 0;
                const liqClose = w.liqDistancePct !== null && w.liqDistancePct < 5;
                return (
                  <tr key={w.address} className="border-b border-border/40 transition-colors hover:bg-card-hover">
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col">
                        <a
                          href={`https://hyperdash.com/trader/${w.address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-foreground hover:text-[var(--neon-blue)]"
                        >
                          {w.alias}
                        </a>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {w.address.slice(0, 6)}…{w.address.slice(-4)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold">{w.coin}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] font-bold", w.side === "LONG" ? "text-bull" : "text-bear")}>
                        {w.side === "LONG" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {w.side}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCompactUsd(w.sizeUsd)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-[var(--neon-yellow)]">{w.leverage}x</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">${fmtPrice(w.entry)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">${fmtPrice(w.current)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      <span className={cn("font-bold", profitable ? "text-bull" : "text-bear")}>
                        {profitable ? "+" : ""}{fmtCompactUsd(Math.abs(w.unrealizedPnl)).replace("$", profitable ? "$" : "-$")}
                      </span>
                      <span className="ml-1 text-[10px] opacity-60">({profitable ? "+" : ""}{w.pnlPct.toFixed(1)}%)</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {w.liqPrice ? (
                        <span className={cn("inline-flex items-center justify-end gap-1", liqClose ? "text-bear animate-pulse" : "text-muted-foreground")}>
                          {liqClose && <AlertTriangle className="h-3 w-3" />}
                          ${fmtPrice(w.liqPrice)}
                          {w.liqDistancePct !== null && <span className="text-[10px] opacity-60">({w.liqDistancePct.toFixed(1)}%)</span>}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center"><ScoreBadge score={w.smartScore} /></td>
                    <td className="px-3 py-2.5 text-center">
                      <a
                        href={`https://hyperdash.com/trader/${w.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--neon-purple)] transition-colors hover:bg-[var(--neon-purple)]/20"
                      >
                        <Eye className="h-3 w-3" /> View
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export type { WhalePosition };
