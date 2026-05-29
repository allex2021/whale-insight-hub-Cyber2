import { useQuery } from "@tanstack/react-query";
import { Coins, TrendingDown, TrendingUp } from "lucide-react";
import { Panel, Chip } from "./Panel";
import { SkeletonLoader } from "./SkeletonLoader";
import { cn } from "@/lib/utils";

type Coin = { id: string; symbol: string; name: string; market_cap: number; market_cap_change_percentage_24h: number; image: string };

async function fetchStables(): Promise<Coin[]> {
  const r = await fetch(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=tether,usd-coin,dai,first-digital-usd,true-usd&order=market_cap_desc",
  );
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  return r.json();
}

function fmt(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}

export function StablecoinSupply() {
  const { data, isLoading } = useQuery({
    queryKey: ["stablecoin-supply"],
    queryFn: fetchStables,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const total = data?.reduce((sum, c) => sum + c.market_cap, 0) ?? 0;
  // Aggregate weighted 24h change
  const weighted = data && total > 0
    ? data.reduce((s, c) => s + c.market_cap_change_percentage_24h * (c.market_cap / total), 0)
    : 0;
  const positive = weighted >= 0;

  return (
    <Panel
      title="Stablecoin Supply"
      subtitle="Liquidity entering or leaving crypto · CoinGecko · 2m refresh"
      accent="green"
      action={
        <Chip tone={positive ? "bull" : "bear"}>
          {positive ? "INFLOW" : "OUTFLOW"}
        </Chip>
      }
    >
      {isLoading || !data ? (
        <SkeletonLoader variant="default" rows={5} />
      ) : (
        <>
          <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-border pb-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total Supply</div>
              <div className="font-mono text-xl font-bold">{fmt(total)}</div>
            </div>
            <div className={cn("flex items-center gap-1 font-mono text-sm font-bold", positive ? "text-bull" : "text-bear")}>
              {positive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {positive ? "+" : ""}{weighted.toFixed(3)}% 24h
            </div>
          </div>

          <div className="space-y-2">
            {data.map((c) => {
              const pct = (c.market_cap / total) * 100;
              const up = c.market_cap_change_percentage_24h >= 0;
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Coins className="h-3.5 w-3.5 text-[var(--bull)]" />
                    <span className="font-mono text-xs font-bold">{c.symbol.toUpperCase()}</span>
                    <span className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span>{fmt(c.market_cap)}</span>
                    <span className={cn("w-16 text-right font-bold", up ? "text-bull" : "text-bear")}>
                      {up ? "+" : ""}{c.market_cap_change_percentage_24h.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}
