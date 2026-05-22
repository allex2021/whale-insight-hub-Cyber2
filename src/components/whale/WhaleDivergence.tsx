import { useEffect, useState } from "react";
import { Panel, Chip } from "./Panel";
import { supabase } from "@/integrations/supabase/client";
import { ErrorState, EmptyState, LoadingState } from "./StateView";

interface Row { symbol: string; smart: number; retail: number; divergence: number }

export function WhaleDivergence() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      // smart money = whale_trades buy/sell split per asset
      // retail = Binance taker buy/sell ratio (open API)
      const { data, error } = await supabase
        .from("whale_trades")
        .select("asset, side, size_usd")
        .gte("trade_time", new Date(Date.now() - 6 * 3600 * 1000).toISOString());
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      const smart: Record<string, { buy: number; sell: number }> = {};
      for (const t of data ?? []) {
        smart[t.asset] = smart[t.asset] ?? { buy: 0, sell: 0 };
        if (t.side === "BUY") smart[t.asset].buy += Number(t.size_usd);
        else smart[t.asset].sell += Number(t.size_usd);
      }
      const symbols = ["BTC", "ETH", "SOL"];
      try {
        const retail = await Promise.all(symbols.map(async (s) => {
          const r = await fetch(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${s}USDT&period=1h&limit=1`);
          if (!r.ok) throw new Error(`Binance ${r.status}`);
          const j = await r.json() as Array<{ buySellRatio: string }>;
          const ratio = parseFloat(j[0].buySellRatio); // buys / sells
          const buyPct = (ratio / (1 + ratio)) * 100;
          return { symbol: s, buyPct };
        }));
        const out: Row[] = symbols.map((s) => {
          const sm = smart[s] ?? { buy: 0, sell: 0 };
          const smartTot = sm.buy + sm.sell;
          const smartPct = smartTot > 0 ? (sm.buy / smartTot) * 100 : 50;
          const ret = retail.find((r) => r.symbol === s)!.buyPct;
          return { symbol: s, smart: Math.round(smartPct), retail: Math.round(ret), divergence: Math.abs(Math.round(smartPct - ret)) };
        });
        if (!cancelled) { setRows(out); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  const maxDiv = rows ? Math.max(...rows.map((r) => r.divergence)) : 0;

  return (
    <Panel title="Whale vs Retail Divergence" subtitle="Smart money flow vs Binance taker ratio (1h)" accent="orange">
      {loading && !rows && <LoadingState />}
      {error && <ErrorState error={error} onRetry={() => setTick((t) => t + 1)} />}
      {rows && rows.every((r) => r.smart === 50) && <EmptyState label="Waiting for whale trades to compute divergence…" />}
      {rows && (
        <>
          {maxDiv >= 30 && (
            <div className="mb-3 rounded-md border border-bear/60 bg-bear/10 p-2 text-xs font-bold text-bear">
              🚨 MAJOR DIVERGENCE DETECTED
            </div>
          )}
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.symbol} className="rounded-md border border-border bg-secondary/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold">{r.symbol}</span>
                  <Chip tone={r.divergence >= 30 ? "bear" : r.divergence >= 15 ? "warn" : "bull"}>Δ {r.divergence}%</Chip>
                </div>
                <div className="flex h-6 overflow-hidden rounded-md border border-border">
                  <div className="flex items-center justify-start bg-[var(--neon-blue)]/40 px-2 text-[11px] font-bold font-mono"
                    style={{ width: `${r.smart}%` }}>🐋 {r.smart}%</div>
                  <div className="flex items-center justify-end bg-[var(--neon-orange)]/40 px-2 text-[11px] font-bold font-mono flex-1">
                    👥 {r.retail}%
                  </div>
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Whales buy %</span><span>Retail buy %</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
