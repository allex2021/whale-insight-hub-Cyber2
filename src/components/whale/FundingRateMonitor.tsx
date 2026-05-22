import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Panel, Chip } from "./Panel";
import { buildMockFunding } from "@/lib/whale/mock";
import { fmtPct } from "@/lib/whale/format";

export function FundingRateMonitor() {
  const rows = useMemo(() => buildMockFunding(), []);
  return (
    <Panel title="Funding Rate Monitor" subtitle="Per-exchange perpetual funding + anomaly detection" accent="blue">
      <div className="space-y-2">
        {rows.map((r) => {
          const anomaly = Math.abs(r.avg) > 0.04;
          return (
            <div key={r.symbol} className="rounded-md border border-border bg-secondary/40 p-3 font-mono text-xs">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{r.symbol}</span>
                  <Chip tone={r.avg > 0.04 ? "bear" : r.avg > 0.01 ? "warn" : r.avg < -0.01 ? "bull" : "default"}>{r.status}</Chip>
                  {anomaly && <Chip tone="bear">🚨 Anomaly</Chip>}
                </div>
                <div className="text-muted-foreground">Squeeze: <span className={r.squeezeProb > 60 ? "text-bear font-bold" : ""}>{r.squeezeProb}%</span></div>
              </div>
              <div className="grid grid-cols-5 gap-2 items-center">
                <Rate label="Binance" v={r.binance} />
                <Rate label="Bybit" v={r.bybit} />
                <Rate label="OKX" v={r.okx} />
                <Rate label="AVG" v={r.avg} bold />
                <div className="h-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={r.history.map((v, i) => ({ i, v }))}>
                      <Line type="monotone" dataKey="v" stroke="oklch(0.7 0.2 240)" dot={false} strokeWidth={1.5} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Rate({ label, v, bold }: { label: string; v: number; bold?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`${bold ? "font-bold" : ""} ${v > 0 ? "text-bull" : v < 0 ? "text-bear" : ""}`}>
        {fmtPct(v * 100, 3)}
      </div>
    </div>
  );
}
