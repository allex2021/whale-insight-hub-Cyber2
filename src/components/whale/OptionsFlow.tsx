import { useMemo, useState } from "react";
import { Panel, Chip } from "./Panel";
import { fmtUSD } from "@/lib/whale/format";
import { RadialBar, RadialBarChart, ResponsiveContainer, PolarAngleAxis } from "recharts";
import { useAsync } from "@/lib/whale/useAsync";
import { fetchOptions } from "@/lib/whale/services";
import { SkeletonLoader } from "./SkeletonLoader";
import { ErrorState } from "./StateView";

export function OptionsFlow() {
  const [cur, setCur] = useState<"BTC" | "ETH">("BTC");
  const fetcher = useMemo(() => (s: AbortSignal) => fetchOptions(cur, s), [cur]);
  const { data: trades, error, loading, retry } = useAsync(fetcher, [cur], { refreshMs: 30_000 });

  const pcr = useMemo(() => {
    if (!trades || !trades.length) return 0;
    const calls = trades.filter((t) => t.type === "CALL").reduce((s, t) => s + t.premium, 0);
    const puts = trades.filter((t) => t.type === "PUT").reduce((s, t) => s + t.premium, 0);
    return calls ? puts / calls : 0;
  }, [trades]);
  const pcrLabel = pcr < 0.7 ? { tone: "bull" as const, text: "Bullish" } : pcr > 1 ? { tone: "bear" as const, text: "Bearish" } : { tone: "warn" as const, text: "Neutral" };
  const gauge = [{ name: "PCR", value: Math.min(150, pcr * 100), fill: pcr > 1 ? "oklch(0.65 0.26 15)" : pcr < 0.7 ? "oklch(0.82 0.22 150)" : "oklch(0.88 0.18 95)" }];

  return (
    <Panel
      title="Options Flow"
      subtitle="Live Deribit block trades + P/C ratio"
      accent="purple"
      action={
        <div className="flex gap-1">
          {(["BTC", "ETH"] as const).map((c) => (
            <button key={c} onClick={() => setCur(c)}
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${cur === c ? "border-[var(--neon-purple)] bg-[var(--neon-purple)]/15 text-[var(--neon-purple)]" : "border-border bg-secondary/50 text-muted-foreground"}`}
            >{c}</button>
          ))}
        </div>
      }
    >
      {loading && !trades && <LoadingState label="Fetching Deribit trades…" />}
      {error && !trades && <ErrorState error={error} onRetry={retry} />}
      {trades && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <div className="text-[10px] uppercase text-muted-foreground">Put/Call Ratio</div>
              <div className="relative h-[100px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart innerRadius="70%" outerRadius="100%" data={gauge} startAngle={180} endAngle={0}>
                    <PolarAngleAxis type="number" domain={[0, 150]} tick={false} />
                    <RadialBar background dataKey="value" cornerRadius={6} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-xl font-bold font-mono">{pcr.toFixed(2)}</div>
                  <Chip tone={pcrLabel.tone}>{pcrLabel.text}</Chip>
                </div>
              </div>
            </div>
            <div className="col-span-2 grid grid-cols-2 gap-2 font-mono text-xs">
              <Box label="Total Premium" value={fmtUSD(trades.reduce((s, t) => s + t.premium, 0))} />
              <Box label="Unusual Blocks" value={`${trades.filter((t) => t.unusual).length}`} />
              <Box label="Calls" value={`${trades.filter((t) => t.type === "CALL").length}`} tone="bull" />
              <Box label="Puts" value={`${trades.filter((t) => t.type === "PUT").length}`} tone="bear" />
            </div>
          </div>

          <div className="max-h-[260px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-card text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-2 py-1.5 text-left">Time</th><th className="px-2 py-1.5 text-left">Ex</th><th className="px-2 py-1.5 text-left">Sym</th><th className="px-2 py-1.5 text-left">Type</th><th className="px-2 py-1.5 text-right">Strike</th><th className="px-2 py-1.5 text-left">Exp</th><th className="px-2 py-1.5 text-right">Premium</th><th className="px-2 py-1.5"></th></tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={i} className="border-b border-border/60 hover:bg-card-hover">
                    <td className="px-2 py-1.5 text-muted-foreground">{new Date(t.time).toLocaleTimeString().slice(0, 5)}</td>
                    <td className="px-2 py-1.5">{t.exchange}</td>
                    <td className="px-2 py-1.5 font-bold">{t.symbol}</td>
                    <td className={`px-2 py-1.5 font-bold ${t.type === "CALL" ? "text-bull" : "text-bear"}`}>{t.type}</td>
                    <td className="px-2 py-1.5 text-right">${t.strike.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{t.expiry}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{fmtUSD(t.premium)}</td>
                    <td className="px-2 py-1.5">{t.unusual && <Chip tone="warn">🚨</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
