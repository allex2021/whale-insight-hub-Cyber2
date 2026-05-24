import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Radio, Volume2, VolumeX } from "lucide-react";
import { Panel } from "./Panel";
import { EmptyState } from "./StateView";
import { type WhaleTrade, type WhaleAsset } from "@/hooks/useBinanceWhaleStream";
import { useMultiExchangeWhaleStream } from "@/hooks/useMultiExchangeWhaleStream";
import { EXCHANGE_META, type ExchangeId } from "@/lib/whale/multiExchangeStream";
import { useSymbolFilter } from "@/hooks/useSymbolFilter";
import { useWhaleAlertSound } from "@/hooks/useWhaleAlertSound";
import { classifyWhaleIntent, type ClassifyResult } from "@/lib/whale/noiseFilter";
import { cn } from "@/lib/utils";


const SYMBOL_MAP: Record<string, WhaleAsset> = {
  BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL", LTCUSDT: "LTC",
  BNBUSDT: "BNB", XRPUSDT: "XRP", ADAUSDT: "ADA", DOGEUSDT: "DOGE", AVAXUSDT: "AVAX",
};

async function fetchRecentWhales(minUsd: number): Promise<WhaleTrade[]> {
  const symbols = Object.keys(SYMBOL_MAP);
  const results = await Promise.allSettled(
    symbols.map(async (sym) => {
      const r = await fetch(`https://api.binance.com/api/v3/aggTrades?symbol=${sym}&limit=500`);
      if (!r.ok) return [] as WhaleTrade[];
      const arr = (await r.json()) as Array<{ a: number; p: string; q: string; m: boolean; T: number }>;
      return arr
        .map((t): WhaleTrade => {
          const price = parseFloat(t.p);
          const quantity = parseFloat(t.q);
          return {
            id: `${sym}-${t.a}`,
            asset: SYMBOL_MAP[sym],
            side: t.m ? "SELL" : "BUY",
            price, quantity, sizeUsd: price * quantity,
            tradeTime: t.T,
            exchange: "binance",
          };
        })
        .filter((t) => t.sizeUsd >= minUsd);
    }),
  );
  return results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.tradeTime - a.tradeTime);
}


const TIERS = [
  { v: 100_000, label: "$100K+" },
  { v: 500_000, label: "$500K+" },
  { v: 1_000_000, label: "$1M+" },
  { v: 2_000_000, label: "$2M+" },
] as const;

function fmtUsd(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const EXCHANGES: ExchangeId[] = ["binance", "bybit", "okx", "hyperliquid"];

export function WhaleActivityFeed() {
  const [tier, setTier] = useState<number>(100_000);
  const [mounted, setMounted] = useState(false);
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeId | "ALL">("ALL");
  const [impactOnly, setImpactOnly] = useState(true);
  const { trades: liveTrades, status } = useMultiExchangeWhaleStream(tier, 200);
  const { selected } = useSymbolFilter();
  const { speakTrade, muted, toggleMuted } = useWhaleAlertSound();
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => { setMounted(true); }, []);

  // Bootstrap with recent REST trades (Binance) so the feed is never empty on mount.
  const { data: seedTrades } = useQuery({
    queryKey: ["whale-seed", tier],
    queryFn: () => fetchRecentWhales(tier),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const merged = useMemo<WhaleTrade[]>(() => {
    const map = new Map<string, WhaleTrade>();
    for (const t of liveTrades) map.set(t.id, t);
    for (const t of seedTrades ?? []) if (!map.has(t.id)) map.set(t.id, t);
    return Array.from(map.values()).sort((a, b) => b.tradeTime - a.tradeTime).slice(0, 200);
  }, [liveTrades, seedTrades]);

  // Play buy/sell sound on new live trades only (skip backfill on first mount)
  useEffect(() => {
    if (!liveTrades.length) return;
    const isFirst = seenIds.current.size === 0;
    for (const t of liveTrades) {
      if (seenIds.current.has(t.id)) continue;
      seenIds.current.add(t.id);
      if (isFirst) continue;
      // speakTrade auto-falls back to beep when voice is disabled
      speakTrade(t.side as "BUY" | "SELL", t.asset, t.sizeUsd);
    }
    if (seenIds.current.size > 800) {
      seenIds.current = new Set(liveTrades.map((t) => t.id));
    }
  }, [liveTrades, speakTrade]);


  const classified = useMemo(
    () =>
      merged.map((t) => ({
        trade: t,
        intent: classifyWhaleIntent({
          sizeUsd: t.sizeUsd,
          side: t.side,
          exchange: t.exchange,
        }),
      })),
    [merged],
  );

  const symbolFiltered = useMemo(
    () =>
      classified.filter(
        ({ trade: t }) =>
          selected.includes(t.asset as never) &&
          (exchangeFilter === "ALL" || t.exchange === exchangeFilter),
      ),
    [classified, selected, exchangeFilter],
  );

  const noiseCount = useMemo(() => symbolFiltered.filter((c) => c.intent.isNoise).length, [symbolFiltered]);
  const filtered = useMemo(
    () => (impactOnly ? symbolFiltered.filter((c) => !c.intent.isNoise) : symbolFiltered),
    [symbolFiltered, impactOnly],
  );

  const anyConnected = status.binance || status.bybit || status.okx || status.hyperliquid;


  const stats = useMemo(() => {
    let buys = 0, sells = 0, buyUsd = 0, sellUsd = 0;
    for (const t of filtered) {
      if (t.side === "BUY") { buys++; buyUsd += t.sizeUsd; }
      else { sells++; sellUsd += t.sizeUsd; }
    }
    const total = buys + sells;
    const buyPct = total ? (buys / total) * 100 : 50;
    const sellPct = total ? (sells / total) * 100 : 50;
    const totalUsd = buyUsd + sellUsd;
    const buyUsdPct = totalUsd ? (buyUsd / totalUsd) * 100 : 50;
    const sellUsdPct = totalUsd ? (sellUsd / totalUsd) * 100 : 50;
    const ratio = sells ? buys / sells : buys > 0 ? Infinity : 0;
    return { buys, sells, buyPct, sellPct, buyUsd, sellUsd, buyUsdPct, sellUsdPct, ratio };
  }, [filtered]);

  return (
    <Panel
      title="Live Whale Activity"
      subtitle={`${mounted ? filtered.length : 0} trades · L/S ${mounted ? stats.buys : 0}/${mounted ? stats.sells : 0}`}
      accent="purple"
      action={
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase">
            <Radio className={cn("h-3 w-3", anyConnected ? "text-bull animate-pulse" : "text-bear")} />
            <span className={anyConnected ? "text-bull" : "text-bear"}>{anyConnected ? "Live" : "Off"}</span>
          </span>
          <button
            onClick={toggleMuted}
            title={muted ? "Unmute buy/sell sounds" : "Mute buy/sell sounds"}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5 text-[var(--neon-purple)]" />}
          </button>
          {TIERS.map((t) => (
            <button
              key={t.v}
              onClick={() => setTier(t.v)}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[10px] transition-colors",
                tier === t.v
                  ? "bg-[var(--neon-purple)]/20 text-[var(--neon-purple)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {!mounted ? (
        <EmptyState label="Loading whale feed…" />
      ) : (
        <>
          <div className="mb-3 rounded-lg border border-border bg-gradient-to-br from-card to-secondary/40 p-3">
            <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide">
              <span className="flex items-center gap-1 text-bull">
                <ArrowUpRight className="h-3 w-3" /> Long {stats.buys}
              </span>
              <span className="font-mono text-muted-foreground">
                Ratio {stats.ratio === Infinity ? "∞" : stats.ratio.toFixed(2)}x
              </span>
              <span className="flex items-center gap-1 text-bear">
                Short {stats.sells} <ArrowDownRight className="h-3 w-3" />
              </span>
            </div>
            <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
              <span className="text-bull font-semibold">{stats.buyPct.toFixed(1)}%</span>
              <span className="text-muted-foreground text-[9px] uppercase">by count</span>
              <span className="text-bear font-semibold">{stats.sellPct.toFixed(1)}%</span>
            </div>
            <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-gradient-to-r from-bull to-bull/60" style={{ width: `${stats.buyPct}%` }} />
              <div className="h-full bg-gradient-to-r from-bear/60 to-bear" style={{ width: `${stats.sellPct}%` }} />
            </div>
            <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
              <span className="text-bull font-semibold">{fmtUsd(stats.buyUsd)} ({stats.buyUsdPct.toFixed(1)}%)</span>
              <span className="text-muted-foreground text-[9px] uppercase">by volume</span>
              <span className="text-bear font-semibold">({stats.sellUsdPct.toFixed(1)}%) {fmtUsd(stats.sellUsd)}</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-gradient-to-r from-bull to-bull/60" style={{ width: `${stats.buyUsdPct}%` }} />
              <div className="h-full bg-gradient-to-r from-bear/60 to-bear" style={{ width: `${stats.sellUsdPct}%` }} />
            </div>
          </div>

          {/* Exchange filter + per-exchange connection status */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setExchangeFilter("ALL")}
              className={cn(
                "rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase transition-colors border",
                exchangeFilter === "ALL"
                  ? "border-[var(--neon-purple)]/60 bg-[var(--neon-purple)]/20 text-[var(--neon-purple)]"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              All ({merged.length})
            </button>
            {EXCHANGES.map((ex) => {
              const meta = EXCHANGE_META[ex];
              const active = exchangeFilter === ex;
              const count = merged.filter((t) => t.exchange === ex).length;
              const live = status[ex];
              return (
                <button
                  key={ex}
                  onClick={() => setExchangeFilter(ex)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase transition-colors border",
                    active ? "bg-card text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  style={active ? { borderColor: meta.color, boxShadow: `0 0 8px ${meta.color}33` } : undefined}
                  title={`${meta.label} · ${live ? "connected" : "reconnecting"}`}
                >
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", live ? "animate-pulse" : "opacity-40")}
                    style={{ background: live ? meta.color : "#ef4444" }}
                  />
                  <span style={active ? { color: meta.color } : undefined}>{meta.label}</span>
                  <span className="opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <EmptyState label="Waiting for whale trades… they will appear here in seconds." />
          ) : (
        <div className="max-h-[420px] overflow-y-auto -mx-4">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card/95 backdrop-blur">
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-2 py-2 text-left font-medium">Exch</th>
                <th className="px-3 py-2 text-left font-medium">Asset</th>
                <th className="px-3 py-2 text-left font-medium">Side</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Size USD</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const meta = EXCHANGE_META[t.exchange];
                return (
                <tr key={t.id} className="border-b border-border/40 hover:bg-card-hover">
                  <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{ago(t.tradeTime)} ago</td>
                  <td className="px-2 py-2">
                    <span
                      className="inline-block rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase"
                      style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55` }}
                      title={meta.label}
                    >
                      {meta.label.slice(0, 3)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono font-bold">{t.asset}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] font-bold", t.side === "BUY" ? "text-bull" : "text-bear")}>
                      {t.side === "BUY" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {t.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                    ${t.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </td>
                  <td className={cn("px-3 py-2 text-right font-mono font-bold", t.side === "BUY" ? "text-bull" : "text-bear")}>
                    {fmtUsd(t.sizeUsd)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}
    </Panel>
  );
}
