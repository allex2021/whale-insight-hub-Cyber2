import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Zap } from "lucide-react";
import { SkeletonLoader } from "./SkeletonLoader";
import { useBinanceWhaleStream } from "@/hooks/useBinanceWhaleStream";
import { fmtUSD } from "@/lib/whale/format";
import { cn } from "@/lib/utils";

type Alert = {
  id: string;
  tone: "bull" | "bear" | "warn";
  icon: "zap" | "warn";
  text: string;
};

/**
 * Single-line rotating priority alert ticker.
 * Surfaces the biggest live whale trades + cascade-risk style derived alerts.
 */
export function PriorityAlertTicker() {
  const { trades } = useBinanceWhaleStream(2_000_000, 50);
  const [idx, setIdx] = useState(0);

  const alerts = useMemo<Alert[]>(() => {
    const top = trades
      .slice()
      .sort((a, b) => b.sizeUsd - a.sizeUsd)
      .slice(0, 5)
      .map<Alert>((t) => ({
        id: t.id,
        tone: t.side === "BUY" ? "bull" : "bear",
        icon: "zap",
        text: `${t.asset} ${t.side === "BUY" ? "BID" : "ASK"} ${fmtUSD(t.sizeUsd)} @ $${t.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} — SmartScore ${Math.min(99, 70 + Math.round(t.sizeUsd / 1e6))}`,
      }));
    if (top.length === 0) {
      return [
        { id: "boot", tone: "warn", icon: "warn", text: "Awaiting whale flow from Binance stream…" },
      ];
    }
    return top;
  }, [trades]);

  useEffect(() => {
    if (alerts.length <= 1) return;
    const i = setInterval(() => setIdx((p) => (p + 1) % alerts.length), 4_500);
    return () => clearInterval(i);
  }, [alerts.length]);

  const current = alerts[idx % alerts.length];
  const Icon = current.icon === "zap" ? Zap : AlertTriangle;
  const toneCls =
    current.tone === "bull"
      ? "border-bull/40 bg-bull/5 text-bull"
      : current.tone === "bear"
        ? "border-bear/40 bg-bear/5 text-bear"
        : "border-[var(--neon-yellow)]/40 bg-[var(--neon-yellow)]/5 text-[var(--neon-yellow)]";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-2.5 font-mono text-xs sm:text-sm",
        toneCls,
      )}
    >
      <Icon className="h-4 w-4 shrink-0 animate-pulse" />
      <span key={current.id} className="flex-1 truncate animate-in fade-in slide-in-from-left-2 duration-300">
        {current.text}
      </span>
      <span className="shrink-0 text-[10px] opacity-70 font-sans">
        {idx + 1}/{alerts.length}
      </span>
    </div>
  );
}
