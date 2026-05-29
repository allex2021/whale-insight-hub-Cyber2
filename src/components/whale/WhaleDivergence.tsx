import { useEffect, useMemo, useState } from "react";
import { Panel, Chip } from "./Panel";
import { supabase } from "@/integrations/supabase/client";
import { SkeletonLoader } from "./SkeletonLoader";
import { ErrorState, EmptyState } from "./StateView";
import { TrendingUp, TrendingDown, AlertTriangle, RefreshCw } from "lucide-react";

type TF = "1h" | "4h" | "24h";
const TF_HOURS: Record<TF, number> = { "1h": 1, "4h": 4, "24h": 24 };
const BINANCE_PERIOD: Record<TF, string> = { "1h": "1h", "4h": "4h", "24h": "1d" };
const SYMBOLS = ["BTC", "ETH", "SOL", "LTC", "XRP", "DOGE"];

type Verdict = "BULL_REVERSAL" | "BEAR_REVERSAL" | "BULL_CONFIRM" | "BEAR_CONFIRM" | "NEUTRAL";

interface Row {
  symbol: string;
  smart: number;        // whale buy %
  retail: number;       // retail buy %
  divergence: number;   // |smart - retail|
  whaleVol: number;     // total whale $ volume
  whaleCount: number;
  priceChange: number;  // % over timeframe
  verdict: Verdict;
}

const VERDICT_META: Record<Verdict, { label: string; tone: "bull" | "bear" | "warn" | "default"; icon: typeof TrendingUp | null }> = {
  BULL_REVERSAL: { label: "Bullish Reversal Setup", tone: "bull", icon: TrendingUp },
  BEAR_REVERSAL: { label: "Bearish Reversal Setup", tone: "bear", icon: TrendingDown },
  BULL_CONFIRM:  { label: "Bullish Confirmation",   tone: "bull", icon: TrendingUp },
  BEAR_CONFIRM:  { label: "Bearish Confirmation",   tone: "bear", icon: TrendingDown },
  NEUTRAL:       { label: "Aligned / Neutral",       tone: "default", icon: null },
};

function classifyVerdict(smart: number, retail: number, priceChange: number): Verdict {
  const div = smart - retail; // + = whales more bullish than retail
  const absDiv = Math.abs(div);
  if (absDiv < 12) return "NEUTRAL";
  if (div > 0) {
    return priceChange < -1 ? "BULL_REVERSAL" : "BULL_CONFIRM";
  }
  return priceChange > 1 ? "BEAR_REVERSAL" : "BEAR_CONFIRM";
}

export function WhaleDivergence() {
  const [tf, setTf] = useState<TF>("1h");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const since = new Date(Date.now() - TF_HOURS[tf] * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("whale_trades")
        .select("asset, side, size_usd")
        .gte("trade_time", since);
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      const smart: Record<string, { buy: number; sell: number; count: number }> = {};
      for (const t of data ?? []) {
        smart[t.asset] = smart[t.asset] ?? { buy: 0, sell: 0, count: 0 };
        smart[t.asset].count += 1;
        if (t.side === "BUY") smart[t.asset].buy += Number(t.size_usd);
        else smart[t.asset].sell += Number(t.size_usd);
      }
      try {
        const period = BINANCE_PERIOD[tf];
        const results = await Promise.all(SYMBOLS.map(async (s) => {
          const [retailRes, klineRes] = await Promise.all([
            fetch(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${s}USDT&period=${period}&limit=1`),
            fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${s}USDT&interval=${period}&limit=1`),
          ]);
          if (!retailRes.ok) throw new Error(`Binance ${retailRes.status}`);
          const rj = await retailRes.json() as Array<{ buySellRatio: string }>;
          const ratio = parseFloat(rj[0].buySellRatio);
          const buyPct = (ratio / (1 + ratio)) * 100;
          let priceChange = 0;
          if (klineRes.ok) {
            const kj = await klineRes.json() as Array<[number, string, string, string, string, ...unknown[]]>;
            if (kj[0]) {
              const open = parseFloat(kj[0][1]);
              const close = parseFloat(kj[0][4]);
              priceChange = ((close - open) / open) * 100;
            }
          }
          return { symbol: s, buyPct, priceChange };
        }));
        const out: Row[] = SYMBOLS.map((s) => {
          const sm = smart[s] ?? { buy: 0, sell: 0, count: 0 };
          const smartTot = sm.buy + sm.sell;
          const smartPct = smartTot > 0 ? (sm.buy / smartTot) * 100 : 50;
          const r = results.find((x) => x.symbol === s)!;
          const div = Math.round(Math.abs(smartPct - r.buyPct));
          return {
            symbol: s,
            smart: Math.round(smartPct),
            retail: Math.round(r.buyPct),
            divergence: div,
            whaleVol: smartTot,
            whaleCount: sm.count,
            priceChange: r.priceChange,
            verdict: classifyVerdict(smartPct, r.buyPct, r.priceChange),
          };
        }).sort((a, b) => b.divergence - a.divergence);
        if (!cancelled) { setRows(out); setLoading(false); setLastUpdate(Date.now()); }
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [tick, tf]);

  // auto-refresh every 90s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 90_000);
    return () => clearInterval(id);
  }, []);

  const majorCount = useMemo(() => rows?.filter((r) => r.divergence >= 25).length ?? 0, [rows]);
  const fmtVol = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;

  return (
    <Panel
      title="Whale vs Retail Divergence"
      subtitle="Smart money vs Binance taker ratio + price action"
      accent="orange"
      action={
        <>
          <div className="flex gap-1 rounded-md border border-border bg-secondary/40 p-0.5">
            {(["1h", "4h", "24h"] as TF[]).map((t) => (
              <button
                key={t}
                onClick={() => setTf(t)}
                className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                  tf === t ? "bg-[var(--neon-orange)]/30 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >{t.toUpperCase()}</button>
            ))}
          </div>
          <button
            onClick={() => setTick((t) => t + 1)}
            className="rounded-md border border-border bg-secondary/40 p-1 text-muted-foreground hover:text-foreground"
            aria-label="refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </>
      }
    >
      {loading && !rows && <LoadingState />}
      {error && <ErrorState error={error} onRetry={() => setTick((t) => t + 1)} />}
      {rows && rows.every((r) => r.whaleVol === 0) && (
        <EmptyState label="Waiting for whale trades to compute divergence…" />
      )}
      {rows && rows.some((r) => r.whaleVol > 0) && (
        <>
          {majorCount > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-bear/60 bg-bear/10 p-2 text-xs font-bold text-bear">
              <AlertTriangle className="h-4 w-4" />
              {majorCount} MAJOR DIVERGENCE{majorCount > 1 ? "S" : ""} DETECTED
            </div>
          )}
          <div className="space-y-3">
            {rows.map((r) => {
              const meta = VERDICT_META[r.verdict];
              const Icon = meta.icon;
              const hasData = r.whaleVol > 0;
              return (
                <div key={r.symbol} className="rounded-md border border-border bg-secondary/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{r.symbol}</span>
                      <span className={`text-[11px] font-mono font-bold ${r.priceChange >= 0 ? "text-bull" : "text-bear"}`}>
                        {r.priceChange >= 0 ? "+" : ""}{r.priceChange.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Chip tone={r.divergence >= 25 ? "bear" : r.divergence >= 12 ? "warn" : "bull"}>
                        Δ {r.divergence}%
                      </Chip>
                      {hasData && (
                        <Chip tone={meta.tone}>
                          {Icon && <Icon className="mr-1 inline h-3 w-3" />}
                          {meta.label}
                        </Chip>
                      )}
                    </div>
                  </div>
                  <div className="flex h-6 overflow-hidden rounded-md border border-border">
                    <div
                      className="flex items-center justify-start bg-[var(--neon-blue)]/40 px-2 text-[11px] font-bold font-mono"
                      style={{ width: `${r.smart}%` }}
                    >🐋 {r.smart}%</div>
                    <div className="flex items-center justify-end bg-[var(--neon-orange)]/40 px-2 text-[11px] font-bold font-mono flex-1">
                      👥 {r.retail}%
                    </div>
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>Whales buy %</span>
                    <span>
                      {hasData ? `${r.whaleCount} trades · ${fmtVol(r.whaleVol)}` : "no whale data"}
                    </span>
                    <span>Retail buy %</span>
                  </div>
                </div>
              );
            })}
          </div>
          {lastUpdate && (
            <div className="mt-3 text-right text-[10px] text-muted-foreground">
              Updated {new Date(lastUpdate).toLocaleTimeString()} · auto-refresh 90s
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
