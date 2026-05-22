import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Panel, Chip, Bar } from "./Panel";
import type { Symbol } from "@/lib/whale/types";
import { fmtPct, fmtUSD } from "@/lib/whale/format";
import { useAsync } from "@/lib/whale/useAsync";
import { fetchExchangeSignalsServer } from "@/lib/whale/market.functions";
import { ErrorState, LoadingState } from "./StateView";

export function CrossExchangeSignal() {
  const [sym, setSym] = useState<Symbol>("BTC");
  const fn = useServerFn(fetchExchangeSignalsServer);
  const fetcher = useMemo(() => (_s: AbortSignal) => fn({ data: { symbol: sym } }), [fn, sym]);
  const { data: rows, error, loading, retry } = useAsync(fetcher, [sym], { refreshMs: 60_000 });

  const sameDir = rows && rows.every((r) => r.direction === rows[0].direction);
  const convergence = rows ? (sameDir ? "STRONG" : rows.filter((r) => r.direction === rows[0].direction).length === 2 ? "PARTIAL" : "MIXED") : "MIXED";
  const avgStrength = rows ? Math.round(rows.reduce((s, r) => s + r.strength, 0) / rows.length) : 0;

  return (
    <Panel
      title="Cross-Exchange Signal"
      subtitle="OI + funding + 24h Δ across Binance · Bybit · OKX"
      accent="green"
      action={
        <div className="flex gap-1">
          {(["BTC", "ETH", "SOL"] as Symbol[]).map((s) => (
            <button key={s} onClick={() => setSym(s)}
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${sym === s ? "border-bull bg-bull/15 text-bull" : "border-border bg-secondary/50 text-muted-foreground"}`}
            >{s}</button>
          ))}
        </div>
      }
    >
      {loading && !rows && <LoadingState />}
      {error && !rows && <ErrorState error={error} onRetry={retry} />}
      {rows && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <Chip tone={convergence === "STRONG" ? "bull" : convergence === "PARTIAL" ? "warn" : "bear"}>
              {convergence === "STRONG" ? "🎯 Strong Convergence" : convergence === "PARTIAL" ? "⚡ Partial" : "⚠️ Mixed"}
            </Chip>
            <div className="font-mono text-xs text-muted-foreground">
              Combined Strength: <span className="font-bold text-foreground">{avgStrength}%</span>
            </div>
          </div>
          <table className="w-full text-xs font-mono">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr><th className="px-2 py-1.5 text-left">Exchange</th><th className="text-left">Dir</th><th className="text-right">OI Δ</th><th className="text-right">Funding</th><th className="text-right">Vol</th><th className="text-left">Signal</th><th className="px-2">Strength</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.exchange} className="border-b border-border/60">
                  <td className="px-2 py-2">{r.exchange}</td>
                  <td><Chip tone={r.direction === "LONG" ? "bull" : "bear"}>{r.direction}</Chip></td>
                  <td className={`text-right ${r.oiChange >= 0 ? "text-bull" : "text-bear"}`}>{fmtPct(r.oiChange)}</td>
                  <td className={`text-right ${r.funding >= 0 ? "text-bull" : "text-bear"}`}>{fmtPct(r.funding * 100, 4)}</td>
                  <td className="text-right">{fmtUSD(r.volume)}</td>
                  <td><Chip tone={r.signal === "BUY" ? "bull" : "bear"}>{r.signal}</Chip></td>
                  <td className="px-2 w-32">
                    <div className="flex items-center gap-2">
                      <Bar value={r.strength} tone={r.signal === "BUY" ? "bull" : "bear"} />
                      <span className="text-[10px] w-7 text-right">{r.strength}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  );
}
