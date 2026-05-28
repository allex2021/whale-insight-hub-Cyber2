import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Panel, Chip } from "./Panel";
import { LoadingState, ErrorState } from "./StateView";
import type { Symbol } from "@/lib/whale/types";
import { runBacktest, type BacktestResult } from "@/lib/whale/strategy.functions";

type StrategyId = "sma_cross" | "grid" | "dca";
type Interval = "15m" | "1h" | "4h" | "1d";

const STRATS: { id: StrategyId; label: string; hint: string }[] = [
  { id: "sma_cross", label: "SMA Cross", hint: "Fast/slow crossover · trend follow" },
  { id: "grid", label: "Grid", hint: "Mean-reversion grid · range markets" },
  { id: "dca", label: "DCA", hint: "Time-spaced accumulation" },
];

const ASSETS: Symbol[] = ["BTC", "ETH", "SOL", "LTC"];
const INTERVALS: Interval[] = ["15m", "1h", "4h", "1d"];

function fmt(n: number, d = 2) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

export function StrategySimulator() {
  const [asset, setAsset] = useState<Symbol>("BTC");
  const [strategy, setStrategy] = useState<StrategyId>("sma_cross");
  const [interval, setInterval] = useState<Interval>("1h");
  const [limit, setLimit] = useState(500);

  // strategy params (only the relevant ones get sent)
  const [fast, setFast] = useState(10);
  const [slow, setSlow] = useState(30);
  const [levels, setLevels] = useState(8);
  const [rangePct, setRangePct] = useState(0.15);
  const [everyN, setEveryN] = useState(24);
  const [buys, setBuys] = useState(20);

  const runFn = useServerFn(runBacktest);
  const m = useMutation<BacktestResult, Error, void>({
    mutationFn: async () => {
      const params: Record<string, number> =
        strategy === "sma_cross"
          ? { fast, slow }
          : strategy === "grid"
          ? { levels, rangePct }
          : { everyN, buys };
      return runFn({ data: { asset, strategy, interval, limit, params } });
    },
  });

  const result = m.data;
  const chartData = useMemo(() => {
    if (!result) return [];
    const base = result.equity[0]?.equity ?? 10_000;
    const startPx = result.equity[0]?.price ?? 1;
    return result.equity.map((p) => ({
      t: new Date(p.t).toLocaleDateString(),
      strategy: (p.equity / base) * 100,
      buyHold: (p.price / startPx) * 100,
    }));
  }, [result]);

  const outperf = result ? result.pnlPct - result.buyHoldPct : 0;

  return (
    <Panel
      title="Strategy Simulator"
      subtitle="Zero look-ahead bias · Binance klines · SMA Cross / Grid / DCA"
      accent="purple"
      action={
        <button
          onClick={() => m.mutate()}
          disabled={m.isPending}
          className="rounded-md border border-bull bg-bull/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-bull hover:bg-bull/25 disabled:opacity-50"
        >
          {m.isPending ? "Running…" : "Run Backtest"}
        </button>
      }
    >
      {/* Controls */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <Group label="Asset">
            {ASSETS.map((a) => (
              <Pill key={a} active={asset === a} onClick={() => setAsset(a)}>{a}</Pill>
            ))}
          </Group>
          <Group label="Interval">
            {INTERVALS.map((i) => (
              <Pill key={i} active={interval === i} onClick={() => setInterval(i)}>{i}</Pill>
            ))}
          </Group>
          <Group label="Candles">
            {[200, 500, 1000].map((n) => (
              <Pill key={n} active={limit === n} onClick={() => setLimit(n)}>{n}</Pill>
            ))}
          </Group>
        </div>

        <div className="flex flex-wrap gap-2">
          {STRATS.map((s) => (
            <button
              key={s.id}
              onClick={() => setStrategy(s.id)}
              className={`rounded-lg border px-3 py-2 text-left transition ${
                strategy === s.id
                  ? "border-[var(--neon-purple)] bg-[var(--neon-purple)]/10"
                  : "border-border bg-secondary/40 hover:bg-secondary/60"
              }`}
            >
              <div className="text-xs font-bold text-foreground">{s.label}</div>
              <div className="text-[10px] text-muted-foreground">{s.hint}</div>
            </button>
          ))}
        </div>

        {/* Strategy-specific params */}
        <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-secondary/30 p-3">
          {strategy === "sma_cross" && (
            <>
              <NumIn label="Fast SMA" value={fast} min={2} max={100} onChange={setFast} />
              <NumIn label="Slow SMA" value={slow} min={5} max={300} onChange={setSlow} />
            </>
          )}
          {strategy === "grid" && (
            <>
              <NumIn label="Levels" value={levels} min={3} max={30} onChange={setLevels} />
              <NumIn label="Range ±" value={rangePct} step={0.01} min={0.02} max={0.5} onChange={setRangePct} suffix="x" />
            </>
          )}
          {strategy === "dca" && (
            <>
              <NumIn label="Every N candles" value={everyN} min={1} max={200} onChange={setEveryN} />
              <NumIn label="Total buys" value={buys} min={2} max={100} onChange={setBuys} />
            </>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="mt-4">
        {m.isPending && <LoadingState label="Simulating…" />}
        {m.isError && <ErrorState label={m.error?.message ?? "Backtest failed"} />}
        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Strategy PnL" value={`${fmt(result.pnlPct)}%`} tone={result.pnlPct >= 0 ? "bull" : "bear"} />
              <Stat label="Buy & Hold" value={`${fmt(result.buyHoldPct)}%`} tone={result.buyHoldPct >= 0 ? "bull" : "bear"} />
              <Stat label="Outperformance" value={`${fmt(outperf)}%`} tone={outperf >= 0 ? "bull" : "bear"} />
              <Stat label="Sharpe" value={fmt(result.metrics.sharpe)} />
              <Stat label="Max Drawdown" value={`${fmt(result.metrics.maxDrawdownPct)}%`} tone="warn" />
              <Stat label="Win Rate" value={`${fmt(result.metrics.winRate * 100, 1)}%`} />
              <Stat label="Trades" value={String(result.metrics.totalTrades)} />
              <Stat label="Candles" value={String(result.candles)} />
            </div>

            <div className="h-[260px] w-full rounded-lg border border-border bg-secondary/20 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" minTickGap={32} />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                    formatter={(v: number) => `${fmt(v, 1)}`}
                  />
                  <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="strategy" stroke="hsl(var(--neon-purple))" strokeWidth={2} dot={false} name="Strategy" />
                  <Line type="monotone" dataKey="buyHold" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={false} name="Buy & Hold" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {result.trades.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-secondary/20">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-card/95 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold">Time</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Side</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Price</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.slice(-50).reverse().map((tr, idx) => (
                      <tr key={idx} className="border-t border-border/50">
                        <td className="px-2 py-1 text-muted-foreground">{new Date(tr.t).toLocaleString()}</td>
                        <td className={`px-2 py-1 font-bold ${tr.side === "BUY" ? "text-bull" : "text-bear"}`}>{tr.side}</td>
                        <td className="px-2 py-1 text-right">{fmt(tr.price, 4)}</td>
                        <td className="px-2 py-1 text-right">{fmt(tr.qty, 6)}</td>
                        <td className="px-2 py-1 text-muted-foreground">{tr.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-[10px]">
              <Chip tone="default">{result.asset} · {result.interval}</Chip>
              <Chip tone="default">Start ${fmt(result.startPrice)}</Chip>
              <Chip tone="default">End ${fmt(result.endPrice)}</Chip>
              <Chip tone="default">Final Equity ${fmt(result.metrics.finalEquity)}</Chip>
            </div>
          </div>
        )}
        {!result && !m.isPending && !m.isError && (
          <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-6 text-center text-xs text-muted-foreground">
            Pick a strategy and click <span className="font-bold text-bull">Run Backtest</span> to simulate against historical Binance candles.
          </div>
        )}
      </div>
    </Panel>
  );
}

// ──────────── tiny inline UI helpers ────────────
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
        active ? "border-bull bg-bull/15 text-bull" : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function NumIn({
  label, value, onChange, min, max, step, suffix,
}: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:border-bull focus:outline-none"
        />
        {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" | "warn" }) {
  const color = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "warn" ? "text-warn" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}
