import { useQuery } from "@tanstack/react-query";
import { Scale, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Panel, Chip } from "./Panel";
import { cn } from "@/lib/utils";

type Asset = "BTC" | "ETH" | "SOL" | "LTC" | "BNB" | "XRP" | "ADA" | "DOGE" | "AVAX";
type Period = "5m" | "15m" | "1h" | "4h" | "1d";
const ASSETS: Asset[] = ["BTC", "ETH", "SOL", "LTC", "BNB", "XRP", "ADA", "DOGE", "AVAX"];

type Row = {
  asset: Asset;
  longPct: number;
  shortPct: number;
  ratio: number;
  ts: number;
};

async function fetchRatio(asset: Asset, period: Period): Promise<Row> {
  const url = `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${asset}USDT&period=${period}&limit=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  const arr = await r.json();
  const d = arr[0];
  return {
    asset,
    longPct: parseFloat(d.longAccount) * 100,
    shortPct: parseFloat(d.shortAccount) * 100,
    ratio: parseFloat(d.longShortRatio),
    ts: d.timestamp,
  };
}

export function LongShortRatio() {
  const [period, setPeriod] = useState<Period>("15m");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["long-short-ratio", period],
    queryFn: async () => {
      const rows = await Promise.all(
        ASSETS.map((a) => fetchRatio(a, period).catch(() => null)),
      );
      return rows.filter((r): r is Row => r !== null);
    },
    refetchInterval: 30_000,
  });

  return (
    <Panel
      title="Long / Short Ratio"
      subtitle="Global account ratio · Binance Futures · auto-refresh 30s"
      accent="orange"
      action={
        <div className="flex items-center gap-1">
          {(["5m", "15m", "1h", "4h", "1d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-md border px-2 py-1 text-[10px] font-bold uppercase",
                period === p
                  ? "border-[var(--neon-orange)] bg-[var(--neon-orange)]/10 text-[var(--neon-orange)]"
                  : "border-border bg-secondary text-muted-foreground hover:border-border-bright",
              )}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => refetch()}
            className="ml-1 rounded-md border border-border bg-secondary p-1 hover:border-border-bright"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          </button>
        </div>
      }
    >
      {isLoading && !data ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <RefreshCw className="mx-auto h-5 w-5 animate-spin" />
          <div className="mt-2">Loading ratios…</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data?.map((r) => {
            const bias = r.ratio >= 1.05 ? "bull" : r.ratio <= 0.95 ? "bear" : "default";
            const label = r.ratio >= 1.05 ? "LONG BIAS" : r.ratio <= 0.95 ? "SHORT BIAS" : "BALANCED";
            return (
              <div
                key={r.asset}
                className="rounded-lg border border-border bg-gradient-to-br from-card to-secondary/40 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="h-3.5 w-3.5 text-[var(--neon-orange)]" />
                    <span className="text-sm font-bold">{r.asset}</span>
                  </div>
                  <Chip tone={bias as "bull" | "bear" | "default"}>{label}</Chip>
                </div>

                <div className="mb-1.5 flex items-center justify-between font-mono text-[11px]">
                  <span className="text-bull font-semibold">L {r.longPct.toFixed(1)}%</span>
                  <span className="text-muted-foreground">{r.ratio.toFixed(3)}x</span>
                  <span className="text-bear font-semibold">S {r.shortPct.toFixed(1)}%</span>
                </div>

                <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-gradient-to-r from-bull to-bull/60"
                    style={{ width: `${r.longPct}%` }}
                  />
                  <div
                    className="h-full bg-gradient-to-r from-bear/60 to-bear"
                    style={{ width: `${r.shortPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
