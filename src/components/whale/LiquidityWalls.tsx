import { useEffect, useState, useMemo } from "react";
import { Panel, Chip } from "./Panel";
import { fmtUSD } from "@/lib/whale/format";
import { AlertTriangle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface Cluster {
  price: number;
  size: number;
  side: "SHORT_LIQ" | "LONG_LIQ" | "BID_WALL" | "ASK_WALL";
}

function genClusters(spot: number): Cluster[] {
  const out: Cluster[] = [];
  for (let i = 1; i <= 6; i++) {
    out.push({
      price: spot * (1 + i * 0.018 + Math.random() * 0.01),
      size: Math.floor(0.5e9 + Math.random() * 11e9),
      side: Math.random() > 0.3 ? "SHORT_LIQ" : "ASK_WALL",
    });
  }
  for (let i = 1; i <= 6; i++) {
    out.push({
      price: spot * (1 - i * 0.018 - Math.random() * 0.01),
      size: Math.floor(0.5e9 + Math.random() * 9e9),
      side: Math.random() > 0.3 ? "LONG_LIQ" : "BID_WALL",
    });
  }
  return out;
}

export function LiquidityWalls() {
  const [spot] = useState(108_500);
  const [clusters, setClusters] = useState<Cluster[]>(() => genClusters(108_500));
  const [funding, setFunding] = useState(0.0124);
  const [cvd, setCvd] = useState(-184_000_000);

  useEffect(() => {
    const id = setInterval(() => {
      setClusters(genClusters(spot));
      setFunding(0.005 + Math.random() * 0.03);
      setCvd(-300_000_000 + Math.random() * 600_000_000);
    }, 5000);
    return () => clearInterval(id);
  }, [spot]);

  const overhead = useMemo(
    () => clusters.filter(c => c.price > spot).sort((a, b) => b.size - a.size),
    [clusters, spot],
  );
  const below = useMemo(
    () => clusters.filter(c => c.price <= spot).sort((a, b) => b.size - a.size),
    [clusters, spot],
  );
  const topOverhead = overhead[0];
  const topBelow = below[0];
  const maxSize = Math.max(...clusters.map(c => c.size));

  const cvdDiverge = Math.abs(cvd) > 150_000_000;

  return (
    <Panel
      title="Liquidation Heatmap & Order Book Walls"
      subtitle="Coinglass-style overhead traps + bid support zones · BTC-PERP aggregate"
      accent="orange"
      action={
        <Chip tone="warn">
          <Activity size={9} className="animate-pulse" /> AUTO-SYNC
        </Chip>
      }
    >
      {/* Headline traps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {topOverhead && (
          <div className="rounded-lg border-2 border-bear/40 bg-bear/5 p-3 shadow-[0_0_20px_color-mix(in_oklab,var(--bear)_20%,transparent)]">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-bear mb-1">
              <AlertTriangle size={11} /> Overhead Short Liquidity Trap
            </div>
            <div className="text-2xl font-bold text-bear font-mono">{fmtUSD(topOverhead.size)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              clustered around <span className="text-foreground font-mono font-bold">${topOverhead.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span className="text-bear ml-1">(+{(((topOverhead.price - spot) / spot) * 100).toFixed(2)}%)</span>
            </div>
          </div>
        )}
        {topBelow && (
          <div className="rounded-lg border-2 border-bull/40 bg-bull/5 p-3 shadow-[0_0_20px_color-mix(in_oklab,var(--bull)_20%,transparent)]">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-bull mb-1">
              <TrendingUp size={11} /> Bottom Bid Support Wall
            </div>
            <div className="text-2xl font-bold text-bull font-mono">{fmtUSD(topBelow.size)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              clustered around <span className="text-foreground font-mono font-bold">${topBelow.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span className="text-bull ml-1">({(((topBelow.price - spot) / spot) * 100).toFixed(2)}%)</span>
            </div>
          </div>
        )}
      </div>

      {/* Heat ladder */}
      <div className="rounded-lg border border-border bg-background/30 p-2 mb-4">
        <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2 px-1">Price Ladder · Liquidity Heat</div>
        <div className="space-y-0.5">
          {[...overhead, { price: spot, size: 0, side: "SHORT_LIQ" as const, isSpot: true }, ...below].map((c, i) => {
            const isSpot = "isSpot" in c;
            if (isSpot) {
              return (
                <div key="spot" className="flex items-center gap-2 py-1 border-y border-[var(--neon-blue)]/40 bg-[var(--neon-blue)]/5">
                  <div className="w-20 text-right font-mono font-bold text-[var(--neon-blue)] text-[11px]">${spot.toLocaleString()}</div>
                  <div className="flex-1 text-[10px] font-mono text-[var(--neon-blue)] uppercase tracking-wider">▸ Spot Price</div>
                </div>
              );
            }
            const pct = (c.size / maxSize) * 100;
            const isShort = c.side === "SHORT_LIQ" || c.side === "ASK_WALL";
            return (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <div className="w-20 text-right font-mono text-[10px] text-muted-foreground">${c.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div className="flex-1 h-3 relative bg-secondary/30 rounded-sm overflow-hidden">
                  <div className={cn(
                    "h-full rounded-sm",
                    isShort ? "bg-gradient-to-r from-bear/70 to-bear/40" : "bg-gradient-to-r from-bull/70 to-bull/40",
                  )} style={{ width: `${pct}%` }} />
                </div>
                <div className="w-16 text-right font-mono text-[10px] font-bold text-foreground">{fmtUSD(c.size)}</div>
                <div className="w-14 text-right">
                  <span className={cn(
                    "text-[9px] font-mono uppercase font-bold",
                    isShort ? "text-bear" : "text-bull",
                  )}>{c.side.replace("_", " ")}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Funding + CVD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-md border border-border p-3 bg-secondary/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase text-muted-foreground">Aggregate Funding</span>
            <Chip tone={funding > 0.02 ? "warn" : "blue"}>{funding > 0.02 ? "HOT" : "STABLE"}</Chip>
          </div>
          <div className={cn("text-xl font-bold font-mono", funding > 0.02 ? "text-[var(--neon-orange)]" : "text-foreground")}>
            {(funding * 100).toFixed(4)}%
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">8h avg · Binance + Bybit + OKX</div>
        </div>
        <div className={cn(
          "rounded-md border p-3",
          cvdDiverge ? "border-[var(--neon-orange)]/50 bg-[var(--neon-orange)]/5" : "border-border bg-secondary/20",
        )}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase text-muted-foreground">CVD Divergence</span>
            {cvdDiverge && <Chip tone="warn">⚠ DIVERGENCE</Chip>}
          </div>
          <div className={cn("text-xl font-bold font-mono flex items-center gap-1.5",
            cvd >= 0 ? "text-bull" : "text-bear")}>
            {cvd >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {cvd >= 0 ? "+" : "−"}{fmtUSD(Math.abs(cvd))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {cvdDiverge ? "Price/flow disagreement — fade rally risk" : "Flow aligned with price action"}
          </div>
        </div>
      </div>
    </Panel>
  );
}
