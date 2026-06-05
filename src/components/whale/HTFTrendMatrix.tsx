import { useEffect, useMemo, useState } from "react";
import { Panel, Chip, Bar } from "./Panel";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type TF = "4H" | "12H" | "1D";
type Dir = "BULL" | "BEAR" | "FLAT";

interface Row {
  tf: TF;
  emaFast: number;
  emaSlow: number;
  rsi: number;
  dir: Dir;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function genRows(biasSeed: number): Row[] {
  const tfs: TF[] = ["4H", "12H", "1D"];
  return tfs.map((tf) => {
    const drift = biasSeed + rand(-0.4, 0.4);
    const emaFast = 100 + drift * 6;
    const emaSlow = 100;
    const rsi = 50 + drift * 18 + rand(-4, 4);
    const dir: Dir =
      emaFast > emaSlow && rsi > 55 ? "BULL" :
      emaFast < emaSlow && rsi < 45 ? "BEAR" : "FLAT";
    return { tf, emaFast, emaSlow, rsi, dir };
  });
}

export function HTFTrendMatrix() {
  const [bias, setBias] = useState(() => rand(-1, 1));
  const rows = useMemo(() => genRows(bias), [bias]);

  useEffect(() => {
    const id = setInterval(() => setBias(rand(-1.2, 1.2)), 8000);
    return () => clearInterval(id);
  }, []);

  const bullCount = rows.filter((r) => r.dir === "BULL").length;
  const bearCount = rows.filter((r) => r.dir === "BEAR").length;

  type Verdict = {
    label: string;
    tone: "bull" | "bear" | "warn" | "default";
    score: number;
    sub: string;
  };
  const verdict: Verdict = bullCount === 3
    ? { label: "CONFIRMED BULLISH REVERSAL", tone: "bull", score: 95, sub: "4H · 12H · 1D EMAs + RSI flipped positive" }
    : bearCount === 3
    ? { label: "CONFIRMED BEARISH BREAKDOWN", tone: "bear", score: 95, sub: "4H · 12H · 1D EMAs + RSI flipped negative" }
    : bullCount >= 2
    ? { label: "EMERGING UPTREND", tone: "bull", score: 65, sub: "Majority HTF bias turning bullish" }
    : bearCount >= 2
    ? { label: "EMERGING DOWNTREND", tone: "bear", score: 65, sub: "Majority HTF bias turning bearish" }
    : { label: "MIXED / NO BIAS", tone: "warn", score: 30, sub: "HTFs disagree — wait for confluence" };

  const verdictBar = verdict.tone === "bull" ? "bull" : verdict.tone === "bear" ? "bear" : "purple";

  return (
    <Panel
      title="HTF Trend Matrix · Two-Way"
      subtitle="4H / 12H / 1D EMA + RSI confluence · Long & Short bias"
      accent={verdict.tone === "bear" ? "orange" : "green"}
      action={<Chip tone="blue"><Activity size={9} className="animate-pulse" /> AUTO-SYNC</Chip>}
    >
      <div className={cn(
        "rounded-lg border-2 p-3 mb-4",
        verdict.tone === "bull" && "border-bull/50 bg-bull/5 shadow-[0_0_20px_color-mix(in_oklab,var(--bull)_25%,transparent)]",
        verdict.tone === "bear" && "border-bear/50 bg-bear/5 shadow-[0_0_20px_color-mix(in_oklab,var(--bear)_25%,transparent)]",
        verdict.tone === "warn" && "border-[var(--neon-orange)]/40 bg-[var(--neon-orange)]/5",
      )}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Trend Confluence Score</div>
            <div className={cn(
              "text-base sm:text-lg font-bold font-mono tracking-wide",
              verdict.tone === "bull" && "text-bull",
              verdict.tone === "bear" && "text-bear",
              verdict.tone === "warn" && "text-[var(--neon-orange)]",
            )}>
              [{verdict.label}]
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{verdict.sub}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase text-muted-foreground">Score</div>
            <div className="text-2xl font-bold font-mono text-foreground">{verdict.score}</div>
          </div>
        </div>
        <Bar value={verdict.score} tone={verdictBar} />
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
          const Icon = r.dir === "BULL" ? TrendingUp : r.dir === "BEAR" ? TrendingDown : Minus;
          const tone = r.dir === "BULL" ? "bull" : r.dir === "BEAR" ? "bear" : "default";
          return (
            <div key={r.tf} className="flex items-center gap-3 rounded-md border border-border bg-background/30 px-3 py-2">
              <div className="w-12 font-mono text-sm font-bold text-foreground">{r.tf}</div>
              <div className="flex-1 grid grid-cols-3 gap-3 text-[11px] font-mono">
                <div>
                  <div className="text-muted-foreground text-[9px] uppercase">EMA 21/50</div>
                  <div className={cn(r.emaFast >= r.emaSlow ? "text-bull" : "text-bear")}>
                    {r.emaFast >= r.emaSlow ? "▲ Above" : "▼ Below"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[9px] uppercase">RSI(14)</div>
                  <div className={cn(r.rsi > 55 ? "text-bull" : r.rsi < 45 ? "text-bear" : "text-muted-foreground")}>
                    {r.rsi.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[9px] uppercase">Bias</div>
                  <Chip tone={tone}><Icon size={9} /> {r.dir}</Chip>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
