import { useEffect, useState } from "react";
import { Panel, Chip } from "./Panel";
import { Activity, ArrowUpRight, ArrowDownRight, Box } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "COILING" | "BREAKOUT_LONG" | "BREAKDOWN_SHORT";

interface RangeRow {
  symbol: string;
  floor: number;
  ceiling: number;
  spot: number;
  volMult: number;       // current vol / avg vol
  aggressorSell: number; // 0..1 share of taker sells
  status: Status;
  ageBars: number;
}

function evalStatus(r: Omit<RangeRow, "status">): Status {
  if (r.spot > r.ceiling && r.volMult >= 1.6) return "BREAKOUT_LONG";
  if (r.spot < r.floor && r.aggressorSell >= 0.62) return "BREAKDOWN_SHORT";
  return "COILING";
}

function seed(): RangeRow[] {
  const base = [
    { symbol: "BTC", floor: 106_800, ceiling: 109_400, spot: 108_500 },
    { symbol: "ETH", floor: 3_820, ceiling: 4_010, spot: 3_905 },
    { symbol: "SOL", floor: 178, ceiling: 192, spot: 184 },
    { symbol: "LTC", floor: 92, ceiling: 102, spot: 97 },
  ];
  return base.map((b) => {
    const partial = {
      ...b,
      volMult: 0.8 + Math.random() * 1.4,
      aggressorSell: 0.35 + Math.random() * 0.45,
      ageBars: 8 + Math.floor(Math.random() * 30),
    };
    return { ...partial, status: evalStatus(partial) };
  });
}

function tick(rows: RangeRow[]): RangeRow[] {
  return rows.map((r) => {
    const width = r.ceiling - r.floor;
    const drift = (Math.random() - 0.5) * width * 0.18;
    const spot = Math.max(r.floor * 0.985, Math.min(r.ceiling * 1.015, r.spot + drift));
    const partial = {
      ...r,
      spot,
      volMult: Math.max(0.4, r.volMult + (Math.random() - 0.5) * 0.6),
      aggressorSell: Math.max(0.2, Math.min(0.9, r.aggressorSell + (Math.random() - 0.5) * 0.15)),
      ageBars: r.ageBars + 1,
    };
    return { ...partial, status: evalStatus(partial) };
  });
}

export function RangeBreakoutScanner() {
  const [rows, setRows] = useState<RangeRow[]>(seed);

  useEffect(() => {
    const id = setInterval(() => setRows((r) => tick(r)), 4500);
    return () => clearInterval(id);
  }, []);

  const longs = rows.filter((r) => r.status === "BREAKOUT_LONG").length;
  const shorts = rows.filter((r) => r.status === "BREAKDOWN_SHORT").length;

  return (
    <Panel
      title="Accumulation / Distribution Range Scanner"
      subtitle="Two-way consolidation breakout & breakdown · Volume + Aggressor confirmed"
      accent="green"
      action={
        <div className="flex items-center gap-1.5">
          <Chip tone="bull">▲ {longs} LONG</Chip>
          <Chip tone="bear">▼ {shorts} SHORT</Chip>
          <Chip tone="blue"><Activity size={9} className="animate-pulse" /> SYNC</Chip>
        </div>
      }
    >
      <div className="space-y-3">
        {rows.map((r) => {
          const width = r.ceiling - r.floor;
          const posPct = Math.max(0, Math.min(100, ((r.spot - r.floor) / width) * 100));
          const isLong = r.status === "BREAKOUT_LONG";
          const isShort = r.status === "BREAKDOWN_SHORT";

          return (
            <div
              key={r.symbol}
              className={cn(
                "rounded-lg border-2 p-3 transition-colors",
                isLong && "border-bull/60 bg-bull/5 shadow-[0_0_18px_color-mix(in_oklab,var(--bull)_25%,transparent)]",
                isShort && "border-bear/60 bg-bear/5 shadow-[0_0_18px_color-mix(in_oklab,var(--bear)_25%,transparent)]",
                !isLong && !isShort && "border-border bg-background/30",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Box size={14} className="text-muted-foreground" />
                  <span className="font-mono font-bold text-sm">{r.symbol}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    box · {r.ageBars} bars
                  </span>
                </div>
                {isLong && (
                  <Chip tone="bull">
                    <ArrowUpRight size={10} /> CONFIRMED SWING LONG · RIGHT-SIDE ENTRY
                  </Chip>
                )}
                {isShort && (
                  <Chip tone="bear">
                    <ArrowDownRight size={10} /> CONFIRMED SWING SHORT · LEFT-SIDE ENTRY
                  </Chip>
                )}
                {!isLong && !isShort && <Chip tone="warn">COILING</Chip>}
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono mb-1">
                <span className="text-bear w-20 text-right">${r.floor.toLocaleString()}</span>
                <div className="flex-1 h-2 relative rounded-full bg-secondary/40 overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-bear/30 via-muted-foreground/20 to-bull/30 w-full" />
                  <div
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 h-3 w-1 rounded",
                      isLong ? "bg-bull shadow-[0_0_10px_var(--bull)]"
                             : isShort ? "bg-bear shadow-[0_0_10px_var(--bear)]"
                                       : "bg-[var(--neon-blue)] shadow-[0_0_8px_var(--neon-blue)]",
                    )}
                    style={{ left: `${posPct}%` }}
                  />
                </div>
                <span className="text-bull w-20">${r.ceiling.toLocaleString()}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] font-mono">
                <div>
                  <div className="text-muted-foreground uppercase text-[9px]">Spot</div>
                  <div className="text-foreground font-bold">${r.spot.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase text-[9px]">Vol Mult</div>
                  <div className={cn(r.volMult >= 1.6 ? "text-bull font-bold" : "text-foreground")}>
                    {r.volMult.toFixed(2)}x
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase text-[9px]">Aggressor Sell</div>
                  <div className={cn(r.aggressorSell >= 0.62 ? "text-bear font-bold" : "text-foreground")}>
                    {(r.aggressorSell * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
