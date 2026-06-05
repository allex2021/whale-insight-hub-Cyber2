import { useEffect, useState } from "react";
import { Panel, Chip } from "./Panel";
import { Activity, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Row {
  symbol: string;
  priceChg: number;   // % over window
  oiChg: number;      // % OI delta
  funding: number;    // 8h rate, decimal (e.g. 0.0001 = 0.01%)
}

type Verdict = {
  label: string;
  tone: "bull" | "bear" | "warn" | "default";
  detail: string;
};

function judge(r: Row): Verdict {
  // Bearish whale short build-up: price flat/down + OI sharply up + negative funding
  if (r.priceChg <= 0.3 && r.oiChg >= 3 && r.funding < 0) {
    return {
      label: "WHALE SHORT BUILD-UP",
      tone: "bear",
      detail: "Flat price · OI expanding · negative funding — macro swing shorts loading",
    };
  }
  // Bullish whale long build-up: price flat/up + OI up + positive funding fading
  if (r.priceChg >= -0.3 && r.oiChg >= 3 && r.funding > 0.005) {
    return {
      label: "WHALE LONG BUILD-UP",
      tone: "bull",
      detail: "OI expanding with positive funding — swing longs absorbing supply",
    };
  }
  if (r.oiChg <= -3 && r.priceChg <= -1) {
    return { label: "LONGS UNWINDING", tone: "warn", detail: "Capitulation flush — OI bleeding with price" };
  }
  if (r.oiChg <= -3 && r.priceChg >= 1) {
    return { label: "SHORT COVER", tone: "warn", detail: "Shorts closing into strength" };
  }
  return { label: "NEUTRAL", tone: "default", detail: "No divergence signal" };
}

function seed(): Row[] {
  const syms = ["BTC", "ETH", "SOL", "LTC"];
  return syms.map((s) => ({
    symbol: s,
    priceChg: (Math.random() - 0.5) * 3,
    oiChg: (Math.random() - 0.3) * 8,
    funding: (Math.random() - 0.5) * 0.04,
  }));
}

export function OIFundingDivergence() {
  const [rows, setRows] = useState<Row[]>(seed);

  useEffect(() => {
    const id = setInterval(() => setRows(seed()), 7000);
    return () => clearInterval(id);
  }, []);

  const shortBuildups = rows.filter((r) => judge(r).tone === "bear").length;
  const longBuildups = rows.filter((r) => judge(r).tone === "bull").length;

  return (
    <Panel
      title="OI · Funding Divergence · Two-Way"
      subtitle="Whale build-up scanner · long & short positioning before breakouts"
      accent="orange"
      action={
        <div className="flex items-center gap-1.5">
          <Chip tone="bull">▲ {longBuildups}</Chip>
          <Chip tone="bear">▼ {shortBuildups}</Chip>
          <Chip tone="blue"><Activity size={9} className="animate-pulse" /> SYNC</Chip>
        </div>
      }
    >
      <div className="space-y-2">
        {rows.map((r) => {
          const v = judge(r);
          const Icon = v.tone === "bull" ? TrendingUp : v.tone === "bear" ? TrendingDown : AlertTriangle;
          const isAlert = v.tone === "bear" || v.tone === "bull";
          return (
            <div
              key={r.symbol}
              className={cn(
                "rounded-lg border p-3",
                v.tone === "bear" && "border-bear/60 bg-bear/5 shadow-[0_0_16px_color-mix(in_oklab,var(--bear)_22%,transparent)]",
                v.tone === "bull" && "border-bull/60 bg-bull/5 shadow-[0_0_16px_color-mix(in_oklab,var(--bull)_22%,transparent)]",
                v.tone === "warn" && "border-[var(--neon-orange)]/40 bg-[var(--neon-orange)]/5",
                v.tone === "default" && "border-border bg-background/30",
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="font-mono font-bold text-sm">{r.symbol}-PERP</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{v.detail}</div>
                </div>
                <Chip tone={v.tone === "default" ? "default" : v.tone}>
                  <Icon size={10} className={isAlert ? "animate-pulse" : ""} />
                  {v.label}
                </Chip>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                <Stat
                  label="Price 24h"
                  value={`${r.priceChg >= 0 ? "+" : ""}${r.priceChg.toFixed(2)}%`}
                  tone={r.priceChg >= 0 ? "bull" : "bear"}
                />
                <Stat
                  label="OI Δ"
                  value={`${r.oiChg >= 0 ? "+" : ""}${r.oiChg.toFixed(2)}%`}
                  tone={r.oiChg >= 0 ? "bull" : "bear"}
                />
                <Stat
                  label="Funding 8h"
                  value={`${(r.funding * 100).toFixed(4)}%`}
                  tone={r.funding >= 0 ? "bull" : "bear"}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "bull" | "bear" }) {
  return (
    <div className="rounded-md border border-border bg-secondary/20 p-2">
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-bold", tone === "bull" ? "text-bull" : "text-bear")}>{value}</div>
    </div>
  );
}
