import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Activity, Zap, TrendingUp, TrendingDown, Wifi,
  Rocket, AlertTriangle, Hourglass, Wallet, Star, ChevronUp, ChevronDown, Radio,
  Flame, Scale, Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { subscribeBinanceStream } from "@/lib/whale/binanceStream";

// ─────────────────────────────────────────────────────────────
// Watchlist — real Binance symbols (work for both spot & futures perps)
// ─────────────────────────────────────────────────────────────
const WATCHLIST = ["SUIUSDT", "SOLUSDT", "TIAUSDT", "SEIUSDT", "INJUSDT"];
const ANCHOR_LIST = ["BTCUSDT", "ETHUSDT"];

const NAMES: Record<string, string> = {
  SUIUSDT: "Sui",
  SOLUSDT: "Solana",
  TIAUSDT: "Celestia",
  SEIUSDT: "Sei",
  INJUSDT: "Injective",
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
};

const HOLDINGS = [{ symbol: "SUIUSDT", display: "SUI", qty: 412.5, avg: 0.7598 }];

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type SignalKind = "LONG" | "SHORT" | "HOLD";
type Mode = "spot" | "futures";

interface Ticker {
  symbol: string;
  price: number;
  change24h: number;
  high: number;
  low: number;
  prev: number;
  flash: "up" | "down" | null;
  flashAt: number;
  history: number[];
}

interface FuturesMeta {
  funding: number;        // current funding rate (e.g. 0.0001 = 0.01%)
  oi: number;             // current open interest (base units)
  oiChange24h: number;    // % change in OI vs 24h ago
  longShortRatio: number; // long/short account ratio
  longPct: number;        // 0..100
}

interface BinanceTicker {
  s: string; c: string; P: string; h: string; l: string; o: string;
}

interface BinanceMarkPrice {
  s: string; p: string; r: string; // mark price + funding rate
}

// ─────────────────────────────────────────────────────────────
// Indicators
// ─────────────────────────────────────────────────────────────
function rsiFromHistory(prices: number[]): number {
  if (prices.length < 8) return 50;
  let gains = 0, losses = 0, n = 0;
  for (let i = 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) gains += d; else losses -= d;
    n++;
  }
  if (n === 0) return 50;
  const avgG = gains / n;
  const avgL = losses / n;
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

function ema(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = prices[0];
  for (let i = 1; i < prices.length; i++) e = prices[i] * k + e * (1 - k);
  return e;
}

function macdBias(t: Ticker): "GOLDEN" | "BEARISH" | "NEUTRAL" {
  if (t.history.length < 12) return "NEUTRAL";
  const fast = ema(t.history, 6);
  const slow = ema(t.history, 13);
  const diff = (fast - slow) / slow;
  if (diff > 0.001 && t.change24h > 0) return "GOLDEN";
  if (diff < -0.001 && t.change24h < 0) return "BEARISH";
  return "NEUTRAL";
}

function volBreakout(t: Ticker): boolean {
  if (!t.high || !t.low || t.high === t.low) return false;
  const pos = (t.price - t.low) / (t.high - t.low);
  return pos > 0.8 && t.change24h > 0;
}

// Liquidation risk: price hugging extreme of 24h range with imbalanced leverage
function liquidationRisk(t: Ticker, meta?: FuturesMeta): { hot: boolean; side: "LONG" | "SHORT" | null } {
  if (!meta || !t.high || !t.low || t.high === t.low) return { hot: false, side: null };
  const pos = (t.price - t.low) / (t.high - t.low);
  // Longs trapped near top with positive funding & long-skewed crowd
  if (pos > 0.92 && meta.funding > 0.0001 && meta.longShortRatio > 1.4) return { hot: true, side: "LONG" };
  // Shorts trapped near bottom with negative funding & short-skewed crowd
  if (pos < 0.08 && meta.funding < -0.0001 && meta.longShortRatio < 0.7) return { hot: true, side: "SHORT" };
  return { hot: false, side: null };
}

function deriveSignal(
  t: Ticker,
  meta?: FuturesMeta,
): { kind: SignalKind; prob: number; target: number; rsi: number } {
  const rsi = rsiFromHistory(t.history);
  const macd = macdBias(t);

  // Futures-aware adjustments
  let bias = 0; // negative = bearish lean, positive = bullish lean
  if (meta) {
    // Over-leveraged longs + positive funding → bearish for swing
    if (meta.funding > 0.0002) bias -= 8;
    if (meta.funding < -0.0002) bias += 8;
    if (meta.longShortRatio > 1.6) bias -= 6;
    if (meta.longShortRatio < 0.7) bias += 6;
    // OI rising with price = trend confirmation
    if (meta.oiChange24h > 5 && t.change24h > 0) bias += 5;
    if (meta.oiChange24h > 5 && t.change24h < 0) bias -= 5; // shorts piling
  }

  if (rsi > 75 && macd === "BEARISH") {
    const prob = Math.min(97, 70 + (rsi - 75) * 2 - bias);
    return { kind: "SHORT", prob: Math.round(prob), target: +(t.price * (1 - (rsi - 70) / 400)).toFixed(6), rsi };
  }
  if (rsi < 40 && macd === "GOLDEN" && volBreakout(t)) {
    const prob = Math.min(97, 72 + (40 - rsi) * 1.6 + bias);
    return { kind: "LONG", prob: Math.round(prob), target: +(t.price * (1 + (45 - rsi) / 250)).toFixed(6), rsi };
  }
  // Strong futures-only signals (no TA confluence but extreme positioning)
  if (meta && bias <= -12 && t.change24h > 3) {
    return { kind: "SHORT", prob: 68, target: +(t.price * 0.97).toFixed(6), rsi };
  }
  if (meta && bias >= 12 && t.change24h < -3) {
    return { kind: "LONG", prob: 68, target: +(t.price * 1.03).toFixed(6), rsi };
  }
  return { kind: "HOLD", prob: 50, target: t.price, rsi };
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
const LivePing = memo(function LivePing({ connected, ping, mode }: { connected: boolean; ping: number; mode: Mode }) {
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-md border px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider",
      connected
        ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
        : "border-amber-500/40 bg-amber-500/5 text-amber-400",
    )}>
      <span className="relative flex h-2 w-2">
        {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", connected ? "bg-emerald-400" : "bg-amber-400")} />
      </span>
      <Wifi size={11} />
      <span>{connected ? `Binance ${mode === "futures" ? "Futures" : "Spot"} WS` : "Connecting…"}</span>
      <span className="opacity-60">·</span>
      <span className="tabular-nums">{ping}ms</span>
    </div>
  );
});

function SignalBadge({ kind, prob }: { kind: SignalKind; prob: number }) {
  if (kind === "SHORT") {
    return (
      <Badge className="gap-1.5 rounded-md border border-red-500/50 bg-red-500/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-red-400 shadow-[0_0_14px_rgba(239,68,68,0.45)] animate-pulse">
        <AlertTriangle size={11} />
        SWING SHORT · {prob}%
      </Badge>
    );
  }
  if (kind === "LONG") {
    return (
      <Badge className="gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.45)] animate-pulse">
        <Rocket size={11} />
        SWING LONG · {prob}%
      </Badge>
    );
  }
  return (
    <Badge className="gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
      <Hourglass size={11} />
      HOLD / ACCUMULATE
    </Badge>
  );
}

function FlashPrice({ price, flash, digits }: { price: number; flash: Ticker["flash"]; digits?: number }) {
  const d = digits ?? (price < 1 ? 4 : price < 100 ? 3 : 2);
  return (
    <span
      className={cn(
        "font-mono tabular-nums font-bold transition-colors duration-500",
        flash === "up" && "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.65)]",
        flash === "down" && "text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.65)]",
        !flash && "text-foreground",
      )}
    >
      ${price.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}
    </span>
  );
}

function LongShortBar({ longPct }: { longPct: number }) {
  const shortPct = 100 - longPct;
  return (
    <div className="flex w-24 flex-col gap-0.5">
      <div className="flex h-1.5 w-full overflow-hidden rounded-sm bg-background/60">
        <div className="bg-emerald-500/70 shadow-[0_0_6px_rgba(16,185,129,0.6)]" style={{ width: `${longPct}%` }} />
        <div className="bg-red-500/70 shadow-[0_0_6px_rgba(239,68,68,0.6)]" style={{ width: `${shortPct}%` }} />
      </div>
      <div className="flex justify-between font-mono text-[9px] tabular-nums">
        <span className="text-emerald-400">{longPct.toFixed(0)}%</span>
        <span className="text-red-400">{shortPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export function SwingSignalEngine() {
  const [mode, setMode] = useState<Mode>("spot");
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [anchors, setAnchors] = useState<Record<string, Ticker>>({});
  const [futMeta, setFutMeta] = useState<Record<string, FuturesMeta>>({});
  const [connected, setConnected] = useState(false);
  const [ping, setPing] = useState(0);
  const tickCountRef = useRef(0);
  const lastTickRef = useRef(Date.now());

  // Reset state on mode switch so we don't mix spot/futures prices
  useEffect(() => {
    setTickers({});
    setAnchors({});
    setConnected(false);
    tickCountRef.current = 0;
    lastTickRef.current = Date.now();
  }, [mode]);

  // Subscribe to price tickers (spot OR futures depending on mode)
  useEffect(() => {
    const host = mode; // "spot" | "futures"
    const handle = (target: "watch" | "anchor", sym: string) => (raw: unknown) => {
      const d = raw as BinanceTicker;
      const price = parseFloat(d.c);
      const change24h = parseFloat(d.P);
      const high = parseFloat(d.h);
      const low = parseFloat(d.l);
      if (!isFinite(price)) return;

      const now = Date.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      tickCountRef.current++;
      if (tickCountRef.current % 8 === 0) setPing(Math.max(5, Math.min(120, delta)));
      if (!connected) setConnected(true);

      const setter = target === "watch" ? setTickers : setAnchors;
      setter((prev) => {
        const existing = prev[sym];
        const prevPrice = existing?.price ?? price;
        const flash: Ticker["flash"] =
          price > prevPrice ? "up" : price < prevPrice ? "down" : existing?.flash ?? null;
        const history = existing ? [...existing.history, price].slice(-30) : [price];
        return {
          ...prev,
          [sym]: { symbol: sym, price, change24h, high, low, prev: prevPrice, flash, flashAt: now, history },
        };
      });
    };

    const unsubs: Array<() => void> = [];
    for (const s of WATCHLIST) {
      unsubs.push(subscribeBinanceStream(host, `${s.toLowerCase()}@ticker`, handle("watch", s)));
    }
    for (const s of ANCHOR_LIST) {
      unsubs.push(subscribeBinanceStream(host, `${s.toLowerCase()}@ticker`, handle("anchor", s)));
    }
    return () => { unsubs.forEach((u) => u()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Subscribe to mark price stream (futures only) for live funding rate
  useEffect(() => {
    if (mode !== "futures") return;
    const unsubs = WATCHLIST.map((s) =>
      subscribeBinanceStream("futures", `${s.toLowerCase()}@markPrice@1s`, (raw) => {
        const d = raw as BinanceMarkPrice;
        const funding = parseFloat(d.r);
        if (!isFinite(funding)) return;
        setFutMeta((prev) => ({
          ...prev,
          [s]: { ...(prev[s] ?? { oi: 0, oiChange24h: 0, longShortRatio: 1, longPct: 50 }), funding },
        }));
      }),
    );
    return () => { unsubs.forEach((u) => u()); };
  }, [mode]);

  // Poll REST for OI + long/short ratio (futures only)
  useEffect(() => {
    if (mode !== "futures") return;
    let cancelled = false;

    const fetchMeta = async (sym: string) => {
      try {
        const [oiHistRes, lsRes] = await Promise.all([
          fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=1h&limit=25`),
          fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=5m&limit=1`),
        ]);
        if (!oiHistRes.ok || !lsRes.ok) return;
        const oiHist = (await oiHistRes.json()) as Array<{ sumOpenInterest: string }>;
        const ls = (await lsRes.json()) as Array<{ longShortRatio: string; longAccount: string }>;
        if (cancelled || oiHist.length === 0 || ls.length === 0) return;
        const oiNow = parseFloat(oiHist[oiHist.length - 1].sumOpenInterest);
        const oi24hAgo = parseFloat(oiHist[0].sumOpenInterest);
        const oiChange24h = oi24hAgo > 0 ? ((oiNow - oi24hAgo) / oi24hAgo) * 100 : 0;
        const lsRatio = parseFloat(ls[0].longShortRatio);
        const longPct = parseFloat(ls[0].longAccount) * 100;
        setFutMeta((prev) => ({
          ...prev,
          [sym]: {
            funding: prev[sym]?.funding ?? 0,
            oi: oiNow,
            oiChange24h,
            longShortRatio: lsRatio,
            longPct,
          },
        }));
      } catch { /* silent */ }
    };

    const run = () => WATCHLIST.forEach(fetchMeta);
    run();
    const id = setInterval(run, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [mode]);

  // Clear flash highlights
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const clear = (prev: Record<string, Ticker>) => {
        let changed = false;
        const next: Record<string, Ticker> = {};
        for (const k in prev) {
          const t = prev[k];
          if (t.flash && now - t.flashAt > 700) { next[k] = { ...t, flash: null }; changed = true; }
          else next[k] = t;
        }
        return changed ? next : prev;
      };
      setTickers(clear);
      setAnchors(clear);
    }, 350);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(
    () => WATCHLIST.map((s) => tickers[s]).filter(Boolean).sort((a, b) => b.change24h - a.change24h),
    [tickers],
  );

  const portfolio = useMemo(() => {
    const h = HOLDINGS[0];
    const t = tickers[h.symbol];
    const curr = t?.price ?? h.avg;
    const value = h.qty * curr;
    const cost = h.qty * h.avg;
    const pnl = value - cost;
    const pnlPct = (pnl / cost) * 100;
    return { current: curr, flash: t?.flash ?? null, value, pnl, pnlPct };
  }, [tickers]);

  const loading = rows.length === 0;
  const isFut = mode === "futures";

  const fmtOI = useCallback((oi: number, price: number) => {
    const usd = oi * price;
    if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
    if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
    return `$${(usd / 1e3).toFixed(0)}K`;
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-background/40 to-red-500/5 p-3 shadow-[0_0_24px_rgba(16,185,129,0.08)]">
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-1.5">
            <Zap size={16} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="font-mono text-sm font-bold uppercase tracking-[0.18em] text-foreground">
              Swing Signal Engine
            </h2>
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Binance Live WS · RSI + MACD + {isFut ? "Funding / OI / L/S" : "Spot Confluence"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Spot vs Futures switcher */}
          <div className="flex rounded-md border border-border/60 bg-background/40 p-0.5 font-mono text-[10px] font-bold uppercase tracking-wider">
            <button
              onClick={() => setMode("spot")}
              className={cn(
                "rounded px-3 py-1 transition-all",
                mode === "spot"
                  ? "bg-emerald-500/20 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.35)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Spot
            </button>
            <button
              onClick={() => setMode("futures")}
              className={cn(
                "rounded px-3 py-1 transition-all",
                mode === "futures"
                  ? "bg-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.35)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Futures (Perp)
            </button>
          </div>
          <LivePing connected={connected} ping={ping} mode={mode} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        {/* Signals */}
        <Card className="border-border/60 bg-card/40 backdrop-blur">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              <Radio size={12} className="text-emerald-400 animate-pulse" />
              Watchlist · Sorted by 24h Gain
            </div>
            <Badge variant="outline" className="font-mono text-[9px] uppercase">
              {isFut ? "Binance Futures · Perpetual" : "Binance Spot"}
            </Badge>
          </div>

          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60 hover:bg-transparent">
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">Token</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">Price</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">24h %</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">RSI</TableHead>
                    {isFut && <TableHead className="font-mono text-[10px] uppercase tracking-wider">Fund</TableHead>}
                    {isFut && <TableHead className="font-mono text-[10px] uppercase tracking-wider">OI Δ24h</TableHead>}
                    {isFut && <TableHead className="font-mono text-[10px] uppercase tracking-wider">L/S</TableHead>}
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">Signal</TableHead>
                    <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => {
                    const meta = isFut ? futMeta[t.symbol] : undefined;
                    const sig = deriveSignal(t, meta);
                    const liq = liquidationRisk(t, meta);
                    const isShort = sig.kind === "SHORT";
                    const isLong = sig.kind === "LONG";
                    const pair = `${t.symbol.replace("USDT", "")}/USDT`;
                    return (
                      <TableRow key={t.symbol} className="border-border/40 hover:bg-emerald-500/[0.03]">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold tracking-wider">{pair}</span>
                            <span className="text-[10px] text-muted-foreground">{NAMES[t.symbol]}</span>
                            {liq.hot && (
                              <Badge className="mt-1 w-fit gap-1 rounded-sm border border-orange-500/50 bg-orange-500/10 px-1.5 py-0 font-mono text-[8px] font-bold uppercase tracking-wider text-orange-300 shadow-[0_0_10px_rgba(249,115,22,0.45)] animate-pulse">
                                <Flame size={9} />
                                Liq Risk · {liq.side}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell><FlashPrice price={t.price} flash={t.flash} /></TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 font-mono text-xs font-bold tabular-nums",
                              t.change24h >= 0 ? "text-emerald-400" : "text-red-400",
                            )}
                          >
                            {t.change24h >= 0 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {Math.abs(t.change24h).toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "font-mono text-xs font-bold tabular-nums",
                              sig.rsi > 75 ? "text-red-400" : sig.rsi < 40 ? "text-emerald-400" : "text-amber-400",
                            )}
                          >
                            {sig.rsi.toFixed(1)}
                          </span>
                        </TableCell>
                        {isFut && (
                          <TableCell>
                            {meta ? (
                              <span className={cn(
                                "inline-flex items-center gap-0.5 font-mono text-[11px] font-bold tabular-nums",
                                meta.funding > 0.0001 ? "text-red-400" : meta.funding < -0.0001 ? "text-emerald-400" : "text-muted-foreground",
                              )}>
                                <Percent size={9} />
                                {(meta.funding * 100).toFixed(4)}
                              </span>
                            ) : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                          </TableCell>
                        )}
                        {isFut && (
                          <TableCell>
                            {meta ? (
                              <div className="flex flex-col leading-tight">
                                <span className={cn(
                                  "font-mono text-[11px] font-bold tabular-nums",
                                  meta.oiChange24h >= 0 ? "text-emerald-400" : "text-red-400",
                                )}>
                                  {meta.oiChange24h >= 0 ? "+" : ""}{meta.oiChange24h.toFixed(1)}%
                                </span>
                                <span className="font-mono text-[9px] text-muted-foreground">{fmtOI(meta.oi, t.price)}</span>
                              </div>
                            ) : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                          </TableCell>
                        )}
                        {isFut && (
                          <TableCell>
                            {meta ? <LongShortBar longPct={meta.longPct} /> : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                          </TableCell>
                        )}
                        <TableCell><SignalBadge kind={sig.kind} prob={sig.prob} /></TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            className={cn(
                              "h-7 gap-1 rounded-md font-mono text-[10px] font-bold uppercase tracking-wider",
                              isShort && "bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/40",
                              isLong && "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/40",
                              !isShort && !isLong && "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-border/60",
                            )}
                          >
                            <Zap size={11} />
                            Quick {isShort ? "Short" : isLong ? "Long" : "Trade"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="border-emerald-500/30 bg-card/40 p-4 shadow-[0_0_20px_rgba(16,185,129,0.08)]">
            <div className="mb-3 flex items-center gap-2">
              <Wallet size={14} className="text-emerald-400" />
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                Mini Portfolio
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground">Total Value</div>
                <div className="font-mono text-xl font-bold tabular-nums text-foreground">
                  ${portfolio.value.toFixed(2)}
                </div>
              </div>
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase">
                  <span className="font-bold tracking-wider text-emerald-400">SUI · {isFut ? "PERP" : "SPOT"}</span>
                  <span className="text-muted-foreground">{HOLDINGS[0].qty} units</span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <div className="text-muted-foreground">Avg Buy</div>
                    <div className="font-mono font-bold tabular-nums">${HOLDINGS[0].avg.toFixed(4)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Live</div>
                    <FlashPrice price={portfolio.current} flash={portfolio.flash} digits={4} />
                  </div>
                </div>
                <div className="mt-2 border-t border-emerald-500/20 pt-1.5">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">Unrealized PnL</div>
                  <div
                    className={cn(
                      "font-mono text-sm font-bold tabular-nums",
                      portfolio.pnl >= 0
                        ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.55)]"
                        : "text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.55)]",
                    )}
                  >
                    {portfolio.pnl >= 0 ? "+" : ""}${portfolio.pnl.toFixed(2)} ({portfolio.pnlPct.toFixed(1)}%)
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Futures Market Intelligence panel */}
          {isFut && (
            <Card className="border-amber-500/30 bg-card/40 p-4 shadow-[0_0_20px_rgba(245,158,11,0.08)]">
              <div className="mb-3 flex items-center gap-2">
                <Scale size={14} className="text-amber-400" />
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                  Futures Intel · L/S Ratio
                </span>
              </div>
              <div className="space-y-2">
                {WATCHLIST.map((s) => {
                  const m = futMeta[s];
                  return (
                    <div key={s} className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5">
                      <span className="font-mono text-[11px] font-bold tracking-wider">{s.replace("USDT", "")}</span>
                      {m ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{m.longShortRatio.toFixed(2)}x</span>
                          <LongShortBar longPct={m.longPct} />
                        </div>
                      ) : <Skeleton className="h-4 w-24" />}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="border-border/60 bg-card/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Star size={14} className="text-amber-400" />
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                Market Anchors
              </span>
            </div>
            <div className="space-y-2">
              {ANCHOR_LIST.map((s) => {
                const a = anchors[s];
                return (
                  <div
                    key={s}
                    className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-2.5 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Activity size={12} className="text-muted-foreground" />
                      <div>
                        <div className="font-mono text-xs font-bold tracking-wider">{s.replace("USDT", "")}</div>
                        <div className="text-[9px] text-muted-foreground">{NAMES[s]}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      {a ? (
                        <>
                          <FlashPrice price={a.price} flash={a.flash} digits={2} />
                          <div
                            className={cn(
                              "flex items-center justify-end gap-0.5 font-mono text-[10px] font-bold",
                              a.change24h >= 0 ? "text-emerald-400" : "text-red-400",
                            )}
                          >
                            {a.change24h >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {Math.abs(a.change24h).toFixed(2)}%
                          </div>
                        </>
                      ) : (
                        <Skeleton className="h-8 w-20" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="border-border/60 bg-card/40 p-3">
            <Tabs defaultValue="watch">
              <TabsList className="grid w-full grid-cols-2 bg-background/40">
                <TabsTrigger value="watch" className="font-mono text-[10px] uppercase">Watchlist</TabsTrigger>
                <TabsTrigger value="recent" className="font-mono text-[10px] uppercase">Recent</TabsTrigger>
              </TabsList>
              <TabsContent value="watch" className="mt-2 space-y-1.5">
                {rows.slice(0, 5).map((t) => (
                  <div key={t.symbol} className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-background/40">
                    <span className="font-mono font-bold">{t.symbol.replace("USDT", "")}</span>
                    <FlashPrice price={t.price} flash={t.flash} />
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="recent" className="mt-2 text-[10px] font-mono text-muted-foreground">
                No recent trades.
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default SwingSignalEngine;
