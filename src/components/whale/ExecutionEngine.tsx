import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Panel, Chip } from "./Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  getBestPrice,
  simulateSmartOrder,
  analyzeTradeJournal,
} from "@/lib/whale/execution.functions";

type OrderType = "TWAP" | "VWAP" | "ICEBERG";
type Side = "buy" | "sell";
const ASSETS = ["BTC", "ETH", "SOL", "BNB", "LTC", "XRP"] as const;

type Trade = {
  id: string;
  ts: number;
  asset: string;
  side: Side;
  qty: number;
  type: OrderType;
  avgFill: number;
  arrival: number;
  slippageBps: number;
  venue?: string;
  note?: string;
  pnlPct?: number | null;
};

type RiskCfg = {
  maxLossPerDayUsd: number;
  maxPositionUsd: number;
  maxDrawdownPct: number;
  correlationGuard: boolean;
  emergencyStop: boolean;
};

const RISK_KEY = "exec.risk.cfg.v1";
const JOURNAL_KEY = "exec.journal.v1";

const defaultRisk: RiskCfg = {
  maxLossPerDayUsd: 500,
  maxPositionUsd: 5000,
  maxDrawdownPct: 10,
  correlationGuard: true,
  emergencyStop: false,
};

function loadRisk(): RiskCfg {
  if (typeof window === "undefined") return defaultRisk;
  try {
    const raw = localStorage.getItem(RISK_KEY);
    return raw ? { ...defaultRisk, ...JSON.parse(raw) } : defaultRisk;
  } catch {
    return defaultRisk;
  }
}
function saveRisk(c: RiskCfg) {
  try { localStorage.setItem(RISK_KEY, JSON.stringify(c)); } catch { /* noop */ }
}
function loadJournal(): Trade[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]"); } catch { return []; }
}
function saveJournal(j: Trade[]) {
  try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(j.slice(0, 100))); } catch { /* noop */ }
}

function fmt(n: number, d = 2) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

export function ExecutionEngine() {
  const [risk, setRisk] = useState<RiskCfg>(defaultRisk);
  const [journal, setJournal] = useState<Trade[]>([]);
  useEffect(() => { setRisk(loadRisk()); setJournal(loadJournal()); }, []);

  // order form
  const [asset, setAsset] = useState<string>("BTC");
  const [side, setSide] = useState<Side>("buy");
  const [qty, setQty] = useState(0.1);
  const [type, setType] = useState<OrderType>("TWAP");
  const [slices, setSlices] = useState(10);
  const [intervalMin, setIntervalMin] = useState(5);
  const [note, setNote] = useState("");

  const bestFn = useServerFn(getBestPrice);
  const simFn = useServerFn(simulateSmartOrder);
  const aiFn = useServerFn(analyzeTradeJournal);

  const best = useMutation({ mutationFn: () => bestFn({ data: { asset, side, qty } }) });
  const sim = useMutation({
    mutationFn: () => simFn({ data: { asset, side, totalQty: qty, type, slices, intervalMin } }),
  });
  const ai = useMutation({
    mutationFn: () => aiFn({ data: { trades: journal.slice(0, 30).map(t => ({
      asset: t.asset, side: t.side, qty: t.qty, avgFill: t.avgFill,
      type: t.type, slippageBps: t.slippageBps, pnlPct: t.pnlPct ?? null,
      note: t.note, ts: t.ts,
    })) } }),
  });

  // Pre-trade risk check
  const notional = useMemo(() => {
    const px = best.data?.best?.price ?? sim.data?.arrival ?? 0;
    return px * qty;
  }, [best.data, sim.data, qty]);

  const todayPnl = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return journal
      .filter(t => t.ts >= start.getTime() && t.pnlPct != null)
      .reduce((s, t) => s + (t.pnlPct! / 100) * (t.avgFill * t.qty), 0);
  }, [journal]);

  const riskWarnings = useMemo(() => {
    const w: string[] = [];
    if (risk.emergencyStop) w.push("🛑 EMERGENCY STOP active — execution blocked");
    if (notional > risk.maxPositionUsd) w.push(`⚠️ Position $${fmt(notional, 0)} exceeds max $${fmt(risk.maxPositionUsd, 0)}`);
    if (todayPnl < -risk.maxLossPerDayUsd) w.push(`⚠️ Daily loss $${fmt(Math.abs(todayPnl), 0)} exceeds limit $${fmt(risk.maxLossPerDayUsd, 0)}`);
    return w;
  }, [risk, notional, todayPnl]);

  const canExecute = riskWarnings.length === 0;

  function commitTrade() {
    if (!sim.data || !canExecute) return;
    const t: Trade = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      asset, side, qty,
      type,
      avgFill: sim.data.avgFill,
      arrival: sim.data.arrival,
      slippageBps: sim.data.slippageBps,
      venue: best.data?.best?.name,
      note: note || undefined,
      pnlPct: null,
    };
    const next = [t, ...journal];
    setJournal(next); saveJournal(next);
    setNote("");
  }

  function updateRisk(patch: Partial<RiskCfg>) {
    const next = { ...risk, ...patch };
    setRisk(next); saveRisk(next);
  }

  function setPnl(id: string, pct: number) {
    const next = journal.map(t => t.id === id ? { ...t, pnlPct: pct } : t);
    setJournal(next); saveJournal(next);
  }

  function delTrade(id: string) {
    const next = journal.filter(t => t.id !== id);
    setJournal(next); saveJournal(next);
  }

  return (
    <Panel
      title="⚡ Execution Engine"
      subtitle="Multi-exchange routing · Smart orders · Risk limits · Trade journal"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Risk Config */}
        <div className="rounded-lg border border-border bg-card/40 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold uppercase tracking-wider text-[var(--neon-purple)]">Risk Limits</h4>
            <Switch
              checked={risk.emergencyStop}
              onCheckedChange={(v) => updateRisk({ emergencyStop: v })}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">Emergency stop: {risk.emergencyStop ? "🛑 ARMED" : "✅ off"}</p>

          <div>
            <Label className="text-[11px]">Max loss / day (USD)</Label>
            <Input type="number" value={risk.maxLossPerDayUsd}
              onChange={(e) => updateRisk({ maxLossPerDayUsd: +e.target.value })} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[11px]">Max position (USD)</Label>
            <Input type="number" value={risk.maxPositionUsd}
              onChange={(e) => updateRisk({ maxPositionUsd: +e.target.value })} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[11px]">Max drawdown (%)</Label>
            <Input type="number" value={risk.maxDrawdownPct}
              onChange={(e) => updateRisk({ maxDrawdownPct: +e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Correlation guard</Label>
            <Switch checked={risk.correlationGuard}
              onCheckedChange={(v) => updateRisk({ correlationGuard: v })} />
          </div>

          <div className="border-t border-border pt-2 text-[11px] space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Today PnL</span>
              <span className={todayPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>${fmt(todayPnl, 2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Open notional</span>
              <span>${fmt(notional, 2)}</span></div>
          </div>
        </div>

        {/* Order Form */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card/40 p-3 space-y-3">
          <h4 className="text-sm font-bold uppercase tracking-wider text-[var(--neon-blue)]">Smart Order</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <Label className="text-[11px]">Asset</Label>
              <select value={asset} onChange={(e) => setAsset(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Side</Label>
              <select value={side} onChange={(e) => setSide(e.target.value as Side)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                <option value="buy">BUY</option>
                <option value="sell">SELL</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Qty</Label>
              <Input type="number" step="0.001" value={qty}
                onChange={(e) => setQty(+e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[11px]">Order type</Label>
              <select value={type} onChange={(e) => setType(e.target.value as OrderType)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                <option value="TWAP">TWAP</option>
                <option value="VWAP">VWAP</option>
                <option value="ICEBERG">Iceberg</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Slices</Label>
              <Input type="number" value={slices} min={2} max={50}
                onChange={(e) => setSlices(+e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[11px]">Interval (min)</Label>
              <Input type="number" value={intervalMin} min={1} max={60}
                onChange={(e) => setIntervalMin(+e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-[11px]">Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Setup, reason..." className="h-8 text-xs" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => best.mutate()} disabled={best.isPending}>
              {best.isPending ? "Routing…" : "🌐 Find Best Price"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => sim.mutate()} disabled={sim.isPending}>
              {sim.isPending ? "Simulating…" : `🧪 Simulate ${type}`}
            </Button>
            <Button size="sm" onClick={commitTrade} disabled={!sim.data || !canExecute}
              className="bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)]">
              ✅ Log Execution
            </Button>
          </div>

          {riskWarnings.length > 0 && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-200 space-y-1">
              {riskWarnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          {best.data && (
            <div className="rounded-md border border-border bg-background/50 p-2 text-[11px]">
              <div className="font-semibold mb-1">Multi-Exchange Routing</div>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                {best.data.venues.map(v => (
                  <div key={v.name} className={`flex justify-between rounded px-2 py-1 ${best.data!.best?.name === v.name ? "bg-emerald-500/20 border border-emerald-500/40" : "bg-card/40"}`}>
                    <span>{v.name}</span>
                    <span>{v.price != null ? fmt(v.price) : "—"}</span>
                  </div>
                ))}
              </div>
              {best.data.best && (
                <div className="mt-2 text-emerald-300">
                  Best: <b>{best.data.best.name}</b> @ {fmt(best.data.best.price)} · Save ~{best.data.savingsBps}bps
                </div>
              )}
            </div>
          )}

          {sim.data && (
            <div className="rounded-md border border-border bg-background/50 p-2 text-[11px]">
              <div className="flex flex-wrap gap-2 mb-2">
                <Chip>Avg fill: {fmt(sim.data.avgFill)}</Chip>
                <Chip>Arrival: {fmt(sim.data.arrival)}</Chip>
                <Chip>Slippage: {sim.data.slippageBps}bps</Chip>
                <Chip>Filled: {fmt(sim.data.totalQty, 4)} {asset}</Chip>
              </div>
              <div className="max-h-32 overflow-y-auto">
                <table className="w-full text-[10px]">
                  <thead className="text-muted-foreground"><tr><th className="text-left">#</th><th className="text-left">Time</th><th className="text-right">Price</th><th className="text-right">Qty</th></tr></thead>
                  <tbody>
                    {sim.data.fills.map((f, i) => (
                      <tr key={i} className="border-t border-border/30">
                        <td>{i + 1}</td>
                        <td>{new Date(f.time).toLocaleTimeString()}</td>
                        <td className="text-right">{fmt(f.price)}</td>
                        <td className="text-right">{fmt(f.qty, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {(best.error || sim.error) && (
            <div className="text-[11px] text-rose-400">{String(best.error || sim.error)}</div>
          )}
        </div>
      </div>

      {/* Journal */}
      <div className="mt-4 rounded-lg border border-border bg-card/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold uppercase tracking-wider text-[var(--neon-purple)]">📓 Trade Journal ({journal.length})</h4>
          <Button size="sm" variant="outline" onClick={() => ai.mutate()}
            disabled={journal.length === 0 || ai.isPending}>
            {ai.isPending ? "Analyzing…" : "🤖 AI Coach Review (Bangla)"}
          </Button>
        </div>

        {ai.data && (
          <div className="mb-3 rounded-md border border-[var(--neon-purple)]/30 bg-[var(--neon-purple)]/5 p-3 text-xs whitespace-pre-wrap">
            {ai.data.analysis}
          </div>
        )}
        {ai.error && <div className="mb-2 text-[11px] text-rose-400">{String(ai.error)}</div>}

        {journal.length === 0 ? (
          <p className="text-xs text-muted-foreground">No trades yet. Simulate & log an execution above.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left">Time</th>
                  <th className="text-left">Trade</th>
                  <th className="text-right">Avg</th>
                  <th className="text-right">Slip</th>
                  <th className="text-right">PnL %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {journal.map(t => (
                  <tr key={t.id} className="border-t border-border/30">
                    <td className="py-1">{new Date(t.ts).toLocaleString()}</td>
                    <td>
                      <Badge variant={t.side === "buy" ? "default" : "destructive"} className="mr-1">{t.side}</Badge>
                      {fmt(t.qty, 4)} {t.asset} · {t.type}
                      {t.venue && <span className="ml-1 text-muted-foreground">@{t.venue}</span>}
                      {t.note && <div className="text-[10px] text-muted-foreground italic">{t.note}</div>}
                    </td>
                    <td className="text-right">{fmt(t.avgFill)}</td>
                    <td className={`text-right ${t.slippageBps > 5 ? "text-rose-400" : "text-emerald-400"}`}>{t.slippageBps}bps</td>
                    <td className="text-right">
                      <Input type="number" step="0.01" value={t.pnlPct ?? ""}
                        onChange={(e) => setPnl(t.id, +e.target.value)}
                        className="h-6 w-16 text-[10px] text-right inline-block" />
                    </td>
                    <td className="text-right">
                      <button onClick={() => delTrade(t.id)} className="text-rose-400 hover:underline text-[10px]">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}
