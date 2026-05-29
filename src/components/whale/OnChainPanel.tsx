import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, TrendingDown, TrendingUp, Layers, Cpu, Clock, Pickaxe } from "lucide-react";
import { Panel } from "./Panel";
import { SkeletonLoader } from "./SkeletonLoader";
import { ErrorState } from "./StateView";
import { cn } from "@/lib/utils";
import { fetchBtcNetwork, fetchBtcFeesPools } from "@/lib/whale/onchain.functions";

type Chain = { name: string; tvl: number; tokenSymbol: string | null };
type DexProtocol = { name: string; total24h: number; change_1d: number; chains: string[] };

type OnChainData = {
  totalTvl: number;
  topChains: Chain[];
  totalDex24h: number;
  dexChange24h: number;
  topDex: DexProtocol[];
};

async function fetchOnChain(): Promise<OnChainData> {
  const [chainsRes, dexRes] = await Promise.all([
    fetch("https://api.llama.fi/v2/chains"),
    fetch("https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true"),
  ]);
  if (!chainsRes.ok) throw new Error(`defillama chains ${chainsRes.status}`);
  if (!dexRes.ok) throw new Error(`defillama dex ${dexRes.status}`);
  const chains = (await chainsRes.json()) as Chain[];
  const dex = await dexRes.json();
  const totalTvl = chains.reduce((s, c) => s + (c.tvl ?? 0), 0);
  const topChains = [...chains].sort((a, b) => b.tvl - a.tvl).slice(0, 6);
  const protocols: DexProtocol[] = (dex.protocols ?? [])
    .filter((p: DexProtocol) => typeof p.total24h === "number")
    .sort((a: DexProtocol, b: DexProtocol) => b.total24h - a.total24h)
    .slice(0, 5);
  return {
    totalTvl,
    topChains,
    totalDex24h: dex.total24h ?? 0,
    dexChange24h: dex.change_1d ?? 0,
    topDex: protocols,
  };
}

function fmtUsd(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

export function OnChainPanel() {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["defillama-onchain"],
    queryFn: fetchOnChain,
    refetchInterval: 120_000,
    staleTime: 90_000,
  });

  const btcFn = useServerFn(fetchBtcNetwork);
  const { data: btc } = useQuery({
    queryKey: ["btc-network"],
    queryFn: () => btcFn(),
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  const fpFn = useServerFn(fetchBtcFeesPools);
  const { data: fp } = useQuery({
    queryKey: ["btc-fees-pools"],
    queryFn: () => fpFn(),
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  return (
    <Panel
      title="On-Chain Layer"
      subtitle="BTC network + fees + pools · DeFi TVL · DEX (DefiLlama + blockchain.com + mempool.space)"
      accent="purple"
    >
      {isLoading && !data && <SkeletonLoader variant="default" rows={6} />}
      {error && !data && <ErrorState error={String(error)} onRetry={() => refetch()} />}
      {data && (
        <div className="space-y-4">
          {/* BTC Network (Blockchain.com) */}
          {btc && (
            <div className="rounded border border-border/60 bg-card/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Cpu className="h-3 w-3" /> BTC Network
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  via blockchain.com
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <div className="text-[9px] uppercase text-muted-foreground">Hashrate</div>
                  <div className="font-mono text-sm font-bold text-foreground">
                    {btc.hashRateEhs.toFixed(1)} EH/s
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-muted-foreground flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" /> Block Time
                  </div>
                  <div className="font-mono text-sm font-bold text-foreground">
                    {btc.minutesBetweenBlocks.toFixed(1)}m
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-muted-foreground">Mempool</div>
                  <div className="font-mono text-sm font-bold text-foreground">
                    {btc.unconfirmedTx.toLocaleString()}
                    <span className="ml-1 text-[9px] text-muted-foreground">tx</span>
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-muted-foreground flex items-center gap-1">
                    <Pickaxe className="h-2.5 w-2.5" /> Miner Rev 24h
                  </div>
                  <div className="font-mono text-sm font-bold text-foreground">
                    {fmtUsd(btc.minersRevenueUsd)}
                  </div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border/40 pt-2 text-[10px]">
                <div className="text-muted-foreground">
                  Blocks 24h: <span className="font-mono text-foreground">{btc.blocksMined24h}</span>
                </div>
                <div className="text-muted-foreground">
                  Fees: <span className="font-mono text-foreground">{btc.totalFeesBtc.toFixed(2)} BTC</span>
                </div>
                <div className="text-muted-foreground">
                  TX/s: <span className="font-mono text-foreground">{btc.txRate.toFixed(1)}</span>
                </div>
              </div>
            </div>
          )}

          {/* BTC Fees + Mining Pools (mempool.space) */}
          {fp && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded border border-border/60 bg-card/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    BTC Fees (sat/vB)
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground">mempool.space</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded bg-bear/10 px-2 py-1.5 text-center">
                    <div className="text-[9px] uppercase text-bear">Fast</div>
                    <div className="font-mono text-sm font-bold text-foreground">{fp.fees.fastest}</div>
                  </div>
                  <div className="rounded bg-warn/10 px-2 py-1.5 text-center">
                    <div className="text-[9px] uppercase text-warn">30m</div>
                    <div className="font-mono text-sm font-bold text-foreground">{fp.fees.halfHour}</div>
                  </div>
                  <div className="rounded bg-bull/10 px-2 py-1.5 text-center">
                    <div className="text-[9px] uppercase text-bull">1h</div>
                    <div className="font-mono text-sm font-bold text-foreground">{fp.fees.hour}</div>
                  </div>
                </div>
                <div className="mt-1.5 flex justify-between text-[9px] text-muted-foreground">
                  <span>Econ: <span className="font-mono text-foreground">{fp.fees.economy}</span></span>
                  <span>Min: <span className="font-mono text-foreground">{fp.fees.minimum}</span></span>
                </div>
              </div>
              <div className="rounded border border-border/60 bg-card/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Top Mining Pools (24h)
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground">{fp.totalBlocks24h} blks</span>
                </div>
                <div className="space-y-1">
                  {fp.pools.slice(0, 5).map((p) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <span className="w-20 truncate font-mono text-[10px] font-semibold text-foreground">
                        {p.name}
                      </span>
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded bg-card">
                        <div
                          className="absolute inset-y-0 left-0 bg-[var(--neon-purple)]/60"
                          style={{ width: `${Math.min(p.share * 100, 100)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right font-mono text-[10px] text-muted-foreground">
                        {(p.share * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}



          {/* Top metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-border/60 bg-card/50 p-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Layers className="h-3 w-3" /> Total DeFi TVL
              </div>
              <div className="mt-1 font-mono text-xl font-bold text-foreground">{fmtUsd(data.totalTvl)}</div>
            </div>
            <div className="rounded border border-border/60 bg-card/50 p-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Activity className="h-3 w-3" /> 24h DEX Volume
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-xl font-bold text-foreground">{fmtUsd(data.totalDex24h)}</span>
                <span className={cn(
                  "inline-flex items-center gap-0.5 font-mono text-[11px] font-bold",
                  data.dexChange24h >= 0 ? "text-bull" : "text-bear",
                )}>
                  {data.dexChange24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {data.dexChange24h >= 0 ? "+" : ""}{data.dexChange24h.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Top chains by TVL */}
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Top Chains by TVL</div>
            <div className="space-y-1.5">
              {data.topChains.map((c) => {
                const pct = (c.tvl / data.totalTvl) * 100;
                return (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className="w-24 truncate font-mono text-[11px] font-semibold text-foreground">{c.name}</span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded bg-card">
                      <div
                        className="absolute inset-y-0 left-0 bg-[var(--neon-purple)]/60"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className="w-20 text-right font-mono text-[11px] text-muted-foreground">{fmtUsd(c.tvl)}</span>
                    <span className="w-12 text-right font-mono text-[10px] text-[var(--neon-purple)]">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top DEX */}
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Top DEX (24h Volume)</div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {data.topDex.map((d) => (
                <div key={d.name} className="flex items-center justify-between rounded border border-border/40 bg-card/30 px-2 py-1.5">
                  <div className="flex flex-col">
                    <span className="font-mono text-[11px] font-bold text-foreground">{d.name}</span>
                    <span className="text-[9px] text-muted-foreground">{d.chains?.slice(0, 3).join(" · ")}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[11px] text-foreground">{fmtUsd(d.total24h)}</div>
                    <div className={cn(
                      "font-mono text-[10px]",
                      (d.change_1d ?? 0) >= 0 ? "text-bull" : "text-bear",
                    )}>
                      {(d.change_1d ?? 0) >= 0 ? "+" : ""}{(d.change_1d ?? 0).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
