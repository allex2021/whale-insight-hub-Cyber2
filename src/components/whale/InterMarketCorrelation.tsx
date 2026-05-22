import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel, Chip } from "./Panel";
import { buildMockCorrelation } from "@/lib/whale/mock";

export function InterMarketCorrelation() {
  const data = useMemo(() => buildMockCorrelation(), []);
  const charts = [data.dxy, data.spx, data.gold, data.ethBtc];
  return (
    <Panel title="Inter-Market Correlation" subtitle="BTC vs macro proxies (14d)" accent="blue">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {charts.map((c) => {
          const tone = c.corr > 0.5 ? "bull" : c.corr < -0.5 ? "bear" : "default";
          return (
            <div key={c.label} className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold">{c.label}</span>
                <Chip tone={tone as "bull" | "bear" | "default"}>r = {c.corr.toFixed(2)}</Chip>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">{c.interp}</p>
              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={c.data}>
                    <XAxis dataKey="day" tick={false} axisLine={false} />
                    <YAxis yAxisId="L" hide />
                    <YAxis yAxisId="R" orientation="right" hide />
                    <Tooltip contentStyle={{ background: "oklch(0.16 0.025 280)", border: "1px solid oklch(0.35 0.06 280)", borderRadius: 8, fontSize: 11 }} />
                    <Line yAxisId="L" type="monotone" dataKey="btc" stroke="oklch(0.78 0.2 155)" dot={false} strokeWidth={1.5} name="BTC" />
                    <Line yAxisId="R" type="monotone" dataKey="other" stroke="oklch(0.7 0.2 240)" dot={false} strokeWidth={1.5} name="Other" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
