import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, RefreshCw, Shield, Sparkles, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Panel, Chip } from "./Panel";
import { SkeletonLoader } from "./SkeletonLoader";
import { timeAgo, fmtPrice } from "@/lib/whale/format";
import { generateAISignal, fetchLatestSignals } from "@/lib/whale/ai.functions";
import { useBinanceWhaleStream, useBinancePriceStream } from "@/hooks/useBinanceWhaleStream";
import { cn } from "@/lib/utils";

type Asset = "BTC" | "ETH" | "SOL" | "LTC";
type TF = "15m" | "1H" | "4H" | "1D";
type EvidenceItem = { label: string; value: string; bias: "BULL" | "BEAR" | "NEUTRAL" };

const TFS: TF[] = ["15m", "1H", "4H", "1D"];
const ASSETS: Asset[] = ["BTC", "ETH", "SOL", "LTC"];

export function AITradingSignals() {
  const qc = useQueryClient();
  const fetchSignals = useServerFn(fetchLatestSignals);
  const generate = useServerFn(generateAISignal);
  const { trades } = useBinanceWhaleStream(500_000, 100);
  const priceStream = useBinancePriceStream();
  const [timeframe, setTimeframe] = useState<TF>("4H");

  const { data, isLoading } = useQuery({
    queryKey: ["ai-signals"],
    queryFn: () => fetchSignals(),
    refetchInterval: 30_000,
  });

  const latestPrices = useMemo(() => {
    const out: Partial<Record<Asset, number>> = {};
    ASSETS.forEach((a) => { if (priceStream[a]?.price) out[a] = priceStream[a].price; });
    return out;
  }, [priceStream]);

  const summarize = useCallback((asset: Asset) => {
    const recent = trades.filter((t) => t.asset === asset).slice(0, 20);
    if (recent.length === 0) return "No recent large trades.";
    const buys = recent.filter((t) => t.side === "BUY").reduce((s, t) => s + t.sizeUsd, 0);
    const sells = recent.filter((t) => t.side === "SELL").reduce((s, t) => s + t.sizeUsd, 0);
    return `Buy vol $${(buys / 1e6).toFixed(2)}M · Sell vol $${(sells / 1e6).toFixed(2)}M across ${recent.length} large trades. Biggest: $${(Math.max(...recent.map((t) => t.sizeUsd)) / 1e6).toFixed(2)}M.`;
  }, [trades]);

  const mut = useMutation({
    mutationFn: async (asset: Asset) => {
      const price = latestPrices[asset];
      if (!price) throw new Error(`Waiting for ${asset} price from live stream…`);
      return generate({ data: { asset, price, recentTradesSummary: summarize(asset), timeframe } });
    },
    onSuccess: (row) => {
      toast.success(`AI signal generated · ${row.asset} ${row.timeframe}`);
      qc.invalidateQueries({ queryKey: ["ai-signals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-generate one signal per asset for current timeframe if missing OR stale (>2h)
  useEffect(() => {
    if (!data) return;
    const STALE_MS = 2 * 60 * 60_000;
    const now = Date.now();
    const freshByAsset = new Map<string, number>();
    for (const s of data.signals) {
      if (s.timeframe !== timeframe) continue;
      const age = now - new Date(s.created_at).getTime();
      const prev = freshByAsset.get(s.asset) ?? Infinity;
      if (age < prev) freshByAsset.set(s.asset, age);
    }
    const missing = ASSETS.filter((a) => {
      const age = freshByAsset.get(a);
      return latestPrices[a] && (age === undefined || age > STALE_MS);
    });
    if (missing.length > 0 && !mut.isPending) mut.mutate(missing[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, latestPrices, timeframe]);

  const signals = (data?.signals ?? []).filter((s) => s.timeframe === timeframe);

  return (
    <Panel
      title="AI Trading Signals"
      subtitle="Multi-timeframe · funding + OI + L/S + whale flow · Gemini 2.5"
      accent="purple"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border bg-secondary/40 p-0.5">
            {TFS.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-bold uppercase transition-colors",
                  timeframe === tf ? "bg-[var(--neon-purple)] text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >{tf}</button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {ASSETS.map((a) => (
              <button
                key={a}
                disabled={mut.isPending || !latestPrices[a]}
                onClick={() => mut.mutate(a)}
                className="rounded-md border border-border bg-secondary px-2 py-1 text-[10px] font-bold uppercase hover:border-[var(--neon-purple)] disabled:opacity-40"
              >
                <Sparkles className="inline h-3 w-3" /> {a}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {isLoading && signals.length === 0 && (
        <SkeletonLoader variant="cards" rows={3} />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {signals.map((s) => {
          const confTone = s.confidence >= 85 ? "purple" : s.confidence >= 70 ? "bull" : s.confidence >= 50 ? "warn" : "default";
          const rr = Math.abs((Number(s.target) - Number(s.entry)) / (Number(s.entry) - Number(s.stop)));
          const risk = rr >= 2.5 ? "LOW" : rr >= 1.5 ? "MEDIUM" : "HIGH";
          const riskTone = risk === "LOW" ? "bull" : risk === "MEDIUM" ? "warn" : "bear";
          const evidence = Array.isArray(s.evidence) ? (s.evidence as EvidenceItem[]) : [];
          return (
            <div key={s.id} className="rounded-lg border border-border bg-gradient-to-br from-card to-secondary/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-[var(--neon-purple)]" />
                  <span className="text-base font-bold">{s.asset}</span>
                  <Chip tone={s.direction === "LONG" ? "bull" : s.direction === "SHORT" ? "bear" : "default"}>{s.direction}</Chip>
                  <span className="text-[10px] text-muted-foreground">{s.timeframe}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">{timeAgo(new Date(s.created_at).getTime())}</div>
              </div>

              <div className="relative mb-3 flex h-20 items-center justify-center">
                <svg viewBox="0 0 100 100" className="h-20 w-20 -rotate-90">
                  <circle cx="50" cy="50" r="44" stroke="oklch(0.22 0.03 280)" strokeWidth="8" fill="none" />
                  <circle
                    cx="50" cy="50" r="44" fill="none"
                    stroke={confTone === "purple" ? "oklch(0.65 0.25 295)" : confTone === "bull" ? "oklch(0.82 0.22 150)" : confTone === "warn" ? "oklch(0.88 0.18 95)" : "oklch(0.65 0.03 280)"}
                    strokeWidth="8"
                    strokeDasharray={`${(s.confidence / 100) * 276.5} 276.5`}
                    strokeLinecap="round"
                    className={cn(confTone === "purple" && "pulse-dot")}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-lg font-bold font-mono">{s.confidence}%</div>
                  <div className="text-[9px] uppercase text-muted-foreground">confidence</div>
                </div>
              </div>

              <dl className="space-y-1 font-mono text-xs">
                <Row label="Entry" value={`$${fmtPrice(Number(s.entry))}`} />
                <Row label="Target" value={`$${fmtPrice(Number(s.target))}`} tone="bull" />
                <Row label="Stop" value={`$${fmtPrice(Number(s.stop))}`} tone="bear" />
                <Row label="R:R" value={`${rr.toFixed(2)}x`} />
              </dl>

              {evidence.length > 0 && (
                <div className="mt-3 border-t border-border pt-2">
                  <div className="mb-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">Evidence</div>
                  <div className="flex flex-wrap gap-1">
                    {evidence.map((e, i) => {
                      const Icon = e.bias === "BULL" ? TrendingUp : e.bias === "BEAR" ? TrendingDown : Minus;
                      const color = e.bias === "BULL" ? "text-bull border-bull/40 bg-bull/10" : e.bias === "BEAR" ? "text-bear border-bear/40 bg-bear/10" : "text-muted-foreground border-border bg-secondary/40";
                      return (
                        <span key={i} className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-mono", color)}>
                          <Icon className="h-2.5 w-2.5" />
                          <span className="font-semibold">{e.label}</span>
                          <span>{e.value}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {s.reasoning && (
                <p className="mt-3 text-[11px] text-muted-foreground leading-snug line-clamp-3">
                  💡 {s.reasoning}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                <span className="text-[10px] uppercase text-muted-foreground">{s.model.split("/").pop()}</span>
                <Chip tone={riskTone as "bull" | "warn" | "bear"}>
                  <Shield className="h-3 w-3" /> {risk}
                </Chip>
              </div>
            </div>
          );
        })}
        {signals.length === 0 && !isLoading && (
          <div className="lg:col-span-3 py-8 text-center text-sm text-muted-foreground">
            No {timeframe} signals yet — click an asset button above to generate.
          </div>
        )}
      </div>
    </Panel>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-semibold", tone === "bull" && "text-bull", tone === "bear" && "text-bear")}>{value}</dd>
    </div>
  );
}
