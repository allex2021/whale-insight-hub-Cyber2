import { useMemo } from "react";
import { Bar as RBar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel, Chip } from "./Panel";
import { fmtUSD } from "@/lib/whale/format";
import { useAsync } from "@/lib/whale/useAsync";
import { fetchLiqHeatmap } from "@/lib/whale/services";
import { ErrorState, LoadingState } from "./StateView";

export function LiquidationHeatmap() {
  const fetcher = useMemo(() => (s: AbortSignal) => fetchLiqHeatmap(s), []);
  const { data, error, loading, retry } = useAsync(fetcher, [], { refreshMs: 120_000 });

  const totals = useMemo(() => {
    if (!data) return null;
    const longs = data.buckets.reduce((s, d) => s + d.longLiq, 0);
    const shorts = data.buckets.reduce((s, d) => s + d.shortLiq, 0);
    const top = [...data.buckets].sort((a, b) => (b.longLiq + b.shortLiq) - (a.longLiq + a.shortLiq))[0];
    return { longs, shorts, top };
  }, [data]);

  const cascadeScore = totals ? Math.min(95, Math.round((totals.longs + totals.shorts) / 4e8)) : 0;
  const cascadeLabel = cascadeScore > 80 ? "CRITICAL" : cascadeScore > 60 ? "HIGH" : cascadeScore > 30 ? "MEDIUM" : "LOW";
  const cascadeTone = cascadeScore > 80 ? "bear" : cascadeScore > 60 ? "warn" : cascadeScore > 30 ? "default" : "bull";

  return (
    <Panel title="Liquidation Heatmap" subtitle="BTC perp · derived from Binance OI density" accent="orange">
      {loading && !data && <LoadingState label="Computing liquidation zones…" />}
      {error && !data && <ErrorState error={error} onRetry={retry} />}
      {data && totals && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4 font-mono text-xs">
            <Box label="Long Liq Risk" value={fmtUSD(totals.longs)} tone="bear" />
            <Box label="Short Liq Risk" value={fmtUSD(totals.shorts)} tone="bull" />
            <Box label="Hot Zone" value={`$${totals.top.price.toLocaleString()}`} />
            <div className="rounded-md border border-border bg-secondary/40 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Cascade Risk</div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-sm font-bold">{cascadeScore}%</span>
                <Chip tone={cascadeTone as "bear" | "warn" | "default" | "bull"}>{cascadeLabel}</Chip>
              </div>
            </div>
          </div>

          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.buckets} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="oklch(0.25 0.04 280)" strokeDasharray="3 3" />
                <XAxis dataKey="price" tick={{ fill: "oklch(0.65 0.03 280)", fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
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
        </>
      )}
    </Panel>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>{value}</div>
    </div>
  );
}
