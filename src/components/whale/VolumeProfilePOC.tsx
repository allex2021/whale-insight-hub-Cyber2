import { useEffect, useMemo, useState } from "react";
import { Panel, Chip } from "./Panel";
import { Activity, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Node {
  price: number;
  vol: number;
}

function genProfile(poc: number): Node[] {
  const out: Node[] = [];
  for (let i = -10; i <= 10; i++) {
    const price = poc * (1 + i * 0.004);
    const dist = Math.abs(i);
    const vol = Math.max(8, 100 - dist * 8 + (Math.random() * 20 - 10));
    out.push({ price, vol });
  }
  return out;
}

export function VolumeProfilePOC() {
  const poc = 108_200;
  const [spot, setSpot] = useState(108_500);
  const [bars, setBars] = useState(0); // candles closed past POC
  const nodes = useMemo(() => genProfile(poc), []);
  const maxVol = Math.max(...nodes.map((n) => n.vol));

  useEffect(() => {
    const id = setInterval(() => {
      setSpot((s) => s + (Math.random() * 600 - 300));
      setBars((b) => Math.min(5, Math.max(0, b + (Math.random() > 0.5 ? 1 : -1))));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const aboveStable = spot > poc * 1.001 && bars >= 3;
  const belowStable = spot < poc * 0.999 && bars >= 3;

  const status = aboveStable
    ? { label: "BULLISH SWING CONFIRMATION", tone: "bull" as const, sub: "Price stabilized ABOVE POC — long acceptance" }
    : belowStable
    ? { label: "BEARISH SWING CONFIRMATION", tone: "bear" as const, sub: "Price stabilized BELOW POC — short acceptance" }
    : { label: "POC REACTION PENDING", tone: "warn" as const, sub: "Watching for stabilization above or below POC" };

  const distPct = ((spot - poc) / poc) * 100;

  return (
    <Panel
      title="Volume Profile · POC Reaction"
      subtitle="Point of Control acceptance scanner · Two-way trigger"
      accent="purple"
      action={<Chip tone="purple"><Activity size={9} className="animate-pulse" /> AUTO-SYNC</Chip>}
    >
      <div className={cn(
        "rounded-lg border-2 p-3 mb-4",
        status.tone === "bull" && "border-bull/50 bg-bull/5 shadow-[0_0_20px_color-mix(in_oklab,var(--bull)_25%,transparent)]",
        status.tone === "bear" && "border-bear/50 bg-bear/5 shadow-[0_0_20px_color-mix(in_oklab,var(--bear)_25%,transparent)]",
        status.tone === "warn" && "border-[var(--neon-orange)]/40 bg-[var(--neon-orange)]/5",
      )}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">POC Acceptance Status</div>
            <div className={cn(
              "text-base font-bold font-mono",
              status.tone === "bull" && "text-bull",
              status.tone === "bear" && "text-bear",
              status.tone === "warn" && "text-[var(--neon-orange)]",
            )}>
              [{status.label}]
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{status.sub}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase text-muted-foreground">Bars past POC</div>
            <div className="text-2xl font-bold font-mono text-foreground">{bars}/3</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-[11px] font-mono">
        <Metric label="POC" value={`$${poc.toLocaleString()}`} tone="purple" />
        <Metric label="Spot" value={`$${spot.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tone="blue" />
        <Metric
          label="Dist"
          value={`${distPct >= 0 ? "+" : ""}${distPct.toFixed(2)}%`}
          tone={distPct >= 0 ? "bull" : "bear"}
        />
      </div>

      <div className="rounded-lg border border-border bg-background/30 p-2">
        <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2 px-1">Volume Profile</div>
        <div className="space-y-0.5">
          {nodes.slice().reverse().map((n) => {
            const isPoc = Math.abs(n.price - poc) < 1;
            const isSpot = Math.abs(n.price - spot) < poc * 0.003;
            const pct = (n.vol / maxVol) * 100;
            return (
              <div key={n.price} className="flex items-center gap-2 py-0.5">
                <div className="w-20 text-right font-mono text-[10px] text-muted-foreground">
                  ${n.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="flex-1 h-3 relative bg-secondary/30 rounded-sm overflow-hidden">
                  <div className={cn(
                    "h-full rounded-sm",
                    isPoc ? "bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-purple)]/50"
                          : "bg-gradient-to-r from-[var(--neon-blue)]/60 to-[var(--neon-blue)]/30",
                  )} style={{ width: `${pct}%` }} />
                </div>
                <div className="w-14 text-right">
                  {isPoc && <span className="text-[9px] font-mono font-bold text-[var(--neon-purple)]">◆ POC</span>}
                  {isSpot && !isPoc && (
                    <span className="text-[9px] font-mono font-bold text-[var(--neon-blue)] inline-flex items-center gap-0.5">
                      {spot >= poc ? <ArrowUp size={9} /> : <ArrowDown size={9} />} SPOT
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "bull" | "bear" | "blue" | "purple" }) {
  const colors = {
    bull: "text-bull border-bull/40",
    bear: "text-bear border-bear/40",
    blue: "text-[var(--neon-blue)] border-[var(--neon-blue)]/40",
    purple: "text-[var(--neon-purple)] border-[var(--neon-purple)]/40",
  };
  return (
    <div className={cn("rounded-md border p-2 bg-secondary/20", colors[tone])}>
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-bold font-mono">{value}</div>
    </div>
  );
}
