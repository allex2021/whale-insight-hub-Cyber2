import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, Chip } from "./Panel";
import { SkeletonLoader } from "./SkeletonLoader";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { generateMasterAISignal } from "@/lib/whale/masterSignal.functions";
import { computeMasterSignal, type MasterInputs, type MasterSignal } from "@/lib/whale/masterSignal";
import { ArrowDownRight, ArrowUpRight, Brain, Check, Loader2, Minus, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Asset = "BTC" | "ETH" | "SOL";
const ASSETS: Asset[] = ["BTC", "ETH", "SOL"];

interface AssetState {
  asset: Asset;
  loading: boolean;
  price?: number;
  signal?: MasterSignal;
  inputs?: MasterInputs;
  error?: string;
}

interface AIVerdict {
  verdict: "AGREE" | "DISAGREE" | "UPGRADE" | "DOWNGRADE" | "CAUTION";
  summary: string;
  keyRisk: string;
  bullishFactors: string[];
  bearishFactors: string[];
  suggestedConfidence: number;
}

async function fetchAll(asset: Asset): Promise<{ inputs: MasterInputs; signal: MasterSignal }> {
  const sym = `${asset}USDT`;
  const [funding, lsRes, depthRes, oiCur, oiPrev, fg, ticker, klines, whales] = await Promise.allSettled([
    fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`).then((r) => r.json()),
    fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=1h&limit=1`).then((r) => r.json()),
    fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${sym}&limit=20`).then((r) => r.json()),
    fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=5m&limit=1`).then((r) => r.json()),
    fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=5m&limit=13`).then((r) => r.json()),
    fetch(`https://api.alternative.me/fng/?limit=1`).then((r) => r.json()),
    fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`).then((r) => r.json()),
    fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1d&limit=14`).then((r) => r.json()),
    supabase
      .from("whale_trades")
      .select("side, size_usd")
      .eq("asset", asset)
      .gte("trade_time", new Date(Date.now() - 6 * 3600 * 1000).toISOString()),
  ]);

  const fundingRate = funding.status === "fulfilled" ? parseFloat(funding.value.lastFundingRate || "0") : 0;
  const price = funding.status === "fulfilled" ? parseFloat(funding.value.markPrice || "0") : 0;

  const lsArr = lsRes.status === "fulfilled" ? lsRes.value : [];
  const longShortRatio = Array.isArray(lsArr) && lsArr[0] ? parseFloat(lsArr[0].longShortRatio || "1") : 1;

  let obImb = 0;
  if (depthRes.status === "fulfilled" && depthRes.value?.bids) {
    const bidSum = (depthRes.value.bids as [string, string][]).reduce((s, [_, q]) => s + parseFloat(q), 0);
    const askSum = (depthRes.value.asks as [string, string][]).reduce((s, [_, q]) => s + parseFloat(q), 0);
    if (bidSum + askSum > 0) obImb = (bidSum - askSum) / (bidSum + askSum);
  }

  let oiChange = 0;
  if (oiCur.status === "fulfilled" && oiPrev.status === "fulfilled") {
    const cur = Array.isArray(oiCur.value) && oiCur.value[0] ? parseFloat(oiCur.value[0].sumOpenInterest) : 0;
    const prevArr = oiPrev.value;
    const prev = Array.isArray(prevArr) && prevArr[0] ? parseFloat(prevArr[0].sumOpenInterest) : 0;
    if (prev > 0) oiChange = ((cur - prev) / prev) * 100;
  }

  const fgIndex = fg.status === "fulfilled" && fg.value?.data?.[0] ? parseInt(fg.value.data[0].value, 10) : 50;
  const priceChange24h = ticker.status === "fulfilled" ? parseFloat(ticker.value.priceChangePercent || "0") : 0;

  // ATR estimate from 14d klines (true range simplified to high-low/close)
  let atrPct = 2.5;
  if (klines.status === "fulfilled" && Array.isArray(klines.value)) {
    const ranges = klines.value.map((k: string[]) => {
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);
      const close = parseFloat(k[4]);
      return close > 0 ? ((high - low) / close) * 100 : 0;
    });
    if (ranges.length) atrPct = ranges.reduce((a: number, b: number) => a + b, 0) / ranges.length;
  }

  let buyCount = 0, sellCount = 0, buyUsd = 0, sellUsd = 0;
  if (whales.status === "fulfilled" && Array.isArray(whales.value.data)) {
    for (const w of whales.value.data) {
      const u = Number(w.size_usd) || 0;
      if (w.side === "BUY") { buyCount++; buyUsd += u; }
      else if (w.side === "SELL") { sellCount++; sellUsd += u; }
    }
  }

  // Reuse rule-based confluence math inline (mirror of ConfluenceScore)
  let confluence = 50;
  const frBp = fundingRate * 10000;
  if (fundingRate > 0.0001) confluence -= Math.min(20, Math.abs(frBp));
  else if (fundingRate < -0.0001) confluence += Math.min(20, Math.abs(frBp));
  if (longShortRatio > 1.5) confluence -= 10;
  else if (longShortRatio < 0.7) confluence += 15;
  confluence += Math.round(obImb * 15);
  if (fgIndex < 20) confluence += 10;
  else if (fgIndex > 80) confluence -= 10;
  if (oiChange > 3) confluence += 5;
  else if (oiChange < -3) confluence -= 5;
  const tot = buyCount + sellCount;
  if (tot >= 5) {
    if (buyCount > sellCount * 1.3) confluence += 15;
    else if (sellCount > buyCount * 1.3) confluence -= 15;
  }
  confluence = Math.max(0, Math.min(100, Math.round(confluence)));

  const inputs: MasterInputs = {
    asset, price,
    confluenceScore: confluence,
    fundingRate, longShortRatio,
    orderBookImbalance: obImb,
    fearGreedIndex: fgIndex,
    openInterestChange1h: oiChange,
    whaleBuyCount: buyCount, whaleSellCount: sellCount,
    whaleNetUsd: buyUsd - sellUsd,
    priceChange24h, atrPct,
  };
  const signal = computeMasterSignal(inputs);
  return { inputs, signal };
}

function dirIcon(d: MasterSignal["direction"]) {
  if (d === "LONG") return <ArrowUpRight className="h-7 w-7" />;
  if (d === "SHORT") return <ArrowDownRight className="h-7 w-7" />;
  return <Minus className="h-7 w-7" />;
}

function dirColor(d: MasterSignal["direction"]) {
  if (d === "LONG") return "var(--bull)";
  if (d === "SHORT") return "var(--bear)";
  return "var(--neon-blue)";
}

export function MasterSignal() {
  const [states, setStates] = useState<Record<Asset, AssetState>>({
    BTC: { asset: "BTC", loading: true },
    ETH: { asset: "ETH", loading: true },
    SOL: { asset: "SOL", loading: true },
  });
  const [selected, setSelected] = useState<Asset>("BTC");
  const [mode, setMode] = useState<"SPOT" | "FUTURES">("FUTURES");
  const [tick, setTick] = useState(0);
  const [aiVerdict, setAiVerdict] = useState<Record<Asset, AIVerdict | undefined>>({ BTC: undefined, ETH: undefined, SOL: undefined });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const firedRef = useRef<Set<string>>(new Set());

  const callAI = useServerFn(generateMasterAISignal);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(ASSETS.map(async (a) => {
        try {
          const { inputs, signal } = await fetchAll(a);
          return { asset: a, inputs, signal };
        } catch (e) {
          return { asset: a, error: e instanceof Error ? e.message : String(e) };
        }
      }));
      if (cancelled) return;
      setStates((prev) => {
        const next = { ...prev };
        for (const r of results) {
          next[r.asset] = { asset: r.asset, loading: false, price: r.inputs?.price, inputs: r.inputs, signal: r.signal, error: r.error };
        }
        return next;
      });

      // Auto-alert on high-conviction signals
      for (const r of results) {
        if (!r.signal || r.signal.direction === "NEUTRAL") continue;
        if (r.signal.confidence < 80) continue;
        const key = `${r.asset}:${r.signal.direction}:${Math.floor(Date.now() / (15 * 60 * 1000))}`;
        if (firedRef.current.has(key)) continue;
        firedRef.current.add(key);
        toast.success(`🐋 Master Signal: ${r.signal.headline}`, {
          description: `Entry $${r.signal.entry.toLocaleString()} · Target $${r.signal.target.toLocaleString()} · Stop $${r.signal.stop.toLocaleString()} · RR ${r.signal.rr}`,
          duration: 12_000,
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("master-signal-fired", { detail: r.signal }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const current = states[selected];
  const sig = current.signal;
  const verdict = aiVerdict[selected];

  const runAI = useCallback(async () => {
    if (!current.inputs || !sig) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const v = await callAI({ data: {
        asset: selected,
        price: current.inputs.price,
        direction: sig.direction,
        confidence: sig.confidence,
        confluenceScore: current.inputs.confluenceScore,
        fundingRate: current.inputs.fundingRate,
        longShortRatio: current.inputs.longShortRatio,
        orderBookImbalance: current.inputs.orderBookImbalance,
        fearGreedIndex: current.inputs.fearGreedIndex,
        openInterestChange1h: current.inputs.openInterestChange1h,
        whaleNetUsd: current.inputs.whaleNetUsd,
        whaleBuyCount: current.inputs.whaleBuyCount,
        whaleSellCount: current.inputs.whaleSellCount,
        priceChange24h: current.inputs.priceChange24h,
      } });
      setAiVerdict((p) => ({ ...p, [selected]: v }));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  }, [callAI, current.inputs, selected, sig]);

  const color = useMemo(() => sig ? dirColor(sig.direction) : "var(--muted)", [sig]);

  return (
    <Panel
      title="Master Signal"
      subtitle="Unified trade call · Confluence + Whales + Derivs + Sentiment · auto-fires at ≥80% conviction"
      accent="purple"
      className="master-signal-glow"
      action={
        <>
          <div className="flex gap-0.5 rounded-md border border-border bg-secondary/40 p-0.5">
            {(["SPOT", "FUTURES"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                  mode === m ? "bg-[var(--neon-blue)]/30 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-md border border-border bg-secondary/40 p-0.5">
            {ASSETS.map((a) => {
              const s = states[a].signal;
              const c = s ? dirColor(s.direction) : "var(--muted)";
              return (
                <button
                  key={a}
                  onClick={() => setSelected(a)}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold transition-colors",
                    selected === a ? "bg-[var(--neon-purple)]/30 text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {a}
                  {s && (
                    <span className="font-mono" style={{ color: c }}>{s.direction === "NEUTRAL" ? "—" : s.confidence}</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setTick((t) => t + 1)}
            className="rounded-md border border-border bg-secondary/40 p-1 text-muted-foreground hover:text-foreground"
            aria-label="refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </>
      }
    >
      {current.error && !sig && (
        <div className="flex items-center gap-2 rounded-md border border-bear/40 bg-bear/10 p-3 text-xs text-bear">
          <TriangleAlert className="h-4 w-4" /> {current.error}
        </div>
      )}
      {current.loading && !sig && <SkeletonLoader variant="hero" />}
      {sig && current.inputs && (
        <div className="space-y-2">
          {/* Hero row */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[auto_1fr_auto]">
            {/* Direction badge */}
            <div
              className="flex flex-col items-center justify-center rounded-lg border-2 px-4 py-2"
              style={{ borderColor: color, backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)` }}
            >
              <div className="flex items-center gap-1.5 font-bold" style={{ color }}>
                {dirIcon(sig.direction)}
                <span className="text-lg">{sig.direction}</span>
              </div>
              <div className="mt-0.5 font-mono text-2xl font-bold tabular-nums" style={{ color }}>
                {sig.confidence}<span className="text-sm opacity-70">%</span>
              </div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">conviction</div>
            </div>

            {/* Trade plan — Targets card */}
            <TargetsCard
              mode={mode}
              direction={sig.direction}
              entry={sig.entry}
              stop={sig.stop}
              currentPrice={current.inputs.price}
              horizon={sig.horizon}
              rr={sig.rr}
              confidence={sig.confidence}
            />

            {/* AI button */}
            <div className="flex flex-col items-stretch justify-center gap-1.5">
              <button
                onClick={runAI}
                disabled={aiLoading}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--neon-purple)]/50 bg-gradient-to-br from-[var(--neon-purple)]/20 to-[var(--neon-blue)]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-foreground transition-all hover:from-[var(--neon-purple)]/30 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] disabled:opacity-60"
              >
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {verdict ? "Re-analyze" : "AI Analysis"}
              </button>
              {verdict && (
                <Chip tone={
                  verdict.verdict === "AGREE" || verdict.verdict === "UPGRADE" ? "bull" :
                  verdict.verdict === "DISAGREE" || verdict.verdict === "DOWNGRADE" ? "bear" : "warn"
                }>
                  AI: {verdict.verdict}
                </Chip>
              )}
            </div>
          </div>

          {/* Reasons */}
          <div>
            <div className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
              Top drivers ({sig.reasons.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {sig.reasons.map((r, i) => (
                <Chip key={i} tone={r.bias === "BULL" ? "bull" : r.bias === "BEAR" ? "bear" : "default"}>
                  {r.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* AI verdict panel */}
          {aiError && (
            <div className="flex items-center gap-2 rounded-md border border-bear/40 bg-bear/10 p-2 text-xs text-bear">
              <TriangleAlert className="h-4 w-4" /> {aiError}
            </div>
          )}
          {verdict && (
            <div className="rounded-lg border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/5 p-2 space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--neon-purple)]">
                <Brain className="h-3 w-3" /> AI Strategist
                <span className="ml-auto font-mono text-foreground">
                  Suggested: {verdict.suggestedConfidence}%
                </span>
              </div>
              <p className="text-xs leading-relaxed text-foreground">{verdict.summary}</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {verdict.bullishFactors.length > 0 && (
                  <div>
                    <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-bull">Bullish</div>
                    <ul className="space-y-0 text-[10px]">
                      {verdict.bullishFactors.map((f, i) => <li key={i} className="text-muted-foreground">▲ {f}</li>)}
                    </ul>
                  </div>
                )}
                {verdict.bearishFactors.length > 0 && (
                  <div>
                    <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-bear">Bearish</div>
                    <ul className="space-y-0 text-[10px]">
                      {verdict.bearishFactors.map((f, i) => <li key={i} className="text-muted-foreground">▼ {f}</li>)}
                    </ul>
                  </div>
                )}
              </div>
              <div className="rounded border border-[var(--neon-orange)]/30 bg-[var(--neon-orange)]/5 px-2 py-1 text-[10px]">
                <span className="font-bold text-[var(--neon-orange)]">Key risk:</span>{" "}
                <span className="text-foreground">{verdict.keyRisk}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "default" | "bull" | "bear" | "purple" }) {
  const colorMap = {
    default: "text-foreground border-border",
    bull: "text-bull border-bull/40",
    bear: "text-bear border-bear/40",
    purple: "text-[var(--neon-purple)] border-[var(--neon-purple)]/40",
  };
  return (
    <div className={cn("rounded-lg border bg-secondary/30 p-2", colorMap[tone])}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

function fmtPrice(p: number) {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(3);
  return p.toFixed(5);
}

const TARGET_STEPS_FUTURES = [0.03, 0.06, 0.12, 0.24];
const TARGET_STEPS_SPOT = [0.05, 0.12, 0.25, 0.50];

function suggestLeverage(confidence: number): number {
  if (confidence >= 85) return 10;
  if (confidence >= 70) return 5;
  if (confidence >= 55) return 3;
  return 2;
}

function TargetsCard({
  mode, direction, entry, stop, currentPrice, horizon, rr, confidence,
}: {
  mode: "SPOT" | "FUTURES";
  direction: "LONG" | "SHORT" | "NEUTRAL";
  entry: number; stop: number; currentPrice: number; horizon: string; rr: number; confidence: number;
}) {
  const isLong = direction === "LONG";
  const isShort = direction === "SHORT";
  const isSpot = mode === "SPOT";

  // Spot is buy-only — invert SHORT to "AVOID / WAIT" in spot mode
  const spotLockout = isSpot && isShort;
  const sideLabel = spotLockout
    ? "AVOID"
    : isLong ? "BUY" : isShort ? "SELL/SHORT" : "WATCH";
  const sideClass = spotLockout
    ? "bg-bear/60 text-background"
    : isLong
    ? "bg-bull/80 text-background"
    : isShort
    ? "bg-bear/80 text-background"
    : "bg-muted text-foreground";

  const steps = isSpot ? TARGET_STEPS_SPOT : TARGET_STEPS_FUTURES;
  const spotHorizon = isSpot
    ? (horizon.includes("h") ? "3-14d" : horizon === "1-3d" ? "1-4w" : horizon)
    : horizon;

  const targets = steps.map((pct, i) => {
    const price = isShort ? entry * (1 - pct) : entry * (1 + pct);
    const hit = isLong
      ? currentPrice >= price
      : isShort
      ? currentPrice <= price
      : false;
    return { idx: i + 1, pct, price, hit };
  });

  const stopHit = isLong ? currentPrice <= stop : isShort ? currentPrice >= stop : false;
  const lev = suggestLeverage(confidence);

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-2 space-y-1.5">
      {/* Mode chip */}
      <div className="flex items-center justify-between">
        <span className={cn(
          "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
          isSpot ? "bg-[var(--neon-blue)]/20 text-[var(--neon-blue)]" : "bg-[var(--neon-purple)]/20 text-[var(--neon-purple)]",
        )}>
          {mode}
        </span>
        <span className="text-[9px] text-muted-foreground">
          {isSpot ? "No leverage · cash" : `Lev: ${lev}x`}
        </span>
      </div>

      {/* Top: BUY price + Capital + horizon */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className={cn("flex items-center justify-center rounded-md py-1 text-xs font-bold tracking-wide", sideClass)}>
          {sideLabel}: {fmtPrice(entry)}
        </div>
        <div className="flex items-center justify-center rounded-md bg-[var(--neon-orange)]/30 py-1 text-xs font-semibold text-[var(--neon-orange)]">
          {isSpot ? "Cap: 5%" : "Cap: 2%"} · {spotHorizon}
        </div>
      </div>

      {/* Targets */}
      <div className="space-y-1">
        {targets.map((t) => (
          <div
            key={t.idx}
            className={cn(
              "flex items-center justify-between rounded-md border px-2 py-1 text-xs",
              t.hit
                ? "border-bull/60 bg-bull/10"
                : "border-border bg-background/40",
            )}
          >
            <span className="font-semibold text-foreground">
              T0{t.idx}
            </span>
            <span className="font-mono tabular-nums text-foreground">
              {fmtPrice(t.price)}
            </span>
            <span className="flex items-center gap-1 font-mono font-bold text-bull">
              {Math.round(t.pct * 100)}%
              {t.hit && (
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-bull text-background">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Stoploss */}
      <div
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-md py-1 text-xs font-bold tracking-wide",
          stopHit ? "bg-bear text-background" : "bg-bear/80 text-background",
        )}
      >
        SL: {fmtPrice(stop)}
        {stopHit && <span className="text-[9px] uppercase">· hit</span>}
        <span className="ml-1.5 text-[9px] font-normal opacity-80">1:{rr}</span>
      </div>
    </div>
  );
}

