import { useState } from "react";
import { useBinanceDepth } from "@/hooks/useBinanceDepth";
import { Panel, Chip } from "./Panel";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const SYMBOLS = ["BTC", "ETH", "SOL", "BNB"] as const;
type Sym = typeof SYMBOLS[number];

function fmtUsd(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function OrderBookWalls() {
  const [sym, setSym] = useState<Sym>("BTC");
  const snap = useBinanceDepth(`${sym.toLowerCase()}usdt`, 5);

  const maxBid = snap ? Math.max(...snap.bids.map((b) => b.usd)) : 0;
  const maxAsk = snap ? Math.max(...snap.asks.map((b) => b.usd)) : 0;
  const maxAll = Math.max(maxBid, maxAsk, 1);

  return (
    <Panel
      title="Order Book Walls"
      subtitle="Top 5 bid + ask walls · Binance · 100ms live"
      accent="purple"
      action={
        <div className="flex items-center gap-1">
          {SYMBOLS.map((s) => (
            <button key={s} onClick={() => setSym(s)}
              className={cn(
                "rounded-md border px-2 py-1 text-[10px] font-bold",
                sym === s
                  ? "border-[var(--neon-purple)] bg-[var(--neon-purple)]/15 text-[var(--neon-purple)]"
                  : "border-border bg-secondary text-muted-foreground hover:border-border-bright",
              )}>
              {s}
            </button>
          ))}
        </div>
      }
    >
      {!snap ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          <Layers className="mx-auto h-5 w-5 animate-pulse" />
          <div className="mt-2">Connecting to order book…</div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between border-b border-border pb-2 text-xs">
            <span className="text-muted-foreground">Mid price</span>
            <span className="font-mono font-bold">
              ${snap.midPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Side title="Bids (support)" tone="bull" levels={snap.bids} mid={snap.midPrice} maxUsd={maxAll} />
            <Side title="Asks (resistance)" tone="bear" levels={snap.asks} mid={snap.midPrice} maxUsd={maxAll} />
          </div>
        </>
      )}
    </Panel>
  );
}

function Side({ title, tone, levels, mid, maxUsd }: {
  title: string; tone: "bull" | "bear";
  levels: { price: number; qty: number; usd: number }[];
  mid: number; maxUsd: number;
}) {
  const isBull = tone === "bull";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
        <span className={isBull ? "text-bull" : "text-bear"}>{title}</span>
        <Chip tone={tone}>{levels.length}</Chip>
      </div>
      {levels.map((l, i) => {
        const distPct = ((l.price - mid) / mid) * 100;
        const close = Math.abs(distPct) < 0.3;
        const width = (l.usd / maxUsd) * 100;
        return (
          <div key={i} className="relative overflow-hidden rounded-md border border-border bg-secondary/40 px-2 py-1.5">
            <div
              className={cn("absolute inset-y-0 left-0 opacity-20", isBull ? "bg-bull" : "bg-bear")}
              style={{ width: `${width}%` }}
            />
            <div className="relative flex items-center justify-between font-mono text-[11px]">
              <span className={cn("font-bold", isBull ? "text-bull" : "text-bear")}>
                ${l.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>
              <span className={cn("text-[10px]", close ? "text-[var(--neon-yellow)] font-bold" : "text-muted-foreground")}>
                {distPct >= 0 ? "+" : ""}{distPct.toFixed(2)}%
              </span>
              <span className="font-bold">{fmtUsd(l.usd)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
