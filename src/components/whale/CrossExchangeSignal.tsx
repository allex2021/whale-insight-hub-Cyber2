import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Panel, Chip, Bar } from "./Panel";
import type { Symbol } from "@/lib/whale/types";
import { fmtPct, fmtUSD } from "@/lib/whale/format";
import { useAsync } from "@/lib/whale/useAsync";
import { fetchExchangeSignalsServer } from "@/lib/whale/market.functions";
import { fetchCcxtAggregate } from "@/lib/whale/ccxt.functions";
import { SkeletonLoader } from "./SkeletonLoader";
import { ErrorState } from "./StateView";

export function CrossExchangeSignal() {
  const [sym, setSym] = useState<Symbol>("BTC");
  const fn = useServerFn(fetchExchangeSignalsServer);
  const ccxtFn = useServerFn(fetchCcxtAggregate);
  const fetcher = useMemo(() => (_s: AbortSignal) => fn({ data: { symbol: sym } }), [fn, sym]);
  const ccxtFetcher = useMemo(() => (_s: AbortSignal) => ccxtFn({ data: { symbol: sym } }), [ccxtFn, sym]);
  const { data: rows, error, loading, retry } = useAsync(fetcher, [sym], { refreshMs: 60_000 });
  const { data: agg } = useAsync(ccxtFetcher, [sym], { refreshMs: 60_000 });

  const sameDir = rows && rows.every((r) => r.direction === rows[0].direction);
  const convergence = rows ? (sameDir ? "STRONG" : rows.filter((r) => r.direction === rows[0].direction).length === 2 ? "PARTIAL" : "MIXED") : "MIXED";
  const avgStrength = rows ? Math.round(rows.reduce((s, r) => s + r.strength, 0) / rows.length) : 0;

  return (
    <Panel
      title="Cross-Exchange Signal"
      subtitle="OI + funding + 24h Δ · Binance · Bybit · OKX + CCXT (8 venues)"
      accent="green"
      action={
        <div className="flex gap-1">
          {(["BTC", "ETH", "SOL", "LTC"] as Symbol[]).map((s) => (
            <button key={s} onClick={() => setSym(s)}
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${sym === s ? "border-bull bg-bull/15 text-bull" : "border-border bg-secondary/50 text-muted-foreground"}`}
            >{s}</button>
          ))}
        </div>
      }
    >
      {loading && !rows && <SkeletonLoader variant="table" rows={5} />}
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

          {/* CCXT extended 8-exchange view */}
          {agg && agg.tickers.filter((t) => t.ok).length > 0 && (
            <div className="mt-4 rounded-md border border-border bg-secondary/20 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">CCXT Extended</span>
                  <Chip tone={agg.convergence === "STRONG" ? "bull" : agg.convergence === "PARTIAL" ? "warn" : "bear"}>
                    {agg.convergence} · {agg.agreementPct}% agree
                  </Chip>
                  <Chip tone={agg.direction === "LONG" ? "bull" : agg.direction === "SHORT" ? "bear" : "default"}>
                    {agg.direction}
                  </Chip>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  spread <span className="text-foreground">{agg.spreadPct.toFixed(3)}%</span>
                  {" · "}vol <span className="text-foreground">{fmtUSD(agg.volumeTotal)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {agg.tickers.map((t) => (
                  <div
                    key={t.exchange}
                    className={`rounded border px-2 py-1.5 text-[10px] font-mono ${
                      t.ok ? "border-border bg-background/40" : "border-border/40 bg-secondary/20 opacity-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase">{t.exchange}</span>
                      {t.ok ? (
                        <span className={t.changePct >= 0 ? "text-bull" : "text-bear"}>
                          {t.changePct >= 0 ? "+" : ""}{t.changePct.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="text-foreground">{t.ok ? fmtUSD(t.last) : "n/a"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
