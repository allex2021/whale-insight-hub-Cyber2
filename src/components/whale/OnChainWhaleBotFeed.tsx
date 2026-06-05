import { useEffect, useMemo, useState } from "react";
import { Panel, Chip } from "./Panel";
import { fmtUSD, timeAgo } from "@/lib/whale/format";
import { Radio, ExternalLink, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertSource = "whale_alert" | "lookonchain";
interface BotAlert {
  id: string;
  source: AlertSource;
  msg: string;
  token: string;
  amount: number;
  value: number;
  from: string;
  to: string;
  fromTag?: string;
  toTag?: string;
  ts: number;
  txHash: string;
}

const TAGS = ["Binance Hot Wallet", "Coinbase 2", "Kraken", "OKX Cold", "Unknown Wallet",
  "Jump Trading", "Wintermute", "Robinhood", "Bitfinex", "Tether Treasury", "Whale #128"];
const TOKENS = [
  { sym: "BTC", price: 108500 },
  { sym: "ETH", price: 3920 },
  { sym: "SOL", price: 215 },
  { sym: "USDT", price: 1 },
  { sym: "USDC", price: 1 },
  { sym: "LINK", price: 21.4 },
];

const rand = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function genAlert(): BotAlert {
  const t = rand(TOKENS);
  const amount = t.sym === "USDT" || t.sym === "USDC"
    ? Math.floor(1_000_000 + Math.random() * 200_000_000)
    : Math.floor(50 + Math.random() * 5000);
  const value = amount * t.price;
  const from = rand(TAGS);
  const to = rand(TAGS.filter(x => x !== from));
  const source: AlertSource = Math.random() > 0.5 ? "whale_alert" : "lookonchain";
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    msg: source === "whale_alert"
      ? `${amount.toLocaleString()} ${t.sym} transferred from ${from} to ${to}`
      : `Smart money moved ${fmtUSD(value)} of ${t.sym} — ${from} → ${to}`,
    token: t.sym, amount, value,
    from, to,
    fromTag: from, toTag: to,
    ts: Date.now(),
    txHash: `0x${Math.random().toString(16).slice(2, 10)}…${Math.random().toString(16).slice(2, 8)}`,
  };
}

const SIZE_FILTERS = [
  { v: 0, label: "All" },
  { v: 1_000_000, label: ">$1M" },
  { v: 5_000_000, label: ">$5M" },
  { v: 10_000_000, label: ">$10M" },
] as const;

export function OnChainWhaleBotFeed() {
  const [alerts, setAlerts] = useState<BotAlert[]>(() =>
    Array.from({ length: 10 }, () => ({ ...genAlert(), ts: Date.now() - Math.floor(Math.random() * 300_000) }))
      .sort((a, b) => b.ts - a.ts)
  );
  const [minSize, setMinSize] = useState<number>(0);
  const [trace, setTrace] = useState<BotAlert | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setAlerts(prev => [genAlert(), ...prev].slice(0, 40));
    }, 2800);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(
    () => alerts.filter(a => a.value >= minSize),
    [alerts, minSize],
  );

  return (
    <Panel
      title="On-Chain Whale Bot Feed"
      subtitle="@whale_alert + @lookonchain · streaming tx alerts"
      accent="blue"
      action={
        <div className="flex items-center gap-2">
          <Chip tone="bull"><Radio size={9} className="animate-pulse" /> WS LIVE</Chip>
          <div className="hidden sm:flex rounded-md border border-border bg-secondary/40 p-0.5">
            {SIZE_FILTERS.map(f => (
              <button key={f.v} onClick={() => setMinSize(f.v)}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-bold font-mono rounded transition-colors",
                  minSize === f.v ? "bg-[var(--neon-blue)]/20 text-[var(--neon-blue)]" : "text-muted-foreground hover:text-foreground",
                )}
              >{f.label}</button>
            ))}
          </div>
        </div>
      }
    >
      <div className="sm:hidden mb-3 flex rounded-md border border-border bg-secondary/40 p-0.5">
        {SIZE_FILTERS.map(f => (
          <button key={f.v} onClick={() => setMinSize(f.v)}
            className={cn(
              "flex-1 px-2 py-1 text-[10px] font-bold font-mono rounded transition-colors",
              minSize === f.v ? "bg-[var(--neon-blue)]/20 text-[var(--neon-blue)]" : "text-muted-foreground",
            )}
          >{f.label}</button>
        ))}
      </div>

      <div className="max-h-[520px] overflow-y-auto space-y-2">
        {filtered.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8 font-mono">
            No alerts match {SIZE_FILTERS.find(f => f.v === minSize)?.label} — waiting for next tx…
          </div>
        )}
        {filtered.map(a => (
          <div key={a.id} className="rounded-md border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors p-3">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Chip tone={a.source === "whale_alert" ? "blue" : "purple"}>
                  {a.source === "whale_alert" ? "🐋 @whale_alert" : "👁 @lookonchain"}
                </Chip>
                <Chip tone={a.value > 10_000_000 ? "warn" : "default"}>{fmtUSD(a.value)}</Chip>
                <span className="font-mono font-bold text-foreground text-[11px]">{a.token}</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{timeAgo(a.ts)}</span>
            </div>
            <div className="text-[12px] text-foreground/90 leading-snug mb-2">{a.msg}</div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-mono text-muted-foreground truncate">
                tx: <span className="text-foreground/70">{a.txHash}</span>
              </div>
              <button
                onClick={() => setTrace(a)}
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide font-mono text-[var(--neon-purple)] hover:text-[var(--neon-blue)] transition-colors whitespace-nowrap"
              >
                <ExternalLink size={10} /> Arkham Trace
              </button>
            </div>
          </div>
        ))}
      </div>

      {trace && <ArkhamTraceModal alert={trace} onClose={() => setTrace(null)} />}
    </Panel>
  );
}

function ArkhamTraceModal({ alert, onClose }: { alert: BotAlert; onClose: () => void }) {
  // Mock multi-hop trace
  const hops = useMemo(() => {
    const intermediates = ["0xa1f2…9bc4", "0x88de…11ff", "0x4c0e…7a3b"];
    const count = 1 + Math.floor(Math.random() * 3);
    return [alert.from, ...intermediates.slice(0, count), alert.to];
  }, [alert]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
         onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl border-2 border-[var(--neon-purple)]/60 bg-card shadow-[0_0_60px_rgba(157,0,255,0.4)] overflow-hidden"
           onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border px-4 py-3 bg-gradient-to-r from-[var(--neon-purple)]/10 to-[var(--neon-blue)]/5">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-foreground">Arkham Visualizer</h3>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">Transaction flow trace · {alert.txHash}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-secondary text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </header>
        <div className="p-5">
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[9px] font-mono uppercase text-muted-foreground">Asset</div>
              <div className="font-mono font-bold text-foreground">{alert.token}</div>
            </div>
            <div>
              <div className="text-[9px] font-mono uppercase text-muted-foreground">Amount</div>
              <div className="font-mono font-bold text-foreground">{alert.amount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[9px] font-mono uppercase text-muted-foreground">USD Value</div>
              <div className="font-mono font-bold text-[var(--neon-blue)]">{fmtUSD(alert.value)}</div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background/40 p-4">
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-3">Hop Path</div>
            <div className="flex items-center justify-between gap-1 overflow-x-auto">
              {hops.map((h, i) => (
                <div key={i} className="flex items-center gap-1 shrink-0">
                  <div className={cn(
                    "rounded-md border px-2 py-2 text-center min-w-[88px]",
                    i === 0 ? "border-bear/50 bg-bear/10"
                      : i === hops.length - 1 ? "border-bull/50 bg-bull/10"
                      : "border-border bg-secondary/30",
                  )}>
                    <div className="text-[9px] font-mono uppercase text-muted-foreground mb-0.5">
                      {i === 0 ? "Source" : i === hops.length - 1 ? "Dest" : `Hop ${i}`}
                    </div>
                    <div className="text-[10px] font-mono font-bold text-foreground truncate">{h}</div>
                  </div>
                  {i < hops.length - 1 && <ArrowRight size={14} className="text-[var(--neon-purple)] shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-border bg-secondary/20 p-2">
              <div className="text-[9px] font-mono uppercase text-muted-foreground">Risk Score</div>
              <div className="font-mono font-bold text-[var(--neon-orange)]">
                {(40 + Math.random() * 50).toFixed(0)} / 100
              </div>
            </div>
            <div className="rounded-md border border-border bg-secondary/20 p-2">
              <div className="text-[9px] font-mono uppercase text-muted-foreground">Cluster Confidence</div>
              <div className="font-mono font-bold text-bull">{(70 + Math.random() * 28).toFixed(1)}%</div>
            </div>
          </div>
          <div className="mt-3 text-[10px] font-mono text-muted-foreground text-center">
            Mock trace · live Arkham integration requires an API key
          </div>
        </div>
      </div>
    </div>
  );
}
