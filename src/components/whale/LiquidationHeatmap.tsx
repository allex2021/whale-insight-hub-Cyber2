import { useMemo, useState } from "react";
import { Bar as RBar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel, Chip } from "./Panel";
import { fmtUSD, fmtPct } from "@/lib/whale/format";
import { useAsync } from "@/lib/whale/useAsync";
import { fetchLiqHeatmap, type LiqRange } from "@/lib/whale/services";
import type { Symbol } from "@/lib/whale/types";
import { ErrorState, LoadingState } from "./StateView";

const SYMBOLS: Symbol[] = ["BTC", "ETH", "SOL"];
const RANGES: LiqRange[] = ["1H", "4H", "12H", "24H"];

export function LiquidationHeatmap() {
  const [symbol, setSymbol] = useState<Symbol>("BTC");
  const [range, setRange] = useState<LiqRange>("4H");

  const fetcher = useMemo(() => (s: AbortSignal) => fetchLiqHeatmap({ symbol, range }, s), [symbol, range]);
  const { data, error, loading, retry } = useAsync(fetcher, [symbol, range], { refreshMs: 120_000 });

  const cascadeScore = data
    ? Math.min(98, Math.round((data.longTotal + data.shortTotal) / (data.totalOI || 1) * 220))
    : 0;
  const cascadeLabel = cascadeScore > 80 ? "CRITICAL" : cascadeScore > 60 ? "HIGH" : cascadeScore > 30 ? "MEDIUM" : "LOW";
  const cascadeTone = cascadeScore > 80 ? "bear" : cascadeScore > 60 ? "warn" : cascadeScore > 30 ? "default" : "bull";

  const dominantSide = data && data.longTotal > data.shortTotal * 1.15
    ? "LONGS AT RISK"
    : data && data.shortTotal > data.longTotal * 1.15
    ? "SHORTS AT RISK"
    : "BALANCED";

  return (
    <Panel
      title="Liquidation Heatmap"
      subtitle={`${symbol} perp · multi-exchange OI density · ${range}`}
      accent="orange"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[10px]">
        <div className="flex gap-1">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={`rounded border px-2 py-1 uppercase tracking-wider transition ${
                symbol === s ? "border-primary bg-primary/20 text-primary" : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded border px-2 py-1 tracking-wider transition ${
                range === r ? "border-primary bg-primary/20 text-primary" : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && <LoadingState label="Computing liquidation zones…" />}
      {error && !data && <ErrorState error={error} onRetry={retry} />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-3 font-mono text-xs">
            <Box label="Long Liq Risk" value={fmtUSD(data.longTotal)} tone="bear" />
            <Box label="Short Liq Risk" value={fmtUSD(data.shortTotal)} tone="bull" />
            <Box label="Total OI" value={fmtUSD(data.totalOI)} sub={`Δ ${fmtPct(data.oiDeltaPct)}`} />
            <div className="rounded-md border border-border bg-secondary/40 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Cascade Risk</div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-sm font-bold">{cascadeScore}%</span>
                <Chip tone={cascadeTone as "bear" | "warn" | "default" | "bull"}>{cascadeLabel}</Chip>
              </div>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
            <span className="text-muted-foreground">Bias:</span>
            <Chip tone={dominantSide === "LONGS AT RISK" ? "bear" : dominantSide === "SHORTS AT RISK" ? "bull" : "default"}>
              {dominantSide}
            </Chip>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">OI Split:</span>
            <span className="text-amber-400">BIN {fmtUSD(data.exchanges.binance)}</span>
            <span className="text-orange-400">BYB {fmtUSD(data.exchanges.bybit)}</span>
            <span className="text-sky-400">OKX {fmtUSD(data.exchanges.okx)}</span>
          </div>

          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.buckets} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="oklch(0.25 0.04 280)" strokeDasharray="3 3" />
                <XAxis dataKey="price" tick={{ fill: "oklch(0.65 0.03 280)", fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`} />
                <YAxis tick={{ fill: "oklch(0.65 0.03 280)", fontSize: 10 }} tickFormatter={(v) => `$${(Math.abs(v) / 1e6).toFixed(0)}M`} />
                <Tooltip
                  cursor={{ fill: "oklch(0.2 0.03 280 / 0.5)" }}
                  contentStyle={{ background: "oklch(0.16 0.025 280)", border: "1px solid oklch(0.35 0.06 280)", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => [fmtUSD(Math.abs(value)), name]}
                  labelFormatter={(l) => `Price: $${Number(l).toLocaleString()}`}
                />
                <ReferenceLine x={data.spot} stroke="white" strokeDasharray="4 4" label={{ value: `Spot $${data.spot.toLocaleString()}`, fill: "white", fontSize: 10, position: "top" }} />
                <RBar dataKey="longLiq" name="Long Liq" stackId="a" fill="oklch(0.65 0.26 15)" />
                <RBar dataKey="shortLiq" name="Short Liq" stackId="a" fill="oklch(0.82 0.22 150)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {data.topClusters.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Top Cluster Zones (magnet levels)
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {data.topClusters.map((c, i) => (
                  <div
                    key={`${c.price}-${i}`}
                    className={`flex items-center justify-between rounded border px-2 py-1.5 font-mono text-xs ${
                      c.side === "LONG"
                        ? "border-bear/40 bg-bear/10"
                        : "border-bull/40 bg-bull/10"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-bold">${c.price.toLocaleString()}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {fmtPct(c.distancePct)} from spot
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`text-[10px] font-bold uppercase ${c.side === "LONG" ? "text-bear" : "text-bull"}`}>
                        {c.side} LIQ
                      </span>
                      <span className="text-[10px] text-muted-foreground">{fmtUSD(c.usd)}</span>
                    </div>
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

function Box({ label, value, tone, sub }: { label: string; value: string; tone?: "bull" | "bear"; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
