import { useEffect, useMemo, useRef, useState, memo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Activity, Zap, TrendingUp, TrendingDown, Wifi, Radio,
  Rocket, AlertTriangle, Hourglass, Wallet, Star, ChevronUp, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Types & seed data
// ─────────────────────────────────────────────────────────────
type SignalKind = "LONG" | "SHORT" | "HOLD";

interface Coin {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  rsi: number;
  macd: "GOLDEN" | "BEARISH" | "NEUTRAL";
  volBreakout: boolean;
  prev: number;
  flash: "up" | "down" | null;
  flashAt: number;
}

const SEED: Omit<Coin, "prev" | "flash" | "flashAt">[] = [
  { symbol: "SUI/USDT",  name: "Sui",          price: 4.218,    change24h: 18.42, rsi: 78.3, macd: "BEARISH", volBreakout: false },
  { symbol: "SOL/USDT",  name: "Solana",       price: 248.14,   change24h: 12.07, rsi: 36.4, macd: "GOLDEN",  volBreakout: true  },
  { symbol: "TIA/USDT",  name: "Celestia",     price: 7.842,    change24h: 9.61,  rsi: 62.1, macd: "NEUTRAL", volBreakout: false },
  { symbol: "SEI/USDT",  name: "Sei",          price: 0.5891,   change24h: 22.84, rsi: 81.7, macd: "BEARISH", volBreakout: false },
  { symbol: "INJ/USDT",  name: "Injective",    price: 28.46,    change24h: 7.32,  rsi: 38.9, macd: "GOLDEN",  volBreakout: true  },
];

const ANCHORS = [
  { symbol: "BTC", name: "Bitcoin",  price: 102_847, change24h: 2.14 },
  { symbol: "ETH", name: "Ethereum", price: 3_812,   change24h: 3.46 },
];

const HOLDINGS = [
  { symbol: "SUI", qty: 412.50, avg: 0.7598, current: 4.218 },
];

// ─────────────────────────────────────────────────────────────
// Signal logic
// ─────────────────────────────────────────────────────────────
function deriveSignal(c: Coin): { kind: SignalKind; prob: number; target: number } {
  if (c.rsi > 75 && c.macd === "BEARISH") {
    const prob = Math.min(95, 70 + (c.rsi - 75) * 2);
    return { kind: "SHORT", prob: Math.round(prob), target: +(c.price * (1 - (c.rsi - 70) / 400)).toFixed(4) };
  }
  if (c.rsi < 40 && c.macd === "GOLDEN" && c.volBreakout) {
    const prob = Math.min(95, 72 + (40 - c.rsi) * 1.6);
    return { kind: "LONG", prob: Math.round(prob), target: +(c.price * (1 + (45 - c.rsi) / 250)).toFixed(4) };
  }
  return { kind: "HOLD", prob: 50, target: c.price };
}

// ─────────────────────────────────────────────────────────────
// Live ping badge
// ─────────────────────────────────────────────────────────────
const LivePing = memo(function LivePing() {
  const [ping, setPing] = useState(12);
  useEffect(() => {
    const id = setInterval(() => setPing(8 + Math.floor(Math.random() * 18)), 1800);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <Wifi size={11} />
      <span>WS Connected</span>
      <span className="text-emerald-300/80">·</span>
      <span className="tabular-nums">{ping}ms</span>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// Signal badge
// ─────────────────────────────────────────────────────────────
function SignalBadge({ kind, prob }: { kind: SignalKind; prob: number }) {
  if (kind === "SHORT") {
    return (
      <Badge className="gap-1.5 rounded-md border border-red-500/50 bg-red-500/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-red-400 shadow-[0_0_14px_rgba(239,68,68,0.45)] animate-pulse">
        <AlertTriangle size={11} />
        SWING SHORT · {prob}%
      </Badge>
    );
  }
  if (kind === "LONG") {
    return (
      <Badge className="gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.45)] animate-pulse">
        <Rocket size={11} />
        SWING LONG · {prob}%
      </Badge>
    );
  }
  return (
    <Badge className="gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
      <Hourglass size={11} />
      HOLD / ACCUMULATE
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────
// Flashing price cell
// ─────────────────────────────────────────────────────────────
function FlashPrice({ price, flash }: { price: number; flash: Coin["flash"] }) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums font-bold transition-colors duration-500",
        flash === "up" && "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.65)]",
        flash === "down" && "text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.65)]",
        !flash && "text-foreground",
      )}
    >
      ${price < 1 ? price.toFixed(4) : price < 100 ? price.toFixed(3) : price.toFixed(2)}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export function SwingSignalEngine() {
  const [coins, setCoins] = useState<Coin[]>(() =>
    SEED.map((c) => ({ ...c, prev: c.price, flash: null, flashAt: 0 })),
  );
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Skeleton flash
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 650);
    return () => clearTimeout(t);
  }, []);

  // Simulated WS ticks
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCoins((prev) =>
        prev.map((c) => {
          const drift = (Math.random() - 0.48) * 0.006;
          const newPrice = +(c.price * (1 + drift)).toFixed(c.price < 1 ? 4 : 3);
          const flash: Coin["flash"] = newPrice > c.price ? "up" : newPrice < c.price ? "down" : c.flash;
          // mild RSI drift
          const newRsi = Math.max(10, Math.min(92, c.rsi + (Math.random() - 0.5) * 1.4));
          const newChange = +(c.change24h + (Math.random() - 0.5) * 0.3).toFixed(2);
          return {
            ...c,
            prev: c.price,
            price: newPrice,
            rsi: newRsi,
            change24h: newChange,
            flash,
            flashAt: Date.now(),
          };
        }),
      );
    }, 1400);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Clear flash highlight
  useEffect(() => {
    const id = setInterval(() => {
      setCoins((prev) =>
        prev.map((c) => (c.flash && Date.now() - c.flashAt > 700 ? { ...c, flash: null } : c)),
      );
    }, 400);
    return () => clearInterval(id);
  }, []);

  const portfolio = useMemo(() => {
    const sui = coins.find((c) => c.symbol === "SUI/USDT");
    const suiPrice = sui?.price ?? HOLDINGS[0].current;
    const h = HOLDINGS[0];
    const value = h.qty * suiPrice;
    const cost = h.qty * h.avg;
    const pnl = value - cost;
    const pnlPct = (pnl / cost) * 100;
    return { suiPrice, value, pnl, pnlPct };
  }, [coins]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-background/40 to-red-500/5 p-3 shadow-[0_0_24px_rgba(16,185,129,0.08)]">
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-1.5">
            <Zap size={16} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="font-mono text-sm font-bold uppercase tracking-[0.18em] text-foreground">
              Swing Signal Engine
            </h2>
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              4H RSI + MACD Confluence · Top Gainers Scanner
            </p>
          </div>
        </div>
        <LivePing />
      </div>

      {/* Layout: signals + sidebar */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        {/* Signals */}
        <Card className="border-border/60 bg-card/40 backdrop-blur">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              <Radio size={12} className="text-emerald-400 animate-pulse" />
              Top 5 Gainers · Live Signal Feed
            </div>
            <Badge variant="outline" className="font-mono text-[9px] uppercase">
              4H Timeframe
            </Badge>
          </div>

          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60 hover:bg-transparent">
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">Token</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">Price</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">24h %</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">RSI</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">Signal</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">Target</TableHead>
                    <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coins.map((c) => {
                    const sig = deriveSignal(c);
                    const isShort = sig.kind === "SHORT";
                    const isLong = sig.kind === "LONG";
                    return (
                      <TableRow key={c.symbol} className="border-border/40 hover:bg-emerald-500/[0.03]">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold tracking-wider">{c.symbol}</span>
                            <span className="text-[10px] text-muted-foreground">{c.name}</span>
                          </div>
                        </TableCell>
                        <TableCell><FlashPrice price={c.price} flash={c.flash} /></TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 font-mono text-xs font-bold tabular-nums",
                              c.change24h >= 0 ? "text-emerald-400" : "text-red-400",
                            )}
                          >
                            {c.change24h >= 0 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {Math.abs(c.change24h).toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "font-mono text-xs font-bold tabular-nums",
                              c.rsi > 75 ? "text-red-400" : c.rsi < 40 ? "text-emerald-400" : "text-amber-400",
                            )}
                          >
                            {c.rsi.toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell><SignalBadge kind={sig.kind} prob={sig.prob} /></TableCell>
                        <TableCell>
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            ${sig.target < 1 ? sig.target.toFixed(4) : sig.target.toFixed(3)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            className={cn(
                              "h-7 gap-1 rounded-md font-mono text-[10px] font-bold uppercase tracking-wider",
                              isShort && "bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/40",
                              isLong && "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/40",
                              !isShort && !isLong && "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-border/60",
                            )}
                          >
                            <Zap size={11} />
                            Quick {isShort ? "Short" : isLong ? "Long" : "Trade"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Portfolio */}
          <Card className="border-emerald-500/30 bg-card/40 p-4 shadow-[0_0_20px_rgba(16,185,129,0.08)]">
            <div className="mb-3 flex items-center gap-2">
              <Wallet size={14} className="text-emerald-400" />
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                Mini Portfolio
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground">Total Balance</div>
                <div className="font-mono text-xl font-bold tabular-nums text-foreground">
                  ${portfolio.value.toFixed(2)}
                </div>
              </div>
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase">
                  <span className="font-bold tracking-wider text-emerald-400">SUI · SPOT</span>
                  <span className="text-muted-foreground">{HOLDINGS[0].qty} units</span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <div className="text-muted-foreground">Avg Buy</div>
                    <div className="font-mono font-bold tabular-nums">${HOLDINGS[0].avg.toFixed(4)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Current</div>
                    <FlashPrice price={portfolio.suiPrice} flash={coins[0].flash} />
                  </div>
                </div>
                <div className="mt-2 border-t border-emerald-500/20 pt-1.5">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">Unrealized PnL</div>
                  <div
                    className={cn(
                      "font-mono text-sm font-bold tabular-nums",
                      portfolio.pnl >= 0
                        ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.55)] animate-pulse"
                        : "text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.55)]",
                    )}
                  >
                    {portfolio.pnl >= 0 ? "+" : ""}${portfolio.pnl.toFixed(2)} ({portfolio.pnlPct.toFixed(1)}%)
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Market anchors */}
          <Card className="border-border/60 bg-card/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Star size={14} className="text-amber-400" />
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                Market Anchors
              </span>
            </div>
            <div className="space-y-2">
              {ANCHORS.map((a) => (
                <div
                  key={a.symbol}
                  className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-2.5 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Activity size={12} className="text-muted-foreground" />
                    <div>
                      <div className="font-mono text-xs font-bold tracking-wider">{a.symbol}</div>
                      <div className="text-[9px] text-muted-foreground">{a.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs font-bold tabular-nums">
                      ${a.price.toLocaleString()}
                    </div>
                    <div
                      className={cn(
                        "flex items-center justify-end gap-0.5 font-mono text-[10px] font-bold",
                        a.change24h >= 0 ? "text-emerald-400" : "text-red-400",
                      )}
                    >
                      {a.change24h >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {Math.abs(a.change24h).toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick tabs */}
          <Card className="border-border/60 bg-card/40 p-3">
            <Tabs defaultValue="watch">
              <TabsList className="grid w-full grid-cols-2 bg-background/40">
                <TabsTrigger value="watch" className="font-mono text-[10px] uppercase">Watchlist</TabsTrigger>
                <TabsTrigger value="recent" className="font-mono text-[10px] uppercase">Recent</TabsTrigger>
              </TabsList>
              <TabsContent value="watch" className="mt-2 space-y-1.5">
                {coins.slice(0, 3).map((c) => (
                  <div key={c.symbol} className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-background/40">
                    <span className="font-mono font-bold">{c.symbol.split("/")[0]}</span>
                    <FlashPrice price={c.price} flash={c.flash} />
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="recent" className="mt-2 text-[10px] font-mono text-muted-foreground">
                No recent trades.
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default SwingSignalEngine;
