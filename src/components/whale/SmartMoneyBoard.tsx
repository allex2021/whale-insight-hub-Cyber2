import { useEffect, useState } from "react";
import { Panel, Chip, Bar } from "./Panel";
import { fmtUSD } from "@/lib/whale/format";
import { supabase } from "@/integrations/supabase/client";
import { ErrorState, EmptyState, LoadingState } from "./StateView";

interface Row {
  alias: string;
  wallet: string;
  symbol: string;
  side: string;
  size: number;
  count: number;
  score: number;
}

export function SmartMoneyBoard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error } = await supabase
        .from("whale_trades")
        .select("asset, side, size_usd, exchange, trade_time")
        .order("trade_time", { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      // Aggregate by (exchange, asset, side) into pseudo-wallets
      const groups = new Map<string, { count: number; size: number; symbol: string; side: string }>();
      for (const t of data ?? []) {
        const key = `${t.exchange}-${t.asset}-${t.side}`;
        const g = groups.get(key) ?? { count: 0, size: 0, symbol: t.asset, side: t.side };
        g.count += 1;
        g.size += Number(t.size_usd);
        groups.set(key, g);
      }
      const aggregated: Row[] = Array.from(groups.entries()).map(([key, g]) => {
        const [exchange] = key.split("-");
        const score = Math.min(100, Math.round(50 + Math.log10(Math.max(1, g.size / 1e5)) * 12 + g.count * 1.5));
        return {
          alias: `${exchange}-${g.symbol}-${g.side}`,
          wallet: `pool · ${g.count} trades`,
          symbol: g.symbol,
          side: g.side,
          size: g.size,
          count: g.count,
          score,
        };
      }).sort((a, b) => b.score - a.score).slice(0, 10);
      setRows(aggregated);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tick]);

  return (
    <Panel title="Smart Money Scoreboard" subtitle="Aggregated from live whale_trades (Binance WS)" accent="purple">
      {loading && !rows && <LoadingState />}
      {error && <ErrorState error={error} onRetry={() => setTick((t) => t + 1)} />}
      {rows && rows.length === 0 && <EmptyState label="Waiting for whale trades to land…" />}
      {rows && rows.length > 0 && (
        <table className="w-full text-xs font-mono">
          <thead className="text-[10px] uppercase text-muted-foreground border-b border-border">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Cluster</th>
              <th className="px-2 py-2 text-right">Trades</th>
              <th className="px-2 py-2 text-right">Flow</th>
              <th className="px-2 py-2 text-center">Score</th>
              <th className="px-2 py-2 text-center">Bias</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w, i) => (
              <tr key={w.alias} className="border-b border-border/60 hover:bg-card-hover">
                <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-2">
                  <div className="font-semibold">{w.alias}</div>
                  <div className="text-[10px] text-muted-foreground">{w.wallet}</div>
                </td>
                <td className="px-2 py-2 text-right">{w.count}</td>
                <td className={`px-2 py-2 text-right ${w.side === "BUY" ? "text-bull" : "text-bear"}`}>{fmtUSD(w.size)}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div className="font-bold w-7 text-right">{w.score}</div>
                    <Bar value={w.score} tone={w.score >= 80 ? "purple" : "bull"} />
                  </div>
                </td>
                <td className="px-2 py-2 text-center"><Chip tone={w.side === "BUY" ? "bull" : "bear"}>{w.side === "BUY" ? "LONG" : "SHORT"}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
