import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Panel, Chip } from "./Panel";
import { SkeletonLoader } from "./SkeletonLoader";
import type { Symbol } from "@/lib/whale/types";
import { fetchFearGreed, fetchMultiTfTA } from "@/lib/whale/ta.functions";

function fgColor(v: number) {
  if (v >= 75) return "text-bull";
  if (v >= 55) return "text-[var(--neon-green)]";
  if (v >= 45) return "text-warn";
  if (v >= 25) return "text-[var(--neon-orange)]";
  return "text-bear";
}

export function MultiTimeframeTA() {
  const [sym, setSym] = useState<Symbol>("BTC");
  const fgFn = useServerFn(fetchFearGreed);
  const taFn = useServerFn(fetchMultiTfTA);

  const fg = useQuery({
    queryKey: ["fear-greed"],
    queryFn: () => fgFn(),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  const ta = useQuery({
    queryKey: ["mtf-ta", sym],
    queryFn: () => taFn({ data: { symbol: sym } }),
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  const biasTone = useMemo(() => {
    if (!ta.data) return "default" as const;
    return ta.data.bias === "BULL" ? "bull" : ta.data.bias === "BEAR" ? "bear" : "warn";
  }, [ta.data]);

  return (
    <Panel
      title="Multi-Timeframe TA + Fear/Greed"
      subtitle="RSI(14) + MACD(12,26,9) · 1h / 4h / 1d · alternative.me"
      accent="purple"
      action={
        <div className="flex gap-1">
          {(["BTC", "ETH", "SOL", "LTC"] as Symbol[]).map((s) => (
            <button
              key={s}
              onClick={() => setSym(s)}
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                sym === s
                  ? "border-bull bg-bull/15 text-bull"
                  : "border-border bg-secondary/50 text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      }
    >
      {/* Fear & Greed */}
      <div className="mb-3 flex items-center justify-between rounded border border-border/60 bg-card/40 p-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Fear & Greed Index
          </div>
          {fg.data ? (
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-2xl font-bold ${fgColor(fg.data.value)}`}>
                {fg.data.value}
              </span>
              <span className="text-xs text-foreground">{fg.data.classification}</span>
            </div>
          ) : (
            <SkeletonLoader variant="ticker" />
          )}
        </div>
        <div className="h-2 w-40 overflow-hidden rounded bg-card sm:w-56">
          {fg.data && (
            <div
              className={`h-full ${
                fg.data.value >= 55
                  ? "bg-bull"
                  : fg.data.value <= 45
                    ? "bg-bear"
                    : "bg-warn"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, fg.data.value))}%` }}
            />
          )}
        </div>
      </div>

      {/* MTF table */}
      {!ta.data && <SkeletonLoader variant="table" rows={4} />}
      {ta.data && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <Chip tone={biasTone}>
              {ta.data.bias} bias · {ta.data.bullCount}/3 bullish TFs
            </Chip>
            <span className="font-mono text-[10px] text-muted-foreground">
              last close ${ta.data.readings[ta.data.readings.length - 1]?.lastClose.toLocaleString()}
            </span>
          </div>
          <table className="w-full text-xs font-mono">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left">TF</th>
                <th className="text-right">RSI</th>
                <th className="text-right">MACD</th>
                <th className="text-right">Signal</th>
                <th className="text-right">Hist</th>
                <th className="px-2 text-left">Trend</th>
              </tr>
            </thead>
            <tbody>
              {ta.data.readings.map((r) => (
                <tr key={r.interval} className="border-b border-border/60">
                  <td className="px-2 py-2 font-bold">{r.interval}</td>
                  <td
                    className={`text-right ${
                      r.rsi >= 70 ? "text-bear" : r.rsi <= 30 ? "text-bull" : "text-foreground"
                    }`}
                  >
                    {r.rsi.toFixed(1)}
                  </td>
                  <td className={`text-right ${r.macd >= 0 ? "text-bull" : "text-bear"}`}>
                    {r.macd.toFixed(2)}
                  </td>
                  <td className="text-right text-muted-foreground">{r.signal.toFixed(2)}</td>
                  <td className={`text-right ${r.hist >= 0 ? "text-bull" : "text-bear"}`}>
                    {r.hist >= 0 ? "+" : ""}
                    {r.hist.toFixed(2)}
                  </td>
                  <td className="px-2">
                    <Chip
                      tone={r.trend === "BULL" ? "bull" : r.trend === "BEAR" ? "bear" : "default"}
                    >
                      {r.trend}
                    </Chip>
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
