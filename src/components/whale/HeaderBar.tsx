import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { fetchGlobals, fetchPrices } from "@/lib/whale/services";
import type { MarketGlobals, PriceTick } from "@/lib/whale/types";
import { fmtPct, fmtUSD } from "@/lib/whale/format";

function fgColor(v: number) {
  if (v >= 75) return "text-bull";
  if (v >= 55) return "text-[var(--neon-yellow)]";
  if (v >= 45) return "text-muted-foreground";
  if (v >= 25) return "text-[var(--neon-orange)]";
  return "text-bear";
}

export function HeaderBar() {
  const [prices, setPrices] = useState<PriceTick[]>([]);
  const [globals, setGlobals] = useState<MarketGlobals | null>(null);
  const [updated, setUpdated] = useState<string>("--:--:--");

  useEffect(() => {
    const ctl = new AbortController();
    let mounted = true;
    const load = async () => {
      const [p, g] = await Promise.all([fetchPrices(ctl.signal), fetchGlobals(ctl.signal)]);
      if (!mounted) return;
      setPrices(p); setGlobals(g); setUpdated(new Date().toLocaleTimeString());
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { mounted = false; ctl.abort(); clearInterval(id); };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-6 px-4 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] glow-neon">
            <span className="text-xl">🐋</span>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight leading-none">Whale Intelligence Pro</h1>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
              Powered by Allex@Cyber2
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-3 lg:gap-5 font-mono text-sm">
          {prices.map((p) => (
            <div key={p.symbol} className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-1.5">
              <span className="text-xs text-muted-foreground">{p.symbol}</span>
              <span className="font-semibold">${p.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
              <span className={p.change24h >= 0 ? "text-bull text-xs" : "text-bear text-xs"}>
                {fmtPct(p.change24h)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 font-mono text-xs">
          {globals && (
            <>
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase text-muted-foreground">Fear & Greed</span>
                <span className={`font-bold text-sm ${fgColor(globals.fearGreed.value)}`}>
                  {globals.fearGreed.value} · {globals.fearGreed.label}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase text-muted-foreground">Mkt Cap</span>
                <span className="font-semibold">{fmtUSD(globals.marketCap)}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase text-muted-foreground">BTC.D</span>
                <span className="font-semibold">{globals.btcDominance.toFixed(1)}%</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-2 rounded-md border border-bull/40 bg-bull/10 px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-bull pulse-dot" />
            <span className="text-bull text-[10px] font-bold uppercase">Live</span>
            <Activity className="h-3 w-3 text-bull" />
            <span className="text-muted-foreground">{updated}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
