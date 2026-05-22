import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Radio, Search, ShieldAlert } from "lucide-react";
import { Panel, Chip } from "./Panel";
import { fmtUSD, timeAgo } from "@/lib/whale/format";
import { useBinanceWhaleStream, type WhaleTrade } from "@/hooks/useBinanceWhaleStream";
import { cn } from "@/lib/utils";

type Tab = "ALL" | "BUYS" | "SELLS" | "MEGA";
type SymbolFilter = "ALL" | "BTC" | "ETH" | "SOL";

const tierFor = (size: number) =>
  size >= 5_000_000 ? { icon: "🐋", label: "MEGA" }
  : size >= 1_000_000 ? { icon: "🦈", label: "SHARK" }
  : { icon: "🐟", label: "FISH" };

export function WhaleTracker() {
  const [minUsd, setMinUsd] = useState(100_000);
  const { trades, connected } = useBinanceWhaleStream(minUsd, 150);
  const [tab, setTab] = useState<Tab>("ALL");
  const [sym, setSym] = useState<SymbolFilter>("ALL");

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (sym !== "ALL" && t.asset !== sym) return false;
      if (tab === "BUYS") return t.side === "BUY";
      if (tab === "SELLS") return t.side === "SELL";
      if (tab === "MEGA") return t.sizeUsd >= 5_000_000;
      return true;
    });
  }, [trades, tab, sym]);

  // Cascade detection: 3+ mega trades in same direction within 60s
  const cascade = useMemo(() => {
    const recent = filtered.filter((t) => t.sizeUsd >= 1_000_000 && Date.now() - t.tradeTime < 60_000);
    const buys = recent.filter((t) => t.side === "BUY");
    const sells = recent.filter((t) => t.side === "SELL");
    if (buys.length >= 3) return { side: "BUY" as const, count: buys.length, total: buys.reduce((s, t) => s + t.sizeUsd, 0) };
    if (sells.length >= 3) return { side: "SELL" as const, count: sells.length, total: sells.reduce((s, t) => s + t.sizeUsd, 0) };
    return null;
  }, [filtered]);

  const summary = useMemo(() => {
    const oneHourAgo = Date.now() - 60 * 60_000;
    const recent = trades.filter((t) => t.tradeTime > oneHourAgo);
    const buyVol = recent.filter((t) => t.side === "BUY").reduce((s, t) => s + t.sizeUsd, 0);
    const sellVol = recent.filter((t) => t.side === "SELL").reduce((s, t) => s + t.sizeUsd, 0);
    const biggest = [...recent].sort((a, b) => b.sizeUsd - a.sizeUsd)[0];
    return { buyVol, sellVol, biggest, bias: buyVol >= sellVol ? "BUY" : "SELL" as const };
  }, [trades]);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "ALL", label: "All Trades" },
    { key: "BUYS", label: "Buys" },
    { key: "SELLS", label: "Sells" },
    { key: "MEGA", label: "🐋 Mega ≥$5M" },
  ];

  return (
    <Panel
      title="Live Whale Trades"
      subtitle="Real-time aggregated trades from Binance · WebSocket stream"
      accent="purple"
      action={
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 py-1">
            <Radio className={cn("h-3 w-3", connected ? "text-bull pulse-dot" : "text-bear")} />
            <span className="text-[10px] uppercase font-bold tracking-wider">{connected ? "Live" : "Reconnecting"}</span>
          </div>
          <select
            value={sym}
            onChange={(e) => setSym(e.target.value as SymbolFilter)}
            className="rounded-md border border-border bg-secondary px-2 py-1 text-xs font-mono"
          >
            <option value="ALL">All</option>
            <option value="BTC">BTC</option>
            <option value="ETH">ETH</option>
            <option value="SOL">SOL</option>
          </select>
          <select
            value={minUsd}
            onChange={(e) => setMinUsd(Number(e.target.value))}
            className="rounded-md border border-border bg-secondary px-2 py-1 text-xs font-mono"
          >
            <option value={100_000}>≥ $100K</option>
            <option value={500_000}>≥ $500K</option>
            <option value={1_000_000}>≥ $1M</option>
            <option value={5_000_000}>≥ $5M</option>
          </select>
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
      {cascade && (
        <div className={cn(
          "mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 row-danger",
          cascade.side === "BUY" ? "border-bull/60 bg-bull/10" : "border-bear/60 bg-bear/10",
        )}>
          <ShieldAlert className={cn("h-5 w-5", cascade.side === "BUY" ? "text-bull" : "text-bear")} />
          <div className="flex-1">
            <div className={cn("text-sm font-bold", cascade.side === "BUY" ? "text-bull" : "text-bear")}>
              ⚡ WHALE CASCADE — {cascade.side}
            </div>
            <div className="text-xs text-muted-foreground">
              {cascade.count} large {cascade.side === "BUY" ? "buys" : "sells"} (≥$1M) within 60s · total {fmtUSD(cascade.total)}
            </div>
          </div>
        </div>
      )}

      {/* Hourly summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 font-mono text-xs">
        <Stat label="Buy Volume (1h)" value={fmtUSD(summary.buyVol)} tone="bull" />
        <Stat label="Sell Volume (1h)" value={fmtUSD(summary.sellVol)} tone="bear" />
        <Stat label="Net Bias" value={summary.bias} tone={summary.bias === "BUY" ? "bull" : "bear"} />
        <Stat label="Biggest" value={summary.biggest ? fmtUSD(summary.biggest.sizeUsd) : "—"} />
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-xs font-mono min-w-[640px]">
          <thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">Time</th>
              <th className="px-2 py-2 text-left">Tier</th>
              <th className="px-2 py-2 text-left">Asset</th>
              <th className="px-2 py-2 text-left">Side</th>
              <th className="px-2 py-2 text-right">Size</th>
              <th className="px-2 py-2 text-right">Price</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-left">Exchange</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => <TradeRow key={t.id} t={t} />)}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-muted-foreground">
                  <Search className="mx-auto h-6 w-6 opacity-50" />
                  <div className="mt-2">
                    {connected ? "Waiting for whale activity above threshold…" : "Connecting to Binance stream…"}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function TradeRow({ t }: { t: WhaleTrade }) {
  const tier = tierFor(t.sizeUsd);
  const mega = t.sizeUsd >= 5_000_000;
  return (
    <tr className={cn(
      "border-b border-border/60 transition-colors hover:bg-card-hover",
      mega && "row-warn",
    )}>
      <td className="px-2 py-2 text-muted-foreground">{timeAgo(t.tradeTime)}</td>
      <td className="px-2 py-2"><span className="text-base" title={tier.label}>{tier.icon}</span></td>
      <td className="px-2 py-2 font-bold">{t.asset}</td>
      <td className="px-2 py-2">
        {t.side === "BUY"
          ? <Chip tone="bull"><ArrowUpRight className="h-3 w-3" />BUY</Chip>
          : <Chip tone="bear"><ArrowDownRight className="h-3 w-3" />SELL</Chip>}
      </td>
      <td className="px-2 py-2 text-right font-semibold">{fmtUSD(t.sizeUsd)}</td>
      <td className="px-2 py-2 text-right">${t.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
      <td className="px-2 py-2 text-right text-muted-foreground">{t.quantity.toFixed(4)}</td>
      <td className="px-2 py-2 text-muted-foreground uppercase">{t.exchange}</td>
    </tr>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "bull" | "bear" }) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-bold mt-0.5", tone === "bull" && "text-bull", tone === "bear" && "text-bear")}>{value}</div>
    </div>
  );
}
