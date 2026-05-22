import { useMemo } from "react";
import { Panel, Chip, Bar } from "./Panel";
import { buildMockWhales } from "@/lib/whale/mock";
import { fmtUSD } from "@/lib/whale/format";

export function SmartMoneyBoard() {
  const top = useMemo(() => [...buildMockWhales()].sort((a, b) => b.smartScore - a.smartScore).slice(0, 10), []);
  return (
    <Panel title="Smart Money Scoreboard" subtitle="Top wallets by composite score" accent="purple">
      <table className="w-full text-xs font-mono">
        <thead className="text-[10px] uppercase text-muted-foreground border-b border-border">
          <tr>
            <th className="px-2 py-2 text-left">#</th>
            <th className="px-2 py-2 text-left">Alias</th>
            <th className="px-2 py-2 text-right">Win%</th>
            <th className="px-2 py-2 text-right">Avg PnL</th>
            <th className="px-2 py-2 text-right">Current</th>
            <th className="px-2 py-2 text-center">Score</th>
            <th className="px-2 py-2 text-center">Rating</th>
          </tr>
        </thead>
        <tbody>
          {top.map((w, i) => {
            const winRate = 50 + (w.smartScore - 50) * 0.7;
            const avgPnl = (w.smartScore - 60) * 0.8;
            const rating = w.smartScore >= 90 ? { t: "✅ FOLLOW", tone: "bull" as const }
              : w.smartScore >= 70 ? { t: "👁️ WATCH", tone: "blue" as const }
              : w.smartScore >= 50 ? { t: "⚠️ CAUTION", tone: "warn" as const }
              : { t: "❌ IGNORE", tone: "bear" as const };
            return (
              <tr key={w.id} className="border-b border-border/60 hover:bg-card-hover">
                <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-2">
                  <div className="font-semibold">{w.alias}</div>
                  <div className="text-[10px] text-muted-foreground">{w.wallet}</div>
                </td>
                <td className="px-2 py-2 text-right text-bull">{winRate.toFixed(1)}%</td>
                <td className={`px-2 py-2 text-right ${avgPnl >= 0 ? "text-bull" : "text-bear"}`}>{avgPnl >= 0 ? "+" : ""}{avgPnl.toFixed(1)}%</td>
                <td className="px-2 py-2 text-right text-muted-foreground">{w.side} {w.symbol} · {fmtUSD(w.size)}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div className="font-bold w-7 text-right">{w.smartScore}</div>
                    <Bar value={w.smartScore} tone={w.smartScore >= 90 ? "purple" : "bull"} />
                  </div>
                </td>
                <td className="px-2 py-2 text-center"><Chip tone={rating.tone}>{rating.t}</Chip></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
