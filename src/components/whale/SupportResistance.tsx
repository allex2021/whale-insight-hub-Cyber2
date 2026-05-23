import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel, Chip } from "./Panel";
import { LoadingState, ErrorState } from "./StateView";
import { cn } from "@/lib/utils";

const ASSETS = ["BTC", "ETH", "SOL", "LTC", "BNB", "XRP", "ADA", "DOGE", "AVAX"] as const;
type Asset = typeof ASSETS[number];

type Level = { price: number; strength: number };
type SRData = {
  asset: Asset;
  price: number;
  supports: Level[];
  resistances: Level[];
  pivot: number;
};

const fmtPrice = (n: number) =>
  n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
  : n >= 1 ? n.toFixed(3)
  : n.toFixed(5);

/** Find swing-pivot highs/lows, cluster nearby ones, rank by touch count + recency. */
function computeLevels(klines: number[][], price: number) {
  // kline: [openTime, open, high, low, close, volume, ...]
  const highs = klines.map((k) => parseFloat(k[2] as unknown as string));
  const lows = klines.map((k) => parseFloat(k[3] as unknown as string));
  const n = klines.length;
  const win = 3;

  const pivots: { price: number; idx: number; kind: "H" | "L" }[] = [];
  for (let i = win; i < n - win; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - win; j <= i + win; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isHigh = false;
      if (lows[j] <= lows[i]) isLow = false;
    }
    if (isHigh) pivots.push({ price: highs[i], idx: i, kind: "H" });
    if (isLow) pivots.push({ price: lows[i], idx: i, kind: "L" });
  }

  // Cluster within 0.6% bands
  const band = 0.006;
  const clusters: { price: number; touches: number; recencyBoost: number }[] = [];
  for (const p of pivots) {
    const existing = clusters.find((c) => Math.abs(c.price - p.price) / c.price < band);
    if (existing) {
      existing.touches += 1;
      existing.price = (existing.price + p.price) / 2;
      existing.recencyBoost = Math.max(existing.recencyBoost, p.idx / n);
    } else {
      clusters.push({ price: p.price, touches: 1, recencyBoost: p.idx / n });
    }
  }

  const scored = clusters.map((c) => ({
    price: c.price,
    strength: Math.min(100, Math.round(c.touches * 22 + c.recencyBoost * 30)),
  }));

  const resistances = scored
    .filter((l) => l.price > price)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);
  const supports = scored
    .filter((l) => l.price < price)
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);

  // Daily pivot (classic) — using last full kline
  const last = klines[n - 1];
  const h = parseFloat(last[2] as unknown as string);
  const l = parseFloat(last[3] as unknown as string);
  const c = parseFloat(last[4] as unknown as string);
  const pivot = (h + l + c) / 3;

  return { supports, resistances, pivot };
}

type Timeframe = "15m" | "1h" | "4h" | "1d";

async function fetchSR(asset: Asset, tf: Timeframe): Promise<SRData> {
  const sym = `${asset}USDT`;
  const [klRes, tRes] = await Promise.all([
    fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${tf}&limit=120`),
    fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`),
  ]);
  if (!klRes.ok || !tRes.ok) throw new Error(`Binance ${sym} failed`);
  const klines = (await klRes.json()) as number[][];
  const price = parseFloat((await tRes.json()).price);
  const { supports, resistances, pivot } = computeLevels(klines, price);
  return { asset, price, supports, resistances, pivot };
}

function LevelRow({ label, level, price, tone }: {
  label: string; level: Level | undefined; price: number; tone: "bull" | "bear";
}) {
  if (!level) return (
    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
      <span>{label}</span><span>—</span>
    </div>
  );
  const distPct = ((level.price - price) / price) * 100;
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-muted-foreground w-6">{label}</span>
      <span className={cn("font-mono font-bold", tone === "bull" ? "text-bull" : "text-bear")}>
        ${fmtPrice(level.price)}
      </span>
      <span className="text-[10px] text-muted-foreground font-mono w-12 text-right">
        {distPct >= 0 ? "+" : ""}{distPct.toFixed(2)}%
      </span>
      <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden max-w-[60px]">
        <div
          className={cn("h-full", tone === "bull" ? "bg-bull" : "bg-bear")}
          style={{ width: `${level.strength}%` }}
        />
      </div>
    </div>
  );
}

function AssetCard({ d }: { d: SRData }) {
  const r1 = d.resistances[0];
  const s1 = d.supports[0];
  const nearR = r1 && (r1.price - d.price) / d.price < 0.01;
  const nearS = s1 && (d.price - s1.price) / d.price < 0.01;
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold font-mono">{d.asset}</span>
          <span className="font-mono text-xs text-muted-foreground">${fmtPrice(d.price)}</span>
        </div>
        {nearR && <Chip tone="bear">Near R</Chip>}
        {nearS && <Chip tone="bull">Near S</Chip>}
        {!nearR && !nearS && <Chip tone="default">Pivot ${fmtPrice(d.pivot)}</Chip>}
      </div>
      <div className="space-y-1">
        <LevelRow label="R3" level={d.resistances[2]} price={d.price} tone="bear" />
        <LevelRow label="R2" level={d.resistances[1]} price={d.price} tone="bear" />
        <LevelRow label="R1" level={d.resistances[0]} price={d.price} tone="bear" />
        <div className="h-px bg-border my-1" />
        <LevelRow label="S1" level={d.supports[0]} price={d.price} tone="bull" />
        <LevelRow label="S2" level={d.supports[1]} price={d.price} tone="bull" />
        <LevelRow label="S3" level={d.supports[2]} price={d.price} tone="bull" />
      </div>
    </div>
  );
}

export function SupportResistance() {
  const [tf, setTf] = useState<Timeframe>("4h");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["support-resistance", tf],
    queryFn: async () => {
      const results = await Promise.all(
        ASSETS.map((a) => fetchSR(a, tf).catch(() => null)),
      );
      return results.filter((r): r is SRData => r !== null);
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return (
    <Panel
      title="Support & Resistance"
      subtitle={`Pivot-based S/R · ${tf} candles · auto-clustered swing highs/lows`}
      accent="purple"
      action={
        <div className="flex gap-1">
          {(["15m", "1h", "4h", "1d"] as Timeframe[]).map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[10px] transition-colors",
                tf === t
                  ? "bg-[var(--neon-purple)]/20 text-[var(--neon-purple)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      }
    >
      {isLoading && !data && <LoadingState label="Computing S/R levels…" />}
      {error && !data && <ErrorState error={String(error)} onRetry={() => refetch()} />}
      {data && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.map((d) => <AssetCard key={d.asset} d={d} />)}
        </div>
      )}
    </Panel>
  );
}
