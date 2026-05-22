import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, RefreshCw, Shield, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Panel, Chip } from "./Panel";
import { timeAgo, fmtPrice } from "@/lib/whale/format";
import { generateAISignal, fetchLatestSignals } from "@/lib/whale/ai.functions";
import { useBinanceWhaleStream } from "@/hooks/useBinanceWhaleStream";
import { cn } from "@/lib/utils";

type Asset = "BTC" | "ETH" | "SOL" | "LTC";

export function AITradingSignals() {
  const qc = useQueryClient();
  const fetchSignals = useServerFn(fetchLatestSignals);
  const generate = useServerFn(generateAISignal);
  const { trades } = useBinanceWhaleStream(500_000, 100);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-signals"],
    queryFn: () => fetchSignals(),
    refetchInterval: 30_000,
  });

  const latestPrices = useMemo(() => {
    const out: Partial<Record<Asset, number>> = {};
    for (const t of trades) {
      if (!out[t.asset]) out[t.asset] = t.price;
    }
    return out;
  }, [trades]);

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
      return generate({ data: { asset, price, recentTradesSummary: summarize(asset) } });
    },
    onSuccess: (row) => {
      toast.success(`AI signal generated for ${row.asset}`);
      qc.invalidateQueries({ queryKey: ["ai-signals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-generate one signal per asset if nothing exists yet
  useEffect(() => {
    if (!data) return;
    const have = new Set(data.signals.map((s) => s.asset));
    const missing = (["BTC", "ETH", "SOL", "LTC"] as Asset[]).filter((a) => !have.has(a) && latestPrices[a]);
    if (missing.length > 0 && !mut.isPending) {
      mut.mutate(missing[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, latestPrices]);

  const signals = data?.signals ?? [];

  return (
    <Panel
      title="AI Trading Signals"
      subtitle="Live signals · powered by Google Gemini via Lovable AI Gateway"
      accent="purple"
      action={
        <div className="flex items-center gap-2">
          {(["BTC", "ETH", "SOL", "LTC"] as Asset[]).map((a) => (
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
      }
    >
      {isLoading && signals.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <RefreshCw className="mx-auto h-5 w-5 animate-spin" />
          <div className="mt-2">Loading AI signals…</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {signals.map((s) => {
          const confTone = s.confidence >= 85 ? "purple" : s.confidence >= 70 ? "bull" : s.confidence >= 50 ? "warn" : "default";
          const rr = Math.abs((Number(s.target) - Number(s.entry)) / (Number(s.entry) - Number(s.stop)));
          const risk = rr >= 2.5 ? "LOW" : rr >= 1.5 ? "MEDIUM" : "HIGH";
          const riskTone = risk === "LOW" ? "bull" : risk === "MEDIUM" ? "warn" : "bear";
          return (
            <div key={s.id} className="rounded-lg border border-border bg-gradient-to-br from-card to-secondary/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-[var(--neon-purple)]" />
                  <span className="text-base font-bold">{s.asset}</span>
                  <Chip tone={s.direction === "LONG" ? "bull" : s.direction === "SHORT" ? "bear" : "default"}>{s.direction}</Chip>
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

              {s.reasoning && (
                <p className="mt-3 text-[11px] text-muted-foreground leading-snug line-clamp-3">
                  💡 {s.reasoning}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                <span className="text-[10px] uppercase text-muted-foreground">{s.timeframe} · {s.model.split("/").pop()}</span>
                <Chip tone={riskTone as "bull" | "warn" | "bear"}>
                  <Shield className="h-3 w-3" /> {risk}
                </Chip>
              </div>
            </div>
          );
        })}
        {signals.length === 0 && !isLoading && (
          <div className="lg:col-span-3 py-8 text-center text-sm text-muted-foreground">
            Click an asset button above to generate the first AI signal.
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
