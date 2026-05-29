import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Panel, Chip } from "./Panel";
import { SkeletonLoader } from "./SkeletonLoader";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp, RefreshCw, AlertTriangle, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchEconomicCalendar, getUpcomingHighImpact, type UpcomingEvent } from "@/lib/whale/economicCalendar";
import { fetchNewsServer } from "@/lib/whale/market.functions";

type Asset = "BTC" | "ETH" | "SOL";
const ASSETS: Asset[] = ["BTC", "ETH", "SOL"];

interface SignalBreakdown { name: string; value: string; weight: number }
interface ConfluenceResult {
  score: number;          // 0-100
  label: string;
  confidence: number;     // 0-100
  tone: "bull" | "bear" | "warn" | "default";
  signals: SignalBreakdown[];
}

interface RawInputs {
  fundingRate: number;
  longShortRatio: number;
  orderBookImbalance: number;   // -1..+1
  fearGreedIndex: number;       // 0..100
  openInterestChange1h: number; // %
  whaleBias: "long" | "short" | "neutral";
  whaleBuyCount: number;
  whaleSellCount: number;
  newsSentiment: number;        // -1..+1 (VADER avg)
  newsCount: number;
}

function calculateConfluenceScore(input: RawInputs): ConfluenceResult {
  let score = 50;
  const signals: SignalBreakdown[] = [];

  // 1. Funding rate — contrarian (weight ±22)
  const frImpact = Math.max(-22, Math.min(22, -(input.fundingRate / 0.001) * 22));
  score += frImpact;
  signals.push({
    name: "Funding Rate",
    value: `${(input.fundingRate * 100).toFixed(4)}%`,
    weight: Math.round(frImpact),
  });

  // 2. L/S Ratio (weight ±18)
  let lsW = 0;
  if (input.longShortRatio < 0.8) lsW = 18;
  else if (input.longShortRatio < 1.0) lsW = 8;
  else if (input.longShortRatio > 1.6) lsW = -18;
  else if (input.longShortRatio > 1.3) lsW = -8;
  score += lsW;
  signals.push({ name: "L/S Ratio", value: input.longShortRatio.toFixed(2), weight: lsW });

  // 3. Fear & Greed — contrarian (weight ±16)
  let fgW = 0;
  if (input.fearGreedIndex < 20) fgW = 16;
  else if (input.fearGreedIndex < 35) fgW = 7;
  else if (input.fearGreedIndex > 80) fgW = -16;
  else if (input.fearGreedIndex > 65) fgW = -7;
  score += fgW;
  signals.push({ name: "Fear & Greed", value: `${input.fearGreedIndex}/100`, weight: fgW });

  // 4. Open Interest 1h change (weight ±14)
  const oiW = Math.max(-14, Math.min(14, (input.openInterestChange1h / 5) * 14));
  score += oiW;
  signals.push({
    name: "OI Change 1h",
    value: `${input.openInterestChange1h >= 0 ? "+" : ""}${input.openInterestChange1h.toFixed(2)}%`,
    weight: Math.round(oiW),
  });

  // 5. Whale bias (weight ±18)
  const wbW = input.whaleBias === "long" ? 18 : input.whaleBias === "short" ? -18 : 0;
  score += wbW;
  signals.push({
    name: "Whale Flow",
    value: `${input.whaleBuyCount}B / ${input.whaleSellCount}S — ${input.whaleBias.toUpperCase()}`,
    weight: wbW,
  });

  // 6. Order book bias (weight ±12)
  const obW = Math.round(input.orderBookImbalance * 12);
  score += obW;
  signals.push({
    name: "Order Book",
    value: input.orderBookImbalance > 0.3 ? "Bid-Heavy" : input.orderBookImbalance < -0.3 ? "Ask-Heavy" : "Balanced",
    weight: obW,
  });

  // 7. News sentiment (VADER, weight ±10)
  const nsW = input.newsCount >= 3 ? Math.round(input.newsSentiment * 10) : 0;
  score += nsW;
  signals.push({
    name: "News Sentiment",
    value: input.newsCount >= 3
      ? `${input.newsSentiment > 0 ? "+" : ""}${input.newsSentiment.toFixed(2)} · ${input.newsCount} items`
      : `insufficient (${input.newsCount})`,
    weight: nsW,
  });

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label =
    score >= 76 ? "STRONGLY BULLISH" :
    score >= 60 ? "BULLISH" :
    score >= 45 ? "NEUTRAL" :
    score >= 28 ? "BEARISH" :
    "STRONGLY BEARISH";
  const tone: ConfluenceResult["tone"] =
    score >= 60 ? "bull" : score <= 40 ? "bear" : score >= 50 ? "default" : "warn";
  const confidence = Math.round(Math.abs(score - 50) * 2);
  return { score, label, confidence, tone, signals };
}

// ----- Module-level caches (survive re-renders, avoid duplicate work) -----
let fgCache: { at: number; value: number } | null = null;
async function fetchFearGreed(): Promise<number> {
  if (fgCache && Date.now() - fgCache.at < 5 * 60_000) return fgCache.value;
  try {
    const j = await fetch("https://api.alternative.me/fng/?limit=1").then((r) => r.json());
    const v = j?.data?.[0] ? parseInt(j.data[0].value, 10) : 50;
    fgCache = { at: Date.now(), value: v };
    return v;
  } catch {
    return fgCache?.value ?? 50;
  }
}

let whaleCountsCache: { at: number; counts: Record<Asset, { buy: number; sell: number }> } | null = null;
async function fetchWhaleCounts(): Promise<Record<Asset, { buy: number; sell: number }>> {
  if (whaleCountsCache && Date.now() - whaleCountsCache.at < 60_000) return whaleCountsCache.counts;
  const empty: Record<Asset, { buy: number; sell: number }> = {
    BTC: { buy: 0, sell: 0 }, ETH: { buy: 0, sell: 0 }, SOL: { buy: 0, sell: 0 },
  };
  try {
    const { data, error } = await supabase
      .from("whale_trades")
      .select("asset, side")
      .in("asset", ASSETS)
      .gte("trade_time", new Date(Date.now() - 6 * 3600 * 1000).toISOString());
    if (error || !data) return whaleCountsCache?.counts ?? empty;
    const out = empty;
    for (const row of data as Array<{ asset: Asset; side: string }>) {
      if (!out[row.asset]) continue;
      if (row.side === "BUY") out[row.asset].buy++;
      else if (row.side === "SELL") out[row.asset].sell++;
    }
    whaleCountsCache = { at: Date.now(), counts: out };
    return out;
  } catch {
    return whaleCountsCache?.counts ?? empty;
  }
}

const assetInputCache = new Map<Asset, { at: number; inputs: RawInputs }>();
async function fetchAssetInputs(
  asset: Asset,
  shared: {
    fgIndex: number;
    whaleCounts: { buy: number; sell: number };
    newsSentiment: number;
    newsCount: number;
  },
): Promise<RawInputs> {
  const cached = assetInputCache.get(asset);
  if (cached && Date.now() - cached.at < 20_000) return cached.inputs;

  const sym = `${asset}USDT`;
  const [funding, lsRes, depthRes, oiCur, oiPrev] = await Promise.allSettled([
    fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`).then((r) => r.json()),
    fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=1h&limit=1`).then((r) => r.json()),
    fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${sym}&limit=20`).then((r) => r.json()),
    fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=5m&limit=1`).then((r) => r.json()),
    fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=5m&limit=13`).then((r) => r.json()),
  ]);

  const fundingRate = funding.status === "fulfilled" ? parseFloat(funding.value.lastFundingRate || "0") : 0;
  const lsArr = lsRes.status === "fulfilled" ? lsRes.value : [];
  const longShortRatio = Array.isArray(lsArr) && lsArr[0] ? parseFloat(lsArr[0].longShortRatio || "1") : 1;

  let obImb = 0;
  if (depthRes.status === "fulfilled" && depthRes.value?.bids) {
    const bidSum = (depthRes.value.bids as [string, string][]).reduce((s, [, q]) => s + parseFloat(q), 0);
    const askSum = (depthRes.value.asks as [string, string][]).reduce((s, [, q]) => s + parseFloat(q), 0);
    if (bidSum + askSum > 0) obImb = (bidSum - askSum) / (bidSum + askSum);
  }

  let oiChange = 0;
  if (oiCur.status === "fulfilled" && oiPrev.status === "fulfilled") {
    const cur = Array.isArray(oiCur.value) && oiCur.value[0] ? parseFloat(oiCur.value[0].sumOpenInterest) : 0;
    const prevArr = oiPrev.value;
    const prev = Array.isArray(prevArr) && prevArr[0] ? parseFloat(prevArr[0].sumOpenInterest) : 0;
    if (prev > 0) oiChange = ((cur - prev) / prev) * 100;
  }

  const { buy: buyCount, sell: sellCount } = shared.whaleCounts;
  const tot = buyCount + sellCount;
  const whaleBias: RawInputs["whaleBias"] =
    tot < 5 ? "neutral" :
    buyCount > sellCount * 1.3 ? "long" :
    sellCount > buyCount * 1.3 ? "short" : "neutral";

  const inputs: RawInputs = {
    fundingRate,
    longShortRatio,
    orderBookImbalance: obImb,
    fearGreedIndex: shared.fgIndex,
    openInterestChange1h: oiChange,
    whaleBias,
    whaleBuyCount: buyCount,
    whaleSellCount: sellCount,
    newsSentiment: shared.newsSentiment,
    newsCount: shared.newsCount,
  };
  assetInputCache.set(asset, { at: Date.now(), inputs });
  return inputs;
}

interface AssetState {
  asset: Asset;
  loading: boolean;
  result?: ConfluenceResult;
  error?: string;
}

function gaugeColor(score: number): string {
  if (score >= 75) return "var(--bull)";
  if (score >= 60) return "color-mix(in oklab, var(--bull) 70%, var(--neon-blue))";
  if (score >= 40) return "var(--neon-blue)";
  if (score >= 25) return "var(--neon-orange)";
  return "var(--bear)";
}

// Memoized asset selector — re-renders only when score for that asset changes
interface AssetButtonProps { asset: Asset; score?: number; selected: boolean; onSelect: (a: Asset) => void }
const AssetButton = memo(function AssetButton({ asset, score, selected, onSelect }: AssetButtonProps) {
  return (
    <button
      onClick={() => onSelect(asset)}
      className={cn(
        "flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold transition-colors",
        selected ? "bg-[var(--neon-purple)]/30 text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {asset}
      {score !== undefined && (
        <span className="font-mono" style={{ color: gaugeColor(score) }}>{score}</span>
      )}
    </button>
  );
});

// Live countdown — isolated so it doesn't re-render the whole panel every second
const REFRESH_INTERVAL_MS = 30_000;
function LiveRefreshIndicator({ lastUpdate }: { lastUpdate: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!lastUpdate) {
    return <span className="font-mono text-[10px] text-muted-foreground">loading…</span>;
  }
  const elapsed = Math.max(0, Math.floor((now - lastUpdate) / 1000));
  const nextIn = Math.max(0, Math.ceil((REFRESH_INTERVAL_MS - (now - lastUpdate)) / 1000));
  return (
    <span className="hidden sm:inline font-mono text-[10px] text-muted-foreground">
      updated {elapsed}s ago · next in {nextIn}s
    </span>
  );
}

export function ConfluenceScore() {
  const [states, setStates] = useState<Record<Asset, AssetState>>({
    BTC: { asset: "BTC", loading: true },
    ETH: { asset: "ETH", loading: true },
    SOL: { asset: "SOL", loading: true },
  });
  const [selected, setSelected] = useState<Asset>("BTC");
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const notifiedRef = useRef<Map<string, Set<number>>>(new Map());
  const inflightRef = useRef(false);

  // ---- Economic calendar: pre-event caution (60min window, alerts at 60 & 15 min) ----
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const tick = async () => {
      try {
        const events = await fetchEconomicCalendar(ctrl.signal);
        const list = getUpcomingHighImpact(events, 60);
        if (cancelled) return;
        setUpcoming(list);
        // Fire one-shot pre-event alerts at 60min and 15min thresholds
        const thresholds = [60, 15];
        for (const ev of list) {
          const key = `${ev.country}|${ev.title}|${ev.at}`;
          const seen = notifiedRef.current.get(key) ?? new Set<number>();
          for (const t of thresholds) {
            if (ev.minutesUntil <= t && !seen.has(t)) {
              seen.add(t);
              toast.warning(`⚠️ ${ev.country} ${ev.title}`, {
                description: `High-impact macro event in ~${ev.minutesUntil} min · expect volatility`,
                duration: 8000,
              });
            }
          }
          notifiedRef.current.set(key, seen);
        }
      } catch { /* swallow — non-critical */ }
    };
    tick();
    const id = setInterval(tick, 60_000); // re-evaluate countdowns every minute
    return () => { cancelled = true; ctrl.abort(); clearInterval(id); };
  }, []);

  const fetchNews = useServerFn(fetchNewsServer);

  useEffect(() => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        // Shared inputs fetched ONCE per cycle (was 3x duplicate)
        const [fgIndex, whaleCounts, news] = await Promise.all([
          fetchFearGreed(),
          fetchWhaleCounts(),
          fetchNews().catch(() => []),
        ]);
        const sentiments = news.map((n) => n.sentiment?.compound).filter((c): c is number => typeof c === "number");
        const newsSentiment = sentiments.length ? sentiments.reduce((s, x) => s + x, 0) / sentiments.length : 0;
        const newsCount = sentiments.length;
        const results = await Promise.all(
          ASSETS.map(async (a) => {
            try {
              const inputs = await fetchAssetInputs(a, { fgIndex, whaleCounts: whaleCounts[a], newsSentiment, newsCount });
              return { asset: a, result: calculateConfluenceScore(inputs) };
            } catch (e) {
              return { asset: a, error: e instanceof Error ? e.message : String(e) };
            }
          }),
        );
        if (cancelled) return;
        setStates((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const r of results) {
            const old = prev[r.asset];
            if (old.result?.score !== r.result?.score || old.error !== r.error || old.loading) {
              next[r.asset] = { asset: r.asset, loading: false, result: r.result, error: r.error };
              changed = true;
            }
          }
          return changed ? next : prev;
        });
        setLastUpdate(Date.now());
      } finally {
        inflightRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleSelect = useCallback((a: Asset) => setSelected(a), []);
  const handleRefresh = useCallback(() => {
    // Force-bypass caches on manual refresh
    assetInputCache.clear();
    setTick((t) => t + 1);
  }, []);

  const current = states[selected];
  const score = current.result?.score ?? 50;
  const color = gaugeColor(score);

  // SVG gauge: 270° arc from -135° to +135°
  const dash = useMemo(() => {
    const radius = 70;
    const circ = 2 * Math.PI * radius;
    const visible = circ * 0.75; // 270°
    const filled = (score / 100) * visible;
    return { circ, visible, filled, gap: circ - visible };
  }, [score]);

  return (
    <Panel
      title="Confluence Score"
      subtitle="Multi-signal aggregate · updates every 30s"
      accent="purple"
      action={
        <div className="flex items-center gap-2">
          <LiveRefreshIndicator lastUpdate={lastUpdate} />
          <div className="flex gap-1 rounded-md border border-border bg-secondary/40 p-0.5">
            {ASSETS.map((a) => (
              <AssetButton
                key={a}
                asset={a}
                score={states[a].result?.score}
                selected={selected === a}
                onSelect={handleSelect}
              />
            ))}
          </div>
          <button
            onClick={handleRefresh}
            className="rounded-md border border-border bg-secondary/40 p-1 text-muted-foreground hover:text-foreground"
            aria-label="refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      }
    >
      {upcoming.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-[var(--neon-orange)]/50 bg-[var(--neon-orange)]/10 px-3 py-2 text-xs">
          <CalendarClock className="h-4 w-4 text-[var(--neon-orange)] shrink-0" />
          <span className="font-bold uppercase tracking-wider text-[var(--neon-orange)]">Caution</span>
          <span className="text-muted-foreground">High-impact macro event{upcoming.length > 1 ? "s" : ""} within 1h:</span>
          <div className="flex flex-wrap gap-1.5">
            {upcoming.slice(0, 3).map((ev) => (
              <span
                key={`${ev.country}-${ev.title}-${ev.at}`}
                className="inline-flex items-center gap-1 rounded border border-[var(--neon-orange)]/40 bg-background/40 px-1.5 py-0.5 font-mono"
                title={new Date(ev.at).toLocaleString()}
              >
                <span className="font-bold text-[var(--neon-orange)]">{ev.country}</span>
                <span className="text-foreground">{ev.title}</span>
                <span className="text-muted-foreground">· {ev.minutesUntil}m</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {current.error && !current.result && (
        <div className="flex items-center gap-2 rounded-md border border-bear/40 bg-bear/10 p-3 text-xs text-bear">
          <AlertTriangle className="h-4 w-4" /> {current.error}
        </div>
      )}
      {current.result && (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
          {/* Gauge */}
          <div className="relative shrink-0">
            {(score >= 70 || score <= 30) && (
              <span
                className="pointer-events-none absolute inset-2 rounded-full animate-ping"
                style={{ boxShadow: `0 0 0 4px ${color}`, opacity: 0.35 }}
                aria-hidden
              />
            )}
            <svg width="180" height="180" viewBox="0 0 180 180" className="relative -rotate-[135deg]">
              <circle
                cx="90" cy="90" r="70"
                fill="none" stroke="hsl(var(--border))" strokeWidth="14"
                strokeDasharray={`${dash.visible} ${dash.gap}`}
                strokeLinecap="round"
              />
              <circle
                cx="90" cy="90" r="70"
                fill="none" stroke={color} strokeWidth="14"
                strokeDasharray={`${dash.filled} ${dash.circ}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.4s ease", filter: `drop-shadow(0 0 8px ${color})` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-4xl font-bold tabular-nums" style={{ color }}>{score}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">/ 100</div>
            </div>
          </div>

          {/* Label + signals */}
          <div className="flex-1 space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{selected} Verdict</div>
              <div className="flex flex-wrap items-baseline gap-2">
                <div className="text-2xl font-bold" style={{ color }}>{current.result.label}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{current.result.confidence}% confidence</div>
              </div>
            </div>

            <button
              onClick={() => setExpanded((x) => !x)}
              className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Signal breakdown ({current.result.signals.length})
            </button>

            {expanded && (
              <div className="space-y-1.5">
                {current.result.signals.map((s) => {
                  const w = s.weight;
                  const tone = w > 1 ? "bull" : w < -1 ? "bear" : "default";
                  return (
                    <div key={s.name} className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-2 py-1.5 text-[11px]">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">{s.name}</div>
                        <div className="truncate text-[10px] text-muted-foreground font-mono">{s.value}</div>
                      </div>
                      <Chip tone={tone as "bull" | "bear" | "default"}>
                        {w > 0 ? "+" : ""}{w.toFixed(0)}
                      </Chip>
                    </div>
                  );
                })}
              </div>
            )}

            {lastUpdate && (
              <div className="text-[10px] text-muted-foreground">
                Updated {new Date(lastUpdate).toLocaleTimeString()} · funding · L/S · order book · F&G · OI · whale flow · news (VADER)
              </div>
            )}
          </div>
        </div>
      )}
      {current.loading && !current.result && (
        <div className="h-[180px] animate-pulse rounded-md bg-secondary/30" />
      )}
    </Panel>
  );
}
