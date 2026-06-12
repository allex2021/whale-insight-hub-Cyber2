import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal, Pause, Play, Trash2, Activity, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/whale/AnimatedNumber";
import { fmtUSD, fmtPrice, fmtPct } from "@/lib/whale/format";

// --- Asset universe -----------------------------------------------------
const ASSETS: Record<string, { ticker: string; name: string; base: number }> = {
  BTCUSDT: { ticker: "BTC", name: "Bitcoin",  base: 96500 },
  ETHUSDT: { ticker: "ETH", name: "Ethereum", base: 3450 },
  SOLUSDT: { ticker: "SOL", name: "Solana",   base: 188 },
  LTCUSDT: { ticker: "LTC", name: "Litecoin", base: 92 },
  BNBUSDT: { ticker: "BNB", name: "BNB",      base: 640 },
  XRPUSDT: { ticker: "XRP", name: "XRP",      base: 2.18 },
  DOGEUSDT:{ ticker: "DOGE",name: "Dogecoin", base: 0.34 },
};
type AssetKey = keyof typeof ASSETS;

// --- Types --------------------------------------------------------------
type SweepKind = "BSL_SWEEP" | "SSL_SWEEP" | "OB_TAP" | "FVG_FILL" | "MSS" | "LIQ_GRAB" | "EQ_HIGHS" | "EQ_LOWS" | "ACCUM" | "DISTRIB";
type SweepEvent = { id: number; ts: number; ticker: string; kind: SweepKind; text: string };
type OrderBlock = { id: number; low: number; high: number; depth: number; ageSec: number; taps: number; flash: boolean };

// --- Templates ----------------------------------------------------------
const eventColor = (k: SweepKind) =>
  k === "BSL_SWEEP" || k === "DISTRIB" || k === "EQ_HIGHS" ? "text-bear"
  : k === "SSL_SWEEP" || k === "ACCUM" || k === "EQ_LOWS" ? "text-bull"
  : k === "OB_TAP" || k === "MSS" ? "text-[var(--neon-blue)]"
  : "text-amber-400";

const buildEvent = (ticker: string, price: number): { kind: SweepKind; text: string } => {
  const r = Math.random();
  const above = price * (1 + (0.0015 + Math.random() * 0.004));
  const below = price * (1 - (0.0015 + Math.random() * 0.004));
  const p = (n: number) => fmtPrice(n);
  if (r < 0.18) return { kind: "BSL_SWEEP", text: `Buy-Side Liquidity (BSL) swept at $${p(above)}. Retail shorts invalidated. Stop-hunt confirmed.` };
  if (r < 0.36) return { kind: "SSL_SWEEP", text: `Sell-Side Liquidity (SSL) swept at $${p(below)}. Retail longs liquidated. Reclaim watching.` };
  if (r < 0.50) return { kind: "OB_TAP",    text: `Institutional Accumulation Block tapped near $${p(below)}. Heavy whale buy orders filling.` };
  if (r < 0.62) return { kind: "FVG_FILL",  text: `Fair Value Gap rebalanced @ $${p(price)}. Algo mitigation in progress.` };
  if (r < 0.72) return { kind: "MSS",       text: `Market Structure Shift detected — internal HL printed @ $${p(price)}.` };
  if (r < 0.80) return { kind: "LIQ_GRAB",  text: `Liquidity grab into resting orders @ $${p(above)} — wick rejection registered.` };
  if (r < 0.86) return { kind: "EQ_HIGHS",  text: `Equal Highs ($${p(above)}) taken. Engineered liquidity consumed.` };
  if (r < 0.92) return { kind: "EQ_LOWS",   text: `Equal Lows ($${p(below)}) taken. Algorithmic stop run complete.` };
  if (r < 0.96) return { kind: "ACCUM",     text: `Smart money accumulation footprint — passive bids stacking $${p(below)} → $${p(price)}.` };
  return         { kind: "DISTRIB",  text: `Distribution print — large passive asks layered $${p(price)} → $${p(above)}.` };
};

const HOUGAARD_QUOTES = [
  "The best loser wins. Discipline beats prediction.",
  "Trade the chart in front of you, not the one in your head.",
  "Your conviction is measured by your willingness to be wrong.",
  "FOMO is the most expensive emotion in markets.",
  "Risk first. Reward later. Process always.",
];

const fmtClock = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// --- Hook: synthetic SMC stream ----------------------------------------
function useEliteStream(symbol: AssetKey, paused: boolean) {
  const meta = ASSETS[symbol];
  const [price, setPrice] = useState(meta.base);
  const [sweeps, setSweeps] = useState<SweepEvent[]>([]);
  const [bslOff, setBslOff] = useState(0.012);
  const [sslOff, setSslOff] = useState(0.011);
  const [demand, setDemand] = useState<OrderBlock[]>([]);
  const [supply, setSupply] = useState<OrderBlock[]>([]);
  const idRef = useRef(1);
  const priceRef = useRef(price);
  useEffect(() => { priceRef.current = price; }, [price]);

  // Reset on symbol change
  useEffect(() => {
    setPrice(meta.base);
    setSweeps([]);
    setBslOff(0.008 + Math.random() * 0.012);
    setSslOff(0.008 + Math.random() * 0.012);
    const mk = (dir: -1 | 1): OrderBlock => {
      const center = meta.base * (1 + dir * (0.006 + Math.random() * 0.018));
      const width = meta.base * (0.0015 + Math.random() * 0.003);
      return {
        id: idRef.current++,
        low: center - width, high: center + width,
        depth: 800_000 + Math.random() * 9_000_000,
        ageSec: Math.floor(Math.random() * 600),
        taps: Math.floor(Math.random() * 3),
        flash: false,
      };
    };
    setDemand([mk(-1), mk(-1), mk(-1)]);
    setSupply([mk(1), mk(1), mk(1)]);
  }, [symbol, meta.base]);

  // Price walk
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setPrice((p) => {
        const drift = (Math.random() - 0.5) * p * 0.0009;
        return Math.max(p * 0.5, p + drift);
      });
      setBslOff((v) => Math.min(0.05, Math.max(0.004, v + (Math.random() - 0.5) * 0.0008)));
      setSslOff((v) => Math.min(0.05, Math.max(0.004, v + (Math.random() - 0.5) * 0.0008)));
    }, 1000);
    return () => clearInterval(id);
  }, [paused]);

  // Event generator
  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    const schedule = () => {
      const delay = 1500 + Math.random() * 2200;
      setTimeout(() => {
        if (cancelled) return;
        const ev = buildEvent(meta.ticker, priceRef.current);
        setSweeps((arr) => [{ id: idRef.current++, ts: Date.now(), ticker: meta.ticker, ...ev }, ...arr].slice(0, 80));
        // occasionally flash an OB
        if (Math.random() < 0.25) {
          const side = Math.random() < 0.5 ? "d" : "s";
          const update = (arr: OrderBlock[]) => {
            const i = Math.floor(Math.random() * arr.length);
            return arr.map((b, idx) => idx === i ? { ...b, flash: true, taps: b.taps + 1 } : b);
          };
          if (side === "d") setDemand(update); else setSupply(update);
          setTimeout(() => {
            if (cancelled) return;
            setDemand((arr) => arr.map((b) => ({ ...b, flash: false })));
            setSupply((arr) => arr.map((b) => ({ ...b, flash: false })));
          }, 800);
        }
        schedule();
      }, delay);
    };
    schedule();
    return () => { cancelled = true; };
  }, [paused, meta.ticker, price]);

  // Age OBs + occasional refresh
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setDemand((arr) => arr.map((b) => ({ ...b, ageSec: b.ageSec + 5 })));
      setSupply((arr) => arr.map((b) => ({ ...b, ageSec: b.ageSec + 5 })));
    }, 5000);
    const refresh = setInterval(() => {
      const mk = (dir: -1 | 1): OrderBlock => {
        const center = price * (1 + dir * (0.006 + Math.random() * 0.018));
        const width = price * (0.0015 + Math.random() * 0.003);
        return { id: idRef.current++, low: center - width, high: center + width, depth: 800_000 + Math.random() * 9_000_000, ageSec: 0, taps: 0, flash: false };
      };
      if (Math.random() < 0.5) setDemand((arr) => [mk(-1), ...arr.slice(0, 2)]);
      else setSupply((arr) => [mk(1), ...arr.slice(0, 2)]);
    }, 12000);
    return () => { clearInterval(id); clearInterval(refresh); };
  }, [paused, price]);

  const bsl = price * (1 + bslOff);
  const ssl = price * (1 - sslOff);
  const eq  = (bsl + ssl) / 2;
  const zone: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM" =
    price > eq * 1.002 ? "PREMIUM" : price < eq * 0.998 ? "DISCOUNT" : "EQUILIBRIUM";

  // FOMO score = sweeps in last 60s, scaled
  const recent = sweeps.filter((s) => Date.now() - s.ts < 60_000).length;
  const fomo = Math.min(100, Math.round((recent / 8) * 100));

  const clearSweeps = () => setSweeps([]);
  return { price, sweeps, bsl, ssl, eq, zone, demand, supply, fomo, recent, clearSweeps };
}

// --- Subcomponents ------------------------------------------------------
function ColShell({ title, accent, icon, children, className }: { title: string; accent: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("flex flex-col rounded-lg border bg-card/40 backdrop-blur-sm", className)}
      style={{ borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`, boxShadow: `0 0 18px color-mix(in oklab, ${accent} 22%, transparent), inset 0 0 24px color-mix(in oklab, ${accent} 6%, transparent)` }}
    >
      <div className="flex items-center justify-between border-b px-3 py-2"
           style={{ borderColor: `color-mix(in oklab, ${accent} 30%, transparent)` }}>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: accent, textShadow: `0 0 8px color-mix(in oklab, ${accent} 60%, transparent)` }}>
          {icon}{title}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">LIVE</div>
      </div>
      <div className="flex-1 p-3 font-mono">{children}</div>
    </div>
  );
}

function SweepLogger({ sweeps, paused, onTogglePause, onClear, hoverPause, setHoverPause }: {
  sweeps: SweepEvent[]; paused: boolean; onTogglePause: () => void; onClear: () => void;
  hoverPause: boolean; setHoverPause: (v: boolean) => void;
}) {
  return (
    <ColShell title="Liquidity Hunt & Sweep Log" accent="var(--neon-blue)" icon={<Terminal size={12} />} className="lg:row-span-2">
      <div className="mb-2 flex items-center gap-2">
        <button onClick={onTogglePause} className="flex items-center gap-1 rounded border border-border bg-background/50 px-2 py-1 text-[10px] uppercase tracking-wider hover:border-[var(--neon-blue)]">
          {paused ? <Play size={10}/> : <Pause size={10}/>}{paused ? "Resume" : "Pause"}
        </button>
        <button onClick={onClear} className="flex items-center gap-1 rounded border border-border bg-background/50 px-2 py-1 text-[10px] uppercase tracking-wider hover:border-bear hover:text-bear">
          <Trash2 size={10}/>Clear
        </button>
        <span className="ml-auto text-[10px] text-muted-foreground">{sweeps.length} events</span>
      </div>
      <div
        onMouseEnter={() => setHoverPause(true)}
        onMouseLeave={() => setHoverPause(false)}
        className="relative h-[680px] overflow-y-auto rounded border border-border/60 bg-background/60 p-2 text-[11px] leading-relaxed scrollbar-thin"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0, transparent 2px, color-mix(in oklab, var(--neon-blue) 4%, transparent) 3px)" }}
      >
        {hoverPause && !paused && (
          <div className="sticky top-0 z-10 mb-1 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">⏸ Hover-paused autoscroll</div>
        )}
        {sweeps.length === 0 && <div className="text-muted-foreground/60">// awaiting blockchain scan…</div>}
        {sweeps.map((s) => (
          <div key={s.id} className="group flex gap-2 border-b border-border/20 py-1 last:border-0">
            <span className="shrink-0 text-muted-foreground/70">{fmtClock(s.ts)}</span>
            <span className="shrink-0 text-foreground/90">{s.ticker}</span>
            <span className={cn("shrink-0", eventColor(s.kind))}>🚨</span>
            <span className={cn("min-w-0", eventColor(s.kind))}>{s.text}</span>
          </div>
        ))}
      </div>
    </ColShell>
  );
}

function LiquidityMatrix({ price, bsl, ssl, eq, zone }: { price: number; bsl: number; ssl: number; eq: number; zone: string }) {
  const bslDist = ((bsl - price) / price) * 100;
  const sslDist = ((ssl - price) / price) * 100;
  const bslPool = bsl * (50_000 + Math.random() * 250_000);
  const sslPool = ssl * (50_000 + Math.random() * 250_000);
  const zoneColor = zone === "PREMIUM" ? "text-bear" : zone === "DISCOUNT" ? "text-bull" : "text-[var(--neon-blue)]";
  return (
    <ColShell title="Algorithmic Liquidity Matrix" accent="var(--neon-purple)" icon={<Activity size={12} />}>
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-bull"><TrendingUp size={10}/>BSL · Target Magnet ▲</div>
          <AnimatedNumber value={bsl} format={(n) => `$${fmtPrice(n)}`} className="text-bull text-3xl font-bold" style={{ textShadow: "0 0 14px color-mix(in oklab, var(--bull) 65%, transparent)" }} />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Δ <span className="text-bull">{fmtPct(bslDist)}</span></span>
            <span>Pool: <span className="text-bull">{fmtUSD(bslPool)}</span></span>
          </div>
        </div>

        <div className="rounded border border-border/40 bg-background/40 p-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">SPOT</span>
            <AnimatedNumber value={price} format={(n) => `$${fmtPrice(n)}`} className="text-foreground text-sm font-semibold" />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">EQUILIBRIUM</span>
            <span className="font-semibold">${fmtPrice(eq)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] uppercase text-muted-foreground">Zone</span>
            <span className={cn("rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", zoneColor)}
                  style={{ borderColor: "currentcolor" }}>{zone}</span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-bear"><TrendingDown size={10}/>SSL · Danger Zone ▼</div>
          <AnimatedNumber value={ssl} format={(n) => `$${fmtPrice(n)}`} className="text-bear text-3xl font-bold" style={{ textShadow: "0 0 14px color-mix(in oklab, var(--bear) 65%, transparent)" }} />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Δ <span className="text-bear">{fmtPct(sslDist)}</span></span>
            <span>Pool: <span className="text-bear">{fmtUSD(sslPool)}</span></span>
          </div>
        </div>
      </div>
    </ColShell>
  );
}

function OBCard({ b, side }: { b: OrderBlock; side: "demand" | "supply" }) {
  const color = side === "demand" ? "var(--bull)" : "var(--bear)";
  return (
    <div
      className={cn("rounded border bg-background/50 p-2 transition-all", b.flash && "scale-[1.01]")}
      style={{
        borderColor: `color-mix(in oklab, ${color} ${b.flash ? 80 : 45}%, transparent)`,
        boxShadow: b.flash ? `0 0 18px color-mix(in oklab, ${color} 60%, transparent)` : `0 0 6px color-mix(in oklab, ${color} 15%, transparent)`,
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider" style={{ color }}>
          ${fmtPrice(b.low)} → ${fmtPrice(b.high)}
        </span>
        <span className="text-[9px] text-muted-foreground">{b.ageSec < 60 ? `${b.ageSec}s` : `${Math.floor(b.ageSec / 60)}m`}</span>
      </div>
      <div className="mt-1 flex justify-between text-[10px]">
        <span>Depth: <span className="font-semibold" style={{ color }}>{fmtUSD(b.depth)}</span></span>
        <span className="text-muted-foreground">Tapped <span className="text-foreground">{b.taps}x</span></span>
      </div>
    </div>
  );
}

function OrderBlocks({ demand, supply }: { demand: OrderBlock[]; supply: OrderBlock[] }) {
  return (
    <ColShell title="Institutional Order Blocks" accent="var(--neon-blue)" icon={<Activity size={12} />}>
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-bear">▲ Live Whale Supply</div>
          <div className="space-y-1.5">{supply.map((b) => <OBCard key={b.id} b={b} side="supply" />)}</div>
        </div>
        <div className="border-t border-border/40 pt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-bull">▼ Live Whale Demand</div>
          <div className="space-y-1.5">{demand.map((b) => <OBCard key={b.id} b={b} side="demand" />)}</div>
        </div>
      </div>
    </ColShell>
  );
}

function HougaardSentinel({ fomo, recent }: { fomo: number; recent: number }) {
  const state: "DISCIPLINED" | "ELEVATED" | "HEAVY" =
    recent <= 2 ? "DISCIPLINED" : recent <= 5 ? "ELEVATED" : "HEAVY";
  const color = state === "DISCIPLINED" ? "var(--neon-blue)" : state === "ELEVATED" ? "#fbbf24" : "var(--bear)";
  const quote = useMemo(() => HOUGAARD_QUOTES[Math.floor(Date.now() / 8000) % HOUGAARD_QUOTES.length], [recent]);

  return (
    <ColShell title="Tom Hougaard · Anti-FOMO Sentinel" accent={color} icon={<AlertTriangle size={12} />}>
      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Volatility State</div>
          <div className={cn("mt-1 text-2xl font-bold tracking-wide", state === "HEAVY" && "animate-pulse")}
               style={{ color, textShadow: `0 0 12px color-mix(in oklab, ${color} 65%, transparent)` }}>
            {state === "HEAVY" ? "HEAVY SWEEP PHASE" : state}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{recent} sweep events / 60s</div>
        </div>

        <div>
          <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>FOMO Meter</span><span style={{ color }}>{fomo}/100</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-background/70 border border-border/50">
            <div className="h-full transition-all duration-500" style={{ width: `${fomo}%`, background: `linear-gradient(90deg, var(--neon-blue), ${color})`, boxShadow: `0 0 10px ${color}` }} />
          </div>
        </div>

        {state === "HEAVY" ? (
          <div className="rounded border border-bear/70 bg-bear/10 p-2 text-[11px] leading-relaxed text-bear animate-pulse-bear">
            <div className="mb-1 font-bold uppercase tracking-wider">⚠ Tom Hougaard Rules</div>
            Market is in heavy sweep phase. Retail is FOMO buying the top. Do NOT chase. Hold discipline and wait for structural pullback.
          </div>
        ) : state === "ELEVATED" ? (
          <div className="rounded border border-amber-500/50 bg-amber-500/10 p-2 text-[11px] text-amber-300">
            Volatility expanding. Reduce size. Trade the next confirmed reaction — not the current move.
          </div>
        ) : (
          <div className="rounded border border-[var(--neon-blue)]/40 bg-[var(--neon-blue)]/5 p-2 text-[11px] text-[var(--neon-blue)]">
            Controlled tape. Stalk your A+ setup. Patience is position.
          </div>
        )}

        <div className="border-t border-border/30 pt-2 text-[11px] italic text-muted-foreground">
          “{quote}”
          <div className="mt-0.5 text-[9px] not-italic uppercase tracking-wider text-muted-foreground/70">— Hougaard discipline log</div>
        </div>
      </div>
    </ColShell>
  );
}

// --- Main ---------------------------------------------------------------
export function EliteIntelTerminal() {
  const [symbol, setSymbol] = useState<AssetKey>("BTCUSDT");
  const [paused, setPaused] = useState(false);
  const [hoverPause, setHoverPause] = useState(false);
  const effectivePause = paused || hoverPause;
  const { price, sweeps, bsl, ssl, eq, zone, demand, supply, fomo, recent, clearSweeps } = useEliteStream(symbol, effectivePause);
  const meta = ASSETS[symbol];
  const lastTick = sweeps[0]?.ts ?? Date.now();

  return (
    <div className="font-mono">
      {/* Top bar */}
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--neon-blue)]/40 bg-card/40 px-3 py-2 backdrop-blur-sm"
           style={{ boxShadow: "0 0 22px color-mix(in oklab, var(--neon-blue) 18%, transparent)" }}>
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-[var(--neon-blue)]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--neon-blue)]" style={{ textShadow: "0 0 8px var(--neon-blue)" }}>
            Elite Intelligence Terminal · SMC
          </span>
        </div>

        <div className="flex items-center gap-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Asset</label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value as AssetKey)}
            className="rounded border border-[var(--neon-blue)]/40 bg-background/60 px-2 py-1 text-[11px] font-bold uppercase text-[var(--neon-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--neon-blue)]"
          >
            {Object.entries(ASSETS).map(([k, v]) => (
              <option key={k} value={k}>{v.ticker} · {v.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className={cn("absolute inline-flex h-full w-full rounded-full bg-bull opacity-75", !effectivePause && "animate-ping")} />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-bull shadow-[0_0_8px_var(--bull)]" />
          </span>
          <span className="text-[10px] uppercase tracking-wider text-bull">{effectivePause ? "PAUSED" : "STREAM ACTIVE"}</span>
          <span className="text-[10px] text-muted-foreground">· {fmtClock(lastTick)}</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{meta.ticker}/USDT</div>
          <AnimatedNumber value={price} format={(n) => `$${fmtPrice(n)}`} className="text-lg font-bold text-foreground" />
        </div>
      </div>

      {/* 4-column grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <SweepLogger
          sweeps={sweeps}
          paused={paused}
          onTogglePause={() => setPaused((p) => !p)}
          onClear={clearSweeps}
          hoverPause={hoverPause}
          setHoverPause={setHoverPause}
        />
        <LiquidityMatrix price={price} bsl={bsl} ssl={ssl} eq={eq} zone={zone} />
        <OrderBlocks demand={demand} supply={supply} />
        <HougaardSentinel fomo={fomo} recent={recent} />
      </div>

      {/* Disclaimer */}
      <div className="mt-4 rounded-lg border border-border/60 bg-background/60 px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        <span className="font-bold uppercase tracking-[0.2em] text-foreground/80">⚠ Institutional Risk Disclaimer — </span>
        Simulated SMC data feed for educational analysis only. Buy/Sell-side liquidity zones, order blocks, and sweep events shown here are algorithmic estimates, not investment advice. Crypto spot and derivatives markets carry substantial risk of loss and may not be suitable for every investor. You are solely responsible for your trading decisions, position sizing, and risk management. No representation is made that any account will or is likely to achieve profits or losses similar to those shown.
      </div>
    </div>
  );
}

export default EliteIntelTerminal;
