import { useQuery } from "@tanstack/react-query";
import { Panel, Chip } from "./Panel";
import { Activity, RefreshCw } from "lucide-react";
import { useSymbolFilter, type SymbolKey } from "@/hooks/useSymbolFilter";
import { cn } from "@/lib/utils";

type OIRow = {
  asset: SymbolKey;
  oiUsd: number;
  oiPctChange: number;     // 24h
  priceChange: number;     // % over last 24 candles
  history: number[];       // sumOpenInterestValue history (oldest→newest)
};

async function fetchOI(asset: SymbolKey): Promise<OIRow | null> {
  try {
    const sym = `${asset}USDT`;
    const histR = await fetch(
      `https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=1h&limit=24`,
    );
    if (!histR.ok) return null;
    const hist = (await histR.json()) as Array<{
      sumOpenInterest: string;
      sumOpenInterestValue: string;
      timestamp: number;
    }>;
    if (!hist.length) return null;
    const oldest = parseFloat(hist[0].sumOpenInterestValue);
    const newest = parseFloat(hist[hist.length - 1].sumOpenInterestValue);
    const oiPctChange = ((newest - oldest) / oldest) * 100;

    // Price change over same window
    const klR = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1h&limit=24`,
    );
    let priceChange = 0;
    if (klR.ok) {
      const kl = (await klR.json()) as Array<(string | number)[]>;
      if (kl.length) {
        const open = parseFloat(kl[0][1] as string);
        const close = parseFloat(kl[kl.length - 1][4] as string);
        priceChange = ((close - open) / open) * 100;
      }
    }
    return {
      asset,
      oiUsd: newest,
      oiPctChange,
      priceChange,
      history: hist.map((h) => parseFloat(h.sumOpenInterestValue)),
    };
  } catch {
    return null;
  }
}

function fmtUsd(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

function interpret(oi: number, price: number): { label: string; tone: "bull" | "bear" | "warn" | "default" } {
  const oiUp = oi > 1, oiDown = oi < -1, pUp = price > 0.2, pDown = price < -0.2;
  if (oiUp && pUp) return { label: "TREND BULL", tone: "bull" };
  if (oiUp && pDown) return { label: "SHORTS BUILDING", tone: "bear" };
  if (oiDown && pUp) return { label: "SHORT COVER", tone: "warn" };
  if (oiDown && pDown) return { label: "LONGS UNWIND", tone: "warn" };
  return { label: "FLAT", tone: "default" };
}

export function OpenInterestTracker() {
  const { selected } = useSymbolFilter();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["oi-tracker", selected.join(",")],
    queryFn: async () => {
      const rows = await Promise.all(selected.map((a) => fetchOI(a)));
      return rows.filter((r): r is OIRow => r !== null);
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return (
    <Panel
      title="Open Interest Tracker"
      subtitle="24h OI change vs price · Binance Futures · 60s refresh"
      accent="orange"
      action={
        <button onClick={() => refetch()}
          className="rounded-md border border-border bg-secondary p-1 hover:border-border-bright">
          <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
        </button>
      }
    >
      {isLoading && !data ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          <Activity className="mx-auto h-5 w-5 animate-pulse" />
          <div className="mt-2">Loading OI…</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((r) => {
            const interp = interpret(r.oiPctChange, r.priceChange);
            const oiUp = r.oiPctChange >= 0;
            const pUp = r.priceChange >= 0;
            return (
              <div key={r.asset} className="rounded-lg border border-border bg-gradient-to-br from-card to-secondary/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold">{r.asset}</span>
                  <Chip tone={interp.tone}>{interp.label}</Chip>
                </div>
                <div className="mb-2 flex items-baseline justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">OI 24h</div>
                    <div className={cn("font-mono text-base font-bold", oiUp ? "text-bull" : "text-bear")}>
                      {oiUp ? "+" : ""}{r.oiPctChange.toFixed(2)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Price 24h</div>
                    <div className={cn("font-mono text-base font-bold", pUp ? "text-bull" : "text-bear")}>
                      {pUp ? "+" : ""}{r.priceChange.toFixed(2)}%
                    </div>
                  </div>
                </div>
                <MiniSpark values={r.history} up={oiUp} />
                <div className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
                  OI: {fmtUsd(r.oiUsd)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function MiniSpark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return <div className="h-6 rounded bg-secondary/40" />;
  const w = 200, h = 24;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={up ? "var(--bull)" : "var(--bear)"} strokeWidth="1.5" />
    </svg>
  );
}
