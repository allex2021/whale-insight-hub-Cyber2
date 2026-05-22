import { useMemo } from "react";
import { Brain, Shield } from "lucide-react";
import { Panel, Chip } from "./Panel";
import { buildMockAISignals } from "@/lib/whale/mock";
import { timeAgo } from "@/lib/whale/format";
import { cn } from "@/lib/utils";

export function AITradingSignals() {
  const sigs = useMemo(() => buildMockAISignals(), []);
  return (
    <Panel title="AI Trading Signals" subtitle="Generated via DeepSeek-R1 · refreshed every 5m" accent="purple">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {sigs.map((s, i) => {
          const confTone = s.confidence >= 85 ? "purple" : s.confidence >= 70 ? "bull" : s.confidence >= 50 ? "warn" : "default";
          const riskTone = s.risk === "LOW" ? "bull" : s.risk === "MEDIUM" ? "warn" : "bear";
          return (
            <div key={i} className="rounded-lg border border-border bg-gradient-to-br from-card to-secondary/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-[var(--neon-purple)]" />
                  <span className="text-base font-bold">{s.asset}</span>
                  <Chip tone={s.signal === "LONG" ? "bull" : s.signal === "SHORT" ? "bear" : "default"}>{s.signal}</Chip>
                </div>
                <div className="text-[10px] text-muted-foreground">{timeAgo(s.time)}</div>
              </div>

              <div className="relative mb-3 flex h-20 items-center justify-center">
                <svg viewBox="0 0 100 100" className="h-20 w-20 -rotate-90">
                  <circle cx="50" cy="50" r="44" stroke="oklch(0.22 0.03 280)" strokeWidth="8" fill="none" />
                  <circle
                    cx="50" cy="50" r="44" fill="none"
                    stroke={confTone === "purple" ? "oklch(0.65 0.25 295)" : confTone === "bull" ? "oklch(0.82 0.22 150)" : confTone === "warn" ? "oklch(0.88 0.18 95)" : "oklch(0.65 0.03 280)"}
                    strokeWidth="8"
                    strokeDasharray={`${(s.confidence / 100) * 276.5} 276.5`}
                    strokeLinecap="round"
                    className={cn(confTone === "purple" && "pulse-dot")}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-lg font-bold font-mono">{s.confidence}%</div>
                  <div className="text-[9px] uppercase text-muted-foreground">confidence</div>
                </div>
              </div>

              <dl className="space-y-1 font-mono text-xs">
                <Row label="Entry" value={s.entryZone} />
                <Row label="Target" value={`$${s.target.toLocaleString()}`} tone="bull" />
                <Row label="Stop" value={`$${s.stop.toLocaleString()}`} tone="bear" />
              </dl>

              <div className="mt-3 flex flex-wrap gap-1">
                {s.evidence.map((e) => <Chip key={e} tone="blue">{e}</Chip>)}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                <span className="text-[10px] uppercase text-muted-foreground">Risk</span>
                <Chip tone={riskTone as "bull" | "warn" | "bear"}>
                  <Shield className="h-3 w-3" /> {s.risk}
                </Chip>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-semibold", tone === "bull" && "text-bull", tone === "bear" && "text-bear")}>{value}</dd>
    </div>
  );
}
