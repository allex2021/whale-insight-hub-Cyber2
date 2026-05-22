import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchMarketGlobals } from "@/lib/whale/market.functions";
import { useBinancePriceStream } from "@/hooks/useBinanceWhaleStream";
import { fmtPct, fmtUSD } from "@/lib/whale/format";

function fgColor(v: number) {
  if (v >= 75) return "text-bull";
  if (v >= 55) return "text-[var(--neon-yellow)]";
  if (v >= 45) return "text-muted-foreground";
  if (v >= 25) return "text-[var(--neon-orange)]";
  return "text-bear";
}

export function HeaderBar() {
  const prices = useBinancePriceStream();
  const fetchG = useServerFn(fetchMarketGlobals);
  const { data: globals } = useQuery({
    queryKey: ["market-globals"],
    queryFn: () => fetchG(),
    refetchInterval: 60_000,
  });
  const [updated, setUpdated] = useState<string>("--:--:--");

  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    setUpdated(new Date().toLocaleTimeString());
  }, [prices]);

  const symbols: Array<"BTC" | "ETH" | "SOL"> = ["BTC", "ETH", "SOL"];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-3 py-3 lg:gap-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] glow-neon">
            <span className="text-xl">🐋</span>
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold tracking-tight leading-none">Whale Intelligence Pro</h1>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
              Powered by Allex@Cyber2
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2 lg:gap-4 font-mono text-xs sm:text-sm">
          {symbols.map((sym) => {
            const p = prices[sym];
            return (
              <div key={sym} className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1.5">
                <span className="text-[10px] sm:text-xs text-muted-foreground">{sym}</span>
                <span className="font-semibold">
                  {p ? `$${p.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
                </span>
                {p && (
                  <span className={p.change24h >= 0 ? "text-bull text-[10px] sm:text-xs" : "text-bear text-[10px] sm:text-xs"}>
                    {fmtPct(p.change24h)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 font-mono text-xs flex-wrap">
          {globals && (
            <>
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] uppercase text-muted-foreground">Fear & Greed</span>
                <span className={`font-bold text-sm ${fgColor(globals.fearGreed.value)}`}>
                  {globals.fearGreed.value} · {globals.fearGreed.label}
                </span>
              </div>
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[10px] uppercase text-muted-foreground">Mkt Cap</span>
                <span className="font-semibold">{fmtUSD(globals.marketCap)}</span>
              </div>
              <div className="hidden lg:flex flex-col items-end">
                <span className="text-[10px] uppercase text-muted-foreground">BTC.D</span>
                <span className="font-semibold">{globals.btcDominance.toFixed(1)}%</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-2 rounded-md border border-bull/40 bg-bull/10 px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-bull pulse-dot" />
            <span className="text-bull text-[10px] font-bold uppercase">Live</span>
            <Activity className="h-3 w-3 text-bull" />
            <span className="text-muted-foreground hidden sm:inline">{updated}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
