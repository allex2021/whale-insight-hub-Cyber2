import { useEffect, useRef, useState } from "react";
import { Panel, Chip } from "./Panel";
import { Waves } from "lucide-react";
import { cn } from "@/lib/utils";

type CVDSample = { t: number; cvd: number; price: number };
type SymState = { samples: CVDSample[]; cvd: number };

const SYMBOLS = ["BTC", "ETH", "SOL"] as const;
type Sym = typeof SYMBOLS[number];
const STREAMS = SYMBOLS.map((s) => `${s.toLowerCase()}usdt@aggTrade`).join("/");
const MAX_SAMPLES = 60; // ~rolling window

/** Cumulative Volume Delta panel. Subscribes to Binance aggTrades for BTC/ETH/SOL. */
export function CVDPanel() {
  const [state, setState] = useState<Record<Sym, SymState>>(() => ({
    BTC: { samples: [], cvd: 0 },
    ETH: { samples: [], cvd: 0 },
    SOL: { samples: [], cvd: 0 },
  }));
  const lastSampleRef = useRef<Record<Sym, number>>({ BTC: 0, ETH: 0, SOL: 0 });
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    // Buffer deltas; flush to state every 1s to avoid spamming React.
    const buffer: Record<Sym, { delta: number; price: number }> = {
      BTC: { delta: 0, price: 0 }, ETH: { delta: 0, price: 0 }, SOL: { delta: 0, price: 0 },
    };

    const connect = () => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${STREAMS}`);
      wsRef.current = ws;
      ws.onopen = () => { retryRef.current = 0; };
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          const d = m.data; if (!d || !d.s) return;
          const sym = d.s.replace("USDT", "") as Sym;
          if (!buffer[sym]) return;
          const price = parseFloat(d.p);
          const qty = parseFloat(d.q);
          const usd = price * qty;
          const sign = d.m ? -1 : 1; // m=true means maker is buyer => taker sold => negative delta
          buffer[sym].delta += sign * usd;
          buffer[sym].price = price;
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (cancelled) return;
        const delay = Math.min(30_000, 1000 * 2 ** retryRef.current);
        retryRef.current += 1;
        setTimeout(connect, delay);
      };
    };

    const flush = setInterval(() => {
      const now = Date.now();
      setState((prev) => {
        const next = { ...prev };
        (Object.keys(buffer) as Sym[]).forEach((s) => {
          const b = buffer[s];
          if (b.price === 0) return;
          const newCvd = next[s].cvd + b.delta;
          // Only record one sample per second
          if (now - lastSampleRef.current[s] >= 1000) {
            lastSampleRef.current[s] = now;
            const samples = [...next[s].samples, { t: now, cvd: newCvd, price: b.price }].slice(-MAX_SAMPLES);
            next[s] = { cvd: newCvd, samples };
          } else {
            next[s] = { ...next[s], cvd: newCvd };
          }
          buffer[s].delta = 0;
        });
        return next;
      });
    }, 1000);

    connect();
    return () => {
      cancelled = true;
      clearInterval(flush);
      wsRef.current?.close();
    };
  }, []);

  return (
    <Panel
      title="CVD · Cumulative Volume Delta"
      subtitle="Aggressor buy − sell flow · Binance live · divergence detector"
      accent="blue"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SYMBOLS.map((s) => (
          <CVDCard key={s} sym={s} state={state[s]} />
        ))}
      </div>
    </Panel>
  );
}

function CVDCard({ sym, state }: { sym: Sym; state: SymState }) {
  const samples = state.samples;
  const isBull = state.cvd >= 0;
  // Divergence: price change vs cvd change over window
  let divergence: "BULL_DIV" | "BEAR_DIV" | null = null;
  if (samples.length >= 10) {
    const first = samples[0]; const last = samples[samples.length - 1];
    const dPrice = ((last.price - first.price) / first.price) * 100;
    const dCvd = last.cvd - first.cvd;
    if (dPrice > 0.05 && dCvd < 0) divergence = "BEAR_DIV";
    else if (dPrice < -0.05 && dCvd > 0) divergence = "BULL_DIV";
  }

  return (
    <div className="rounded-lg border border-border bg-gradient-to-br from-card to-secondary/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waves className="h-3.5 w-3.5 text-[var(--neon-blue)]" />
          <span className="text-sm font-bold">{sym}</span>
        </div>
        {divergence === "BEAR_DIV" && <Chip tone="bear">BEAR DIV</Chip>}
        {divergence === "BULL_DIV" && <Chip tone="bull">BULL DIV</Chip>}
        {!divergence && <Chip tone={isBull ? "bull" : "bear"}>{isBull ? "BUY DOM" : "SELL DOM"}</Chip>}
      </div>
      <div className={cn("mb-1 font-mono text-lg font-bold", isBull ? "text-bull" : "text-bear")}>
        {isBull ? "+" : ""}{fmtUsdSigned(state.cvd)}
      </div>
      <Sparkline samples={samples} />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>Px ${samples[samples.length - 1]?.price.toLocaleString("en-US", { maximumFractionDigits: 2 }) ?? "—"}</span>
        <span>{samples.length}s</span>
      </div>
    </div>
  );
}

function fmtUsdSigned(n: number) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${n < 0 ? "-" : ""}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${n < 0 ? "-" : ""}$${(a / 1e3).toFixed(1)}K`;
  return `${n < 0 ? "-" : ""}$${a.toFixed(0)}`;
}

function Sparkline({ samples }: { samples: CVDSample[] }) {
  if (samples.length < 2) {
    return <div className="h-8 rounded bg-secondary/40" />;
  }
  const w = 200, h = 32;
  const cvds = samples.map((s) => s.cvd);
  const min = Math.min(...cvds), max = Math.max(...cvds);
  const range = max - min || 1;
  const pts = samples.map((s, i) => {
    const x = (i / (samples.length - 1)) * w;
    const y = h - ((s.cvd - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = cvds[cvds.length - 1];
  const color = last >= 0 ? "var(--bull)" : "var(--bear)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
