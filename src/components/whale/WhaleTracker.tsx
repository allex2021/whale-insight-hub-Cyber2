import { useMemo, useState } from "react";
import { AlertTriangle, Flame, Search, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { Panel, Chip, Bar } from "./Panel";
import { buildMockWhales } from "@/lib/whale/mock";
import { fmtPrice, fmtUSD, liqDistancePct, timeAgo } from "@/lib/whale/format";
import type { Symbol, Whale } from "@/lib/whale/types";
import { cn } from "@/lib/utils";

const tierMeta = {
  MEGA: { icon: "🐋", label: "Mega" },
  SHARK: { icon: "🦈", label: "Shark" },
  BIGFISH: { icon: "🐟", label: "Fish" },
};

function scoreColor(s: number) {
  if (s >= 90) return "text-[var(--neon-purple)]";
  if (s >= 70) return "text-bull";
  if (s >= 50) return "text-[var(--neon-yellow)]";
  return "text-bear";
}

type Tab = "ALL" | "LONGS" | "SHORTS" | "LIQ" | "HOT";
type SymbolFilter = Symbol | "ALL";

export function WhaleTracker() {
  const allWhales = useMemo(() => buildMockWhales(), []);
  const [tab, setTab] = useState<Tab>("ALL");
  const [sym, setSym] = useState<SymbolFilter>("ALL");
  const [hideBots, setHideBots] = useState(true);

  const filtered = useMemo(() => {
    return allWhales.filter((w) => {
      if (sym !== "ALL" && w.symbol !== sym) return false;
      if (hideBots && w.smartScore < 35) return false;
      if (tab === "LONGS") return w.side === "LONG";
      if (tab === "SHORTS") return w.side === "SHORT";
      if (tab === "LIQ") return liqDistancePct(w.current, w.liqPrice) < 10;
      if (tab === "HOT") return w.smartScore >= 85;
      return true;
    });
  }, [allWhales, tab, sym, hideBots]);

  // Cascade detection
  const cascade = useMemo(() => {
    const dangerous = filtered.filter((w) => liqDistancePct(w.current, w.liqPrice) < 4);
    const totalRisk = dangerous.reduce((s, w) => s + w.size * w.leverage, 0);
    return { count: dangerous.length, totalRisk };
  }, [filtered]);

  // Hourly summary
  const oneHourAgo = Date.now() - 60 * 60_000;
  const summary = useMemo(() => {
    const recent = filtered.filter((w) => w.openedAt > oneHourAgo);
    const longs = recent.filter((w) => w.side === "LONG");
    const shorts = recent.filter((w) => w.side === "SHORT");
    const biggest = [...recent].sort((a, b) => b.size - a.size)[0];
    return { longs: longs.length, shorts: shorts.length, biggest, bias: longs.length >= shorts.length ? "LONG" : "SHORT" };
  }, [filtered, oneHourAgo]);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "ALL", label: "All Whales" },
    { key: "LONGS", label: "Longs" },
    { key: "SHORTS", label: "Shorts" },
    { key: "LIQ", label: "Near Liquidation" },
    { key: "HOT", label: "🔥 Hot Wallets" },
  ];

  return (
    <Panel
      title="Whale Tracker"
      subtitle="Real-time positions across major perp exchanges"
      accent="purple"
      action={
        <div className="flex items-center gap-2">
          <select
            value={sym}
            onChange={(e) => setSym(e.target.value as SymbolFilter)}
            className="rounded-md border border-border bg-secondary px-2 py-1 text-xs font-mono"
          >
            <option value="ALL">All Symbols</option>
            <option value="BTC">BTC</option>
            <option value="ETH">ETH</option>
            <option value="SOL">SOL</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={hideBots}
              onChange={(e) => setHideBots(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--neon-purple)]"
            />
            Hide bots
          </label>
        </div>
      }
    >
      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === t.key
                ? "border-[var(--neon-purple)] bg-[var(--neon-purple)]/15 text-[var(--neon-purple)]"
                : "border-border bg-secondary/50 text-muted-foreground hover:border-border-bright hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Cascade banner */}
      {cascade.count >= 3 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-bear/60 bg-bear/10 px-4 py-3 row-danger">
          <ShieldAlert className="h-5 w-5 text-bear" />
          <div className="flex-1">
            <div className="text-sm font-bold text-bear">⚠️ CASCADE RISK DETECTED</div>
            <div className="text-xs text-muted-foreground">
              {cascade.count} large positions clustered near liquidation — potential cascade of {fmtUSD(cascade.totalRisk)}
            </div>
          </div>
        </div>
      )}

      {/* Hourly summary */}
      <details className="mb-4 rounded-lg border border-border bg-secondary/40">
        <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs font-semibold">
          <span className="flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-[var(--neon-orange)]" />
            Last Hour Summary
          </span>
          <Chip tone={summary.bias === "LONG" ? "bull" : "bear"}>Net bias: {summary.bias}</Chip>
        </summary>
        <div className="grid grid-cols-2 gap-3 px-3 pb-3 text-xs md:grid-cols-4">
          <Stat label="New Longs" value={summary.longs} tone="bull" />
          <Stat label="New Shorts" value={summary.shorts} tone="bear" />
          <Stat label="Biggest Position" value={summary.biggest ? fmtUSD(summary.biggest.size) : "—"} />
          <Stat label="Biggest Wallet" value={summary.biggest?.alias ?? "—"} />
        </div>
      </details>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-xs font-mono">
          <thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Wallet</th>
              <th className="px-2 py-2 text-left">Tier</th>
              <th className="px-2 py-2 text-left">Sym</th>
              <th className="px-2 py-2 text-left">Side</th>
              <th className="px-2 py-2 text-right">Size</th>
              <th className="px-2 py-2 text-right">Lev</th>
              <th className="px-2 py-2 text-right">Entry</th>
              <th className="px-2 py-2 text-right">Current</th>
              <th className="px-2 py-2 text-right">PnL%</th>
              <th className="px-2 py-2 text-right">Liq Price</th>
              <th className="px-2 py-2 text-right">Liq Dist</th>
              <th className="px-2 py-2 text-center">Smart</th>
              <th className="px-2 py-2 text-left">AI</th>
              <th className="px-2 py-2 text-right">Active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w, i) => <WhaleRow key={w.id} w={w} index={i + 1} />)}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={15} className="py-10 text-center text-muted-foreground">
                  <Search className="mx-auto h-6 w-6 opacity-50" />
                  <div className="mt-2">No whales match this filter.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function aiVerdictFor(w: Whale) {
  const dist = liqDistancePct(w.current, w.liqPrice);
  if (dist < 5) return { text: "Overleveraged", tone: "bear" as const };
  if (w.leverage >= 20) return { text: "Risky Lev", tone: "warn" as const };
  if (w.smartScore >= 90) return { text: w.side === "LONG" ? "Bullish Entry" : "Bearish Entry", tone: "purple" as const };
  return { text: "Neutral", tone: "default" as const };
}

function WhaleRow({ w, index }: { w: Whale; index: number }) {
  const pnlPct = w.side === "LONG"
    ? ((w.current - w.entry) / w.entry) * 100
    : ((w.entry - w.current) / w.entry) * 100;
  const pnlUsd = w.size * (pnlPct / 100);
  const liqDist = liqDistancePct(w.current, w.liqPrice);
  const danger = liqDist < 5;
  const warn = !danger && liqDist < 10;
  const verdict = aiVerdictFor(w);

  return (
    <tr className={cn(
      "border-b border-border/60 transition-colors hover:bg-card-hover",
      danger && "row-danger", warn && "row-warn",
    )}>
      <td className="px-2 py-2 text-muted-foreground">{index}</td>
      <td className="px-2 py-2">
        <div className="flex flex-col leading-tight">
          <span className="text-foreground">{w.alias}</span>
          <span className="text-[10px] text-muted-foreground">{w.wallet}</span>
        </div>
      </td>
      <td className="px-2 py-2">
        <span className="text-base" title={tierMeta[w.tier].label}>{tierMeta[w.tier].icon}</span>
      </td>
      <td className="px-2 py-2 font-bold">{w.symbol}</td>
      <td className="px-2 py-2">
        {w.side === "LONG"
          ? <Chip tone="bull"><TrendingUp className="h-3 w-3" />LONG</Chip>
          : <Chip tone="bear"><TrendingDown className="h-3 w-3" />SHORT</Chip>}
      </td>
      <td className="px-2 py-2 text-right font-semibold">{fmtUSD(w.size)}</td>
      <td className="px-2 py-2 text-right">{w.leverage}x</td>
      <td className="px-2 py-2 text-right">{fmtPrice(w.entry)}</td>
      <td className="px-2 py-2 text-right">{fmtPrice(w.current)}</td>
      <td className={cn("px-2 py-2 text-right font-semibold", pnlPct >= 0 ? "text-bull" : "text-bear")}>
        {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
        <div className="text-[10px] opacity-70">{pnlUsd >= 0 ? "+" : "-"}{fmtUSD(Math.abs(pnlUsd))}</div>
      </td>
      <td className="px-2 py-2 text-right">{fmtPrice(w.liqPrice)}</td>
      <td className={cn("px-2 py-2 text-right font-bold", danger ? "text-bear" : warn ? "text-[var(--neon-orange)]" : "text-muted-foreground")}>
        {liqDist.toFixed(1)}%
        {danger && <div className="text-[9px]"><AlertTriangle className="inline h-3 w-3" /> DANGER</div>}
      </td>
      <td className="px-2 py-2 text-center">
        <div className={cn("font-bold", scoreColor(w.smartScore))}>{w.smartScore}</div>
        <div className="mt-1 w-12 mx-auto">
          <Bar value={w.smartScore} tone={w.smartScore >= 90 ? "purple" : w.smartScore >= 70 ? "bull" : "bear"} />
        </div>
      </td>
      <td className="px-2 py-2"><Chip tone={verdict.tone}>🤖 {verdict.text}</Chip></td>
      <td className="px-2 py-2 text-right text-muted-foreground">{timeAgo(w.openedAt)}</td>
    </tr>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "bull" | "bear" }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-bold", tone === "bull" && "text-bull", tone === "bear" && "text-bear")}>{value}</div>
    </div>
  );
}
