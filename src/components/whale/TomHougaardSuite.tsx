import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, Clock, AlertTriangle, TrendingUp, Plus, Trash2, Activity } from "lucide-react";
import { Panel, Chip } from "./Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  TradingView Advanced Chart                                        */
/* ------------------------------------------------------------------ */

const TV_PAIRS = [
  { v: "BINANCE:BTCUSDT", label: "BTC / USDT" },
  { v: "BINANCE:ETHUSDT", label: "ETH / USDT" },
  { v: "BINANCE:SOLUSDT", label: "SOL / USDT" },
  { v: "BINANCE:BNBUSDT", label: "BNB / USDT" },
  { v: "BINANCE:XRPUSDT", label: "XRP / USDT" },
  { v: "BINANCE:DOGEUSDT", label: "DOGE / USDT" },
] as const;

function TradingViewChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current;
    container.innerHTML = "";

    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "100%";
    inner.style.width = "100%";
    container.appendChild(inner);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "60",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(10,10,20,1)",
      gridColor: "rgba(255,255,255,0.04)",
      enable_publishing: false,
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      details: true,
      hotlist: false,
      calendar: false,
      studies: ["STD;EMA", "STD;RSI"],
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [symbol]);

  return (
    <div
      ref={ref}
      className="tradingview-widget-container h-full w-full"
      style={{ height: "100%", width: "100%" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Market Session Countdown                                          */
/* ------------------------------------------------------------------ */

type SessionDef = {
  key: string;
  label: string;
  city: string;
  openUtcHour: number; // hour UTC
  durationH: number;
  tone: "blue" | "purple" | "warn";
};

// Approximations — DST-naive, sufficient for traders' visual cues.
const SESSIONS: SessionDef[] = [
  { key: "tokyo",  label: "Tokyo",    city: "Asia",    openUtcHour: 0,  durationH: 9, tone: "purple" },
  { key: "london", label: "London",   city: "Europe",  openUtcHour: 7,  durationH: 8, tone: "blue" },
  { key: "ny",     label: "New York", city: "Americas",openUtcHour: 13, durationH: 8, tone: "warn" },
];

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function sessionState(now: number, s: SessionDef) {
  const d = new Date(now);
  const todayOpen = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), s.openUtcHour, 0, 0);
  const close = todayOpen + s.durationH * 3600_000;
  if (now >= todayOpen && now < close) {
    return { isOpen: true, ms: close - now, label: "closes in" };
  }
  const nextOpen = now < todayOpen ? todayOpen : todayOpen + 24 * 3600_000;
  return { isOpen: false, ms: nextOpen - now, label: "opens in" };
}

function fmtCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function SessionCountdown({ onOpenEvent }: { onOpenEvent: (s: SessionDef) => void }) {
  const now = useNow(1000);
  const states = SESSIONS.map((s) => ({ s, state: sessionState(now, s) }));

  // Fire onOpenEvent when within first 30s of London or NY open
  const firedRef = useRef<Record<string, number>>({});
  useEffect(() => {
    states.forEach(({ s, state }) => {
      if (!state.isOpen) return;
      if (s.key !== "london" && s.key !== "ny") return;
      const elapsed = s.durationH * 3600_000 - state.ms;
      if (elapsed < 60_000) {
        const day = new Date(now).toUTCString().slice(0, 16);
        const key = `${s.key}:${day}`;
        if (firedRef.current[key] !== 1) {
          firedRef.current[key] = 1;
          onOpenEvent(s);
        }
      }
    });
  }, [now, states, onOpenEvent]);

  return (
    <div className="grid grid-cols-3 gap-2">
      {states.map(({ s, state }) => (
        <div
          key={s.key}
          className={cn(
            "rounded-lg border p-2.5 transition-all",
            state.isOpen
              ? "border-[var(--neon-purple)]/60 bg-[var(--neon-purple)]/10 shadow-[0_0_12px_rgba(168,85,247,0.25)]"
              : "border-border bg-card/40",
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">{s.label}</span>
            <Chip tone={state.isOpen ? "bull" : "default"}>{state.isOpen ? "LIVE" : "IDLE"}</Chip>
          </div>
          <div className="font-mono text-base font-bold tabular-nums text-foreground">
            {fmtCountdown(state.ms)}
          </div>
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{state.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pyramiding Calculator — "Best Loser Wins"                         */
/* ------------------------------------------------------------------ */

type AddOn = {
  level: number;
  triggerPrice: number;
  addSize: number;     // units
  cumulativeSize: number;
  avgEntry: number;
  riskUSD: number;     // distance from new stop * cumulativeSize
  unrealizedR: number; // in R multiples vs initial risk
};

function buildPyramid(opts: {
  entry: number;
  stop: number;
  initialSize: number; // units
  addLevels: number;   // how many add-ons
  scaleFactor: number; // 0.5 → each add is 50% of previous
  rStep: number;       // each add triggers after this many R of profit
  trailToBE: boolean;  // move stop to break-even after first add
}): AddOn[] {
  const { entry, stop, initialSize, addLevels, scaleFactor, rStep, trailToBE } = opts;
  const isLong = entry > stop;
  const rDist = Math.abs(entry - stop);
  if (rDist <= 0 || initialSize <= 0) return [];

  const rows: AddOn[] = [];
  let cumSize = initialSize;
  let weightedCost = entry * initialSize;
  let lastSize = initialSize;
  let currentStop = stop;

  // Level 0 — initial entry
  rows.push({
    level: 0,
    triggerPrice: entry,
    addSize: initialSize,
    cumulativeSize: cumSize,
    avgEntry: entry,
    riskUSD: Math.abs(entry - currentStop) * cumSize,
    unrealizedR: 0,
  });

  for (let i = 1; i <= addLevels; i++) {
    const rGain = i * rStep;
    const triggerPrice = isLong ? entry + rDist * rGain : entry - rDist * rGain;
    const addSize = lastSize * scaleFactor;
    cumSize += addSize;
    weightedCost += triggerPrice * addSize;
    const avg = weightedCost / cumSize;

    if (i === 1 && trailToBE) currentStop = entry; // Best Loser Wins: protect capital

    const riskUSD = Math.abs(avg - currentStop) * cumSize;
    const unrealizedR = ((triggerPrice - avg) * (isLong ? 1 : -1) * cumSize) / (rDist * initialSize);

    rows.push({
      level: i,
      triggerPrice,
      addSize,
      cumulativeSize: cumSize,
      avgEntry: avg,
      riskUSD,
      unrealizedR,
    });
    lastSize = addSize;
  }
  return rows;
}

function PyramidCalc() {
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState(65000);
  const [stop, setStop] = useState(63500);
  const [size, setSize] = useState(0.1);
  const [levels, setLevels] = useState(3);
  const [scale, setScale] = useState(0.5);
  const [rStep, setRStep] = useState(1);
  const [trailBE, setTrailBE] = useState(true);

  const normalizedStop = direction === "long"
    ? Math.min(stop, entry - 0.0001)
    : Math.max(stop, entry + 0.0001);

  const rows = useMemo(
    () => buildPyramid({
      entry,
      stop: normalizedStop,
      initialSize: size,
      addLevels: levels,
      scaleFactor: scale,
      rStep,
      trailToBE: trailBE,
    }),
    [entry, normalizedStop, size, levels, scale, rStep, trailBE],
  );

  const initialRiskUSD = Math.abs(entry - normalizedStop) * size;
  const final = rows[rows.length - 1];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Direction</Label>
          <Select value={direction} onValueChange={(v) => setDirection(v as "long" | "short")}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="long">Long</SelectItem>
              <SelectItem value="short">Short</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Add-on Levels</Label>
          <Input type="number" min={1} max={6} value={levels}
            onChange={(e) => setLevels(Math.min(6, Math.max(1, Number(e.target.value) || 1)))}
            className="h-8 text-xs font-mono" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Entry Price</Label>
          <Input type="number" value={entry} onChange={(e) => setEntry(Number(e.target.value) || 0)} className="h-8 text-xs font-mono" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Stop Loss</Label>
          <Input type="number" value={stop} onChange={(e) => setStop(Number(e.target.value) || 0)} className="h-8 text-xs font-mono" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Initial Size</Label>
          <Input type="number" step="0.001" value={size} onChange={(e) => setSize(Number(e.target.value) || 0)} className="h-8 text-xs font-mono" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Scale Factor</Label>
          <Select value={String(scale)} onValueChange={(v) => setScale(Number(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0.25">0.25× (Conservative)</SelectItem>
              <SelectItem value="0.5">0.5× (Hougaard)</SelectItem>
              <SelectItem value="0.75">0.75× (Aggressive)</SelectItem>
              <SelectItem value="1">1.0× (Martingale)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">R-Step Trigger</Label>
          <Select value={String(rStep)} onValueChange={(v) => setRStep(Number(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0.5">0.5R</SelectItem>
              <SelectItem value="1">1R</SelectItem>
              <SelectItem value="1.5">1.5R</SelectItem>
              <SelectItem value="2">2R</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={trailBE}
              onChange={(e) => setTrailBE(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--neon-purple)]"
            />
            Trail to break-even after add #1
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background/40 overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead className="bg-card/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">Lv</th>
              <th className="px-2 py-1.5 text-right">Trigger</th>
              <th className="px-2 py-1.5 text-right">Add</th>
              <th className="px-2 py-1.5 text-right">Cum Size</th>
              <th className="px-2 py-1.5 text-right">Avg</th>
              <th className="px-2 py-1.5 text-right">Risk $</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.level} className="border-t border-border/60 tabular-nums">
                <td className="px-2 py-1.5 text-foreground font-bold">{r.level === 0 ? "E" : `+${r.level}`}</td>
                <td className="px-2 py-1.5 text-right">{r.triggerPrice.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-right text-[var(--neon-blue)]">{r.addSize.toFixed(4)}</td>
                <td className="px-2 py-1.5 text-right">{r.cumulativeSize.toFixed(4)}</td>
                <td className="px-2 py-1.5 text-right text-[var(--neon-purple)]">{r.avgEntry.toFixed(2)}</td>
                <td className={cn("px-2 py-1.5 text-right", r.riskUSD <= initialRiskUSD ? "text-bull" : "text-[var(--neon-orange)]")}>
                  {r.riskUSD.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="rounded-md border border-border bg-card/40 p-2">
          <div className="uppercase tracking-wide text-muted-foreground">Initial 1R</div>
          <div className="font-mono text-sm text-foreground">${initialRiskUSD.toFixed(2)}</div>
        </div>
        <div className="rounded-md border border-border bg-card/40 p-2">
          <div className="uppercase tracking-wide text-muted-foreground">Final Size</div>
          <div className="font-mono text-sm text-[var(--neon-blue)]">{final?.cumulativeSize.toFixed(4)}</div>
        </div>
        <div className="rounded-md border border-border bg-card/40 p-2">
          <div className="uppercase tracking-wide text-muted-foreground">Final Avg</div>
          <div className="font-mono text-sm text-[var(--neon-purple)]">{final?.avgEntry.toFixed(2)}</div>
        </div>
      </div>

      <Alert className="border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/5">
        <Brain className="h-4 w-4 text-[var(--neon-purple)]" />
        <AlertTitle className="text-xs font-bold uppercase tracking-wider">Best Loser Wins</AlertTitle>
        <AlertDescription className="text-[11px] leading-relaxed text-muted-foreground">
          Never add to losers. Pyramid only when price proves you right. Trail stop to break-even on
          first add — protect capital, then let winners run asymmetrically.
        </AlertDescription>
      </Alert>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mindset Warnings                                                  */
/* ------------------------------------------------------------------ */

type Warning = { id: number; title: string; body: string; tone: "warn" | "purple" | "blue" };

const FOMO_LINES: Omit<Warning, "id">[] = [
  {
    tone: "warn",
    title: "London Open · Volatility Surge",
    body: "First 30 minutes = liquidity hunts. Do NOT chase. Let the trap form, then trade the reversal. FOMO is a tax on impatience.",
  },
  {
    tone: "warn",
    title: "New York Open · Whipsaw Zone",
    body: "US session opens with stop runs in both directions. Wait for the second move. Your edge is patience, not prediction.",
  },
  {
    tone: "purple",
    title: "Mindset Check",
    body: "Are you trading the chart, or trading your last loss? If revenge is in the seat — close the app for 15 minutes.",
  },
  {
    tone: "blue",
    title: "Process > Outcome",
    body: "A perfect setup that loses is still a win. A sloppy setup that wins is still a loss. Grade your decisions, not your P&L.",
  },
];

function MindsetWarnings({ warnings, dismiss }: { warnings: Warning[]; dismiss: (id: number) => void }) {
  if (warnings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-card/30 p-4 text-center">
        <Brain className="mx-auto h-5 w-5 text-muted-foreground mb-1.5" />
        <div className="text-[11px] text-muted-foreground">
          No active warnings. Mindset: calm. Discipline online.
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {warnings.map((w) => (
        <Alert
          key={w.id}
          className={cn(
            "relative pr-8 animate-in fade-in slide-in-from-right-2 duration-300",
            w.tone === "warn" && "border-[var(--neon-orange)]/50 bg-[var(--neon-orange)]/5",
            w.tone === "purple" && "border-[var(--neon-purple)]/50 bg-[var(--neon-purple)]/5",
            w.tone === "blue" && "border-[var(--neon-blue)]/50 bg-[var(--neon-blue)]/5",
          )}
        >
          <AlertTriangle className={cn(
            "h-4 w-4",
            w.tone === "warn" && "text-[var(--neon-orange)]",
            w.tone === "purple" && "text-[var(--neon-purple)]",
            w.tone === "blue" && "text-[var(--neon-blue)]",
          )} />
          <AlertTitle className="text-xs font-bold uppercase tracking-wider">{w.title}</AlertTitle>
          <AlertDescription className="text-[11px] leading-relaxed text-muted-foreground">{w.body}</AlertDescription>
          <button
            onClick={() => dismiss(w.id)}
            className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground"
            aria-label="Dismiss"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </Alert>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard                                                    */
/* ------------------------------------------------------------------ */

export function TomHougaardDashboard() {
  const [symbol, setSymbol] = useState<string>("BINANCE:BTCUSDT");
  const [warnings, setWarnings] = useState<Warning[]>([
    { id: 1, ...FOMO_LINES[2] },
    { id: 2, ...FOMO_LINES[3] },
  ]);
  const nextId = useRef(3);

  const pushWarning = (w: Omit<Warning, "id">) => {
    setWarnings((prev) => {
      // dedupe by title
      if (prev.some((p) => p.title === w.title)) return prev;
      const next = [{ id: nextId.current++, ...w }, ...prev];
      return next.slice(0, 5);
    });
  };

  const handleSessionOpen = (s: SessionDef) => {
    if (s.key === "london") pushWarning(FOMO_LINES[0]);
    if (s.key === "ny") pushWarning(FOMO_LINES[1]);
  };

  const dismiss = (id: number) => setWarnings((prev) => prev.filter((p) => p.id !== id));

  // Rotate mindset hint every 90s
  useEffect(() => {
    const id = window.setInterval(() => {
      const pool = [FOMO_LINES[2], FOMO_LINES[3]];
      pushWarning(pool[Math.floor(Math.random() * pool.length)]);
    }, 90_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-10">
      {/* LEFT — TradingView (70%) */}
      <div className="lg:col-span-7">
        <Panel
          title="Advanced Chart"
          subtitle="TradingView · live multi-timeframe"
          accent="blue"
          action={
            <div className="flex items-center gap-2">
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TV_PAIRS.map((p) => (
                    <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Chip tone="blue"><Activity className="h-2.5 w-2.5" /> LIVE</Chip>
            </div>
          }
        >
          <div className="h-[640px] w-full overflow-hidden rounded-lg border border-border bg-background/40">
            <TradingViewChart symbol={symbol} />
          </div>
        </Panel>
      </div>

      {/* RIGHT — Tom Hougaard Suite (30%) */}
      <div className="lg:col-span-3 space-y-4">
        <Panel title="Session Countdown" subtitle="London · New York · Tokyo" accent="purple"
          action={<Chip tone="purple"><Clock className="h-2.5 w-2.5" /> UTC</Chip>}>
          <SessionCountdown onOpenEvent={handleSessionOpen} />
        </Panel>

        <Panel title="Pyramiding Calculator" subtitle="Best Loser Wins · scale into winners" accent="green"
          action={<Chip tone="bull"><TrendingUp className="h-2.5 w-2.5" /> HOUGAARD</Chip>}>
          <PyramidCalc />
        </Panel>

        <Panel title="Mindset & FOMO Guard" subtitle="Contextual psychology warnings" accent="orange"
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => pushWarning(FOMO_LINES[Math.floor(Math.random() * FOMO_LINES.length)])}
            >
              <Plus className="h-3 w-3" /> Reflect
            </Button>
          }
        >
          <MindsetWarnings warnings={warnings} dismiss={dismiss} />
        </Panel>
      </div>
    </div>
  );
}
