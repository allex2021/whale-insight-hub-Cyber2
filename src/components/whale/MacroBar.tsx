import { useQuery } from "@tanstack/react-query";
import { Globe, TrendingDown, TrendingUp } from "lucide-react";
import { SkeletonLoader } from "./SkeletonLoader";
import { cn } from "@/lib/utils";

type Global = {
  totalMcap: number;
  totalMcapChange24h: number;
  btcDominance: number;
  ethDominance: number;
  total3: number; // alts ex BTC/ETH (approx)
};

async function fetchGlobals(): Promise<Global> {
  const r = await fetch("https://api.coingecko.com/api/v3/global");
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const j = await r.json();
  const d = j.data;
  const totalMcap = d.total_market_cap.usd as number;
  const btcDominance = d.market_cap_percentage.btc as number;
  const ethDominance = d.market_cap_percentage.eth as number;
  const total3 = totalMcap * (1 - (btcDominance + ethDominance) / 100);
  return {
    totalMcap,
    totalMcapChange24h: d.market_cap_change_percentage_24h_usd as number,
    btcDominance,
    ethDominance,
    total3,
  };
}

function fmt(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${n.toFixed(0)}`;
}

export function MacroBar() {
  const { data } = useQuery({
    queryKey: ["coingecko-global"],
    queryFn: fetchGlobals,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  if (!data) {
    return <SkeletonLoader variant="ticker" />;
  }

  const positive = data.totalMcapChange24h >= 0;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card/60 px-4 py-2.5 backdrop-blur-sm font-mono text-[11px]">
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-[var(--neon-purple)]" />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Macro</span>
      </div>
      <Stat label="Total Cap" value={fmt(data.totalMcap)} sub={
        <span className={cn("flex items-center gap-0.5 font-bold", positive ? "text-bull" : "text-bear")}>
          {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {positive ? "+" : ""}{data.totalMcapChange24h.toFixed(2)}%
        </span>
      } />
      <Stat label="BTC.D" value={`${data.btcDominance.toFixed(2)}%`} />
      <Stat label="ETH.D" value={`${data.ethDominance.toFixed(2)}%`} />
      <Stat label="Total3 (Alts)" value={fmt(data.total3)} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-bold text-foreground">{value}</span>
        {sub}
      </span>
    </div>
  );
}
