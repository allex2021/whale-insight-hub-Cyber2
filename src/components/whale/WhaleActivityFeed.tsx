import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Radio } from "lucide-react";
import { Panel } from "./Panel";
import { EmptyState } from "./StateView";
import { useBinanceWhaleStream, type WhaleTrade, type WhaleAsset } from "@/hooks/useBinanceWhaleStream";
import { useSymbolFilter } from "@/hooks/useSymbolFilter";
import { cn } from "@/lib/utils";

const SYMBOL_MAP: Record<string, WhaleAsset> = {
  BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL", LTCUSDT: "LTC",
  BNBUSDT: "BNB", XRPUSDT: "XRP", ADAUSDT: "ADA", DOGEUSDT: "DOGE", AVAXUSDT: "AVAX",
};

async function fetchRecentWhales(minUsd: number): Promise<WhaleTrade[]> {
  const symbols = Object.keys(SYMBOL_MAP);
  const results = await Promise.allSettled(
    symbols.map(async (sym) => {
      const r = await fetch(`https://api.binance.com/api/v3/aggTrades?symbol=${sym}&limit=500`);
      if (!r.ok) return [] as WhaleTrade[];
      const arr = (await r.json()) as Array<{ a: number; p: string; q: string; m: boolean; T: number }>;
      return arr
        .map((t): WhaleTrade => {
          const price = parseFloat(t.p);
          const quantity = parseFloat(t.q);
          return {
            id: `${sym}-${t.a}`,
            asset: SYMBOL_MAP[sym],
            side: t.m ? "SELL" : "BUY",
            price, quantity, sizeUsd: price * quantity,
            tradeTime: t.T,
            exchange: "binance",
          };
        })
        .filter((t) => t.sizeUsd >= minUsd);
    }),
  );
  return results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.tradeTime - a.tradeTime);
}


const TIERS = [
  { v: 100_000, label: "$100K+" },
  { v: 500_000, label: "$500K+" },
  { v: 1_000_000, label: "$1M+" },
  { v: 2_000_000, label: "$2M+" },
] as const;

function fmtUsd(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export function WhaleActivityFeed() {
  const [tier, setTier] = useState<number>(100_000);
  const { trades: liveTrades, connected } = useBinanceWhaleStream(tier, 80);
  const { selected } = useSymbolFilter();

  // Bootstrap with recent REST trades so the feed is never empty on mount.
  const { data: seedTrades } = useQuery({
    queryKey: ["whale-seed", tier],
    queryFn: () => fetchRecentWhales(tier),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const merged = useMemo<WhaleTrade[]>(() => {
    const map = new Map<string, WhaleTrade>();
    for (const t of liveTrades) map.set(t.id, t);
    for (const t of seedTrades ?? []) if (!map.has(t.id)) map.set(t.id, t);
    return Array.from(map.values()).sort((a, b) => b.tradeTime - a.tradeTime).slice(0, 120);
  }, [liveTrades, seedTrades]);

  const filtered = useMemo(
    () => merged.filter((t) => selected.includes(t.asset as never)),
    [merged, selected],
  );

  return (
    <Panel
      title="Live Whale Activity"
      subtitle={`${filtered.length} trades · persisted across refresh`}
      accent="purple"
      action={
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase">
            <Radio className={cn("h-3 w-3", connected ? "text-bull animate-pulse" : "text-bear")} />
            <span className={connected ? "text-bull" : "text-bear"}>{connected ? "Live" : "Off"}</span>
          </span>
          {TIERS.map((t) => (
            <button
              key={t.v}
              onClick={() => setTier(t.v)}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[10px] transition-colors",
                tier === t.v
                  ? "bg-[var(--neon-purple)]/20 text-[var(--neon-purple)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState label="Waiting for whale trades… they will appear here in seconds." />
      ) : (
        <div className="max-h-[420px] overflow-y-auto -mx-4">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card/95 backdrop-blur">
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Asset</th>
                <th className="px-3 py-2 text-left font-medium">Side</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Size USD</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-border/40 hover:bg-card-hover">
                  <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{ago(t.tradeTime)} ago</td>
                  <td className="px-3 py-2 font-mono font-bold">{t.asset}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] font-bold", t.side === "BUY" ? "text-bull" : "text-bear")}>
                      {t.side === "BUY" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {t.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                    ${t.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </td>
                  <td className={cn("px-3 py-2 text-right font-mono font-bold", t.side === "BUY" ? "text-bull" : "text-bear")}>
                    {fmtUsd(t.sizeUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
