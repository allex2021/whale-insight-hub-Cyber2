import { useEffect, useMemo, useState } from "react";
import { Panel, Chip } from "./Panel";
import { fmtUSD, timeAgo } from "@/lib/whale/format";
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, ExternalLink, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

type Action = "BUY" | "SELL" | "TRANSFER" | "INFLOW" | "OUTFLOW";
type Direction = "BULLISH" | "BEARISH" | "NEUTRAL";

interface InsiderRow {
  id: string;
  entity: string;
  tag: "VC" | "MARKET_MAKER" | "SMART_MONEY" | "INSIDER" | "FUND";
  wallet: string;
  action: Action;
  token: string;
  value: number;
  venue: string;
  chain: string;
  ts: number;
  direction: Direction;
}

const ENTITIES: { entity: string; tag: InsiderRow["tag"] }[] = [
  { entity: "Jump Crypto", tag: "MARKET_MAKER" },
  { entity: "Wintermute", tag: "MARKET_MAKER" },
  { entity: "GSR Markets", tag: "MARKET_MAKER" },
  { entity: "Cumberland", tag: "MARKET_MAKER" },
  { entity: "Paradigm", tag: "VC" },
  { entity: "a16z Crypto", tag: "VC" },
  { entity: "Pantera Capital", tag: "VC" },
  { entity: "Galaxy Digital", tag: "FUND" },
  { entity: "Smart Money Whale #04", tag: "SMART_MONEY" },
  { entity: "Smart Money Whale #17", tag: "SMART_MONEY" },
  { entity: "Insider Wallet 0x9a..b3", tag: "INSIDER" },
  { entity: "Alameda Remnant", tag: "INSIDER" },
  { entity: "BlackRock Custody", tag: "FUND" },
];
const TOKENS = ["BTC", "ETH", "SOL", "LTC", "ARB", "OP", "LINK", "PEPE", "AAVE"];
const VENUES = ["Binance", "Coinbase", "OKX", "Bybit", "Kraken", "Cold Storage", "Uniswap V3"];
const CHAINS = ["Ethereum", "Solana", "Arbitrum", "Base", "BSC"];

const randItem = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function genRow(): InsiderRow {
  const e = randItem(ENTITIES);
  const actionRoll = Math.random();
  let action: Action;
  let direction: Direction;
  if (actionRoll < 0.3) { action = "OUTFLOW"; direction = "BULLISH"; }
  else if (actionRoll < 0.55) { action = "INFLOW"; direction = "BEARISH"; }
  else if (actionRoll < 0.75) { action = "BUY"; direction = "BULLISH"; }
  else if (actionRoll < 0.9) { action = "SELL"; direction = "BEARISH"; }
  else { action = "TRANSFER"; direction = "NEUTRAL"; }
  const value = Math.floor(500_000 + Math.random() * 50_000_000);
  const wallet = `0x${Math.random().toString(16).slice(2, 6)}…${Math.random().toString(16).slice(2, 6)}`;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entity: e.entity, tag: e.tag, wallet,
    action, token: randItem(TOKENS),
    value, venue: action === "OUTFLOW" ? "Cold Storage" : randItem(VENUES),
    chain: randItem(CHAINS),
    ts: Date.now() - Math.floor(Math.random() * 120_000),
    direction,
  };
}

const tagTone: Record<InsiderRow["tag"], "purple" | "blue" | "warn" | "bull" | "bear"> = {
  VC: "purple", MARKET_MAKER: "blue", SMART_MONEY: "bull", FUND: "blue", INSIDER: "warn",
};

const actionIcon = (a: Action) => {
  if (a === "OUTFLOW" || a === "BUY") return <ArrowDownToLine size={12} />;
  if (a === "INFLOW" || a === "SELL") return <ArrowUpFromLine size={12} />;
  return <ArrowLeftRight size={12} />;
};

export function InsiderVCTracker() {
  const [rows, setRows] = useState<InsiderRow[]>(() => Array.from({ length: 14 }, genRow).sort((a, b) => b.ts - a.ts));
  const [filter, setFilter] = useState<"ALL" | "BULLISH" | "BEARISH">("ALL");

  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) => [genRow(), ...prev].slice(0, 30));
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(
    () => filter === "ALL" ? rows : rows.filter(r => r.direction === filter),
    [rows, filter],
  );

  const stats = useMemo(() => {
    const bull = rows.filter(r => r.direction === "BULLISH").reduce((s, r) => s + r.value, 0);
    const bear = rows.filter(r => r.direction === "BEARISH").reduce((s, r) => s + r.value, 0);
    return { bull, bear, net: bull - bear };
  }, [rows]);

  return (
    <Panel
      title="Insider & VC Tracker"
      subtitle="Arkham + Nansen style — live entity-tagged whale flows"
      accent="purple"
      action={
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono text-bull">
            <Radio size={10} className="animate-pulse" /> LIVE SYNC
          </span>
          <div className="flex rounded-md border border-border bg-secondary/40 p-0.5">
            {(["ALL", "BULLISH", "BEARISH"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded transition-colors",
                  filter === f
                    ? f === "BULLISH" ? "bg-bull/20 text-bull"
                      : f === "BEARISH" ? "bg-bear/20 text-bear"
                      : "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >{f}</button>
            ))}
          </div>
        </div>
      }
    >
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border border-bull/30 bg-bull/5 p-2">
          <div className="text-[9px] font-mono uppercase text-muted-foreground">Smart Inflow</div>
          <div className="text-sm font-bold text-bull font-mono">{fmtUSD(stats.bull)}</div>
        </div>
        <div className="rounded-md border border-bear/30 bg-bear/5 p-2">
          <div className="text-[9px] font-mono uppercase text-muted-foreground">Smart Outflow</div>
          <div className="text-sm font-bold text-bear font-mono">{fmtUSD(stats.bear)}</div>
        </div>
        <div className={cn("rounded-md border p-2",
          stats.net >= 0 ? "border-bull/30 bg-bull/5" : "border-bear/30 bg-bear/5")}>
          <div className="text-[9px] font-mono uppercase text-muted-foreground">Net Bias</div>
          <div className={cn("text-sm font-bold font-mono", stats.net >= 0 ? "text-bull" : "text-bear")}>
            {stats.net >= 0 ? "+" : "−"}{fmtUSD(Math.abs(stats.net))}
          </div>
        </div>
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card/95 backdrop-blur z-10">
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium py-2 px-2">Entity</th>
              <th className="text-left font-medium py-2 px-2 hidden sm:table-cell">Action</th>
              <th className="text-left font-medium py-2 px-2">Token</th>
              <th className="text-right font-medium py-2 px-2">Value</th>
              <th className="text-left font-medium py-2 px-2 hidden md:table-cell">Venue / Chain</th>
              <th className="text-right font-medium py-2 px-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className={cn(
                "border-b border-border/40 hover:bg-secondary/30 transition-colors",
                r.direction === "BULLISH" && "border-l-2 border-l-bull/60",
                r.direction === "BEARISH" && "border-l-2 border-l-bear/60",
              )}>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Chip tone={tagTone[r.tag]}>{r.tag.replace("_", " ")}</Chip>
                    <span className="font-semibold text-foreground text-[11px]">{r.entity}</span>
                  </div>
                  <div className="text-[9px] font-mono text-muted-foreground mt-0.5">{r.wallet}</div>
                </td>
                <td className="py-2 px-2 hidden sm:table-cell">
                  <span className={cn(
                    "inline-flex items-center gap-1 font-mono text-[11px] font-bold",
                    r.direction === "BULLISH" ? "text-bull" : r.direction === "BEARISH" ? "text-bear" : "text-muted-foreground",
                  )}>{actionIcon(r.action)} {r.action}</span>
                </td>
                <td className="py-2 px-2 font-mono font-bold text-foreground">{r.token}</td>
                <td className="py-2 px-2 text-right font-mono font-bold text-foreground">{fmtUSD(r.value)}</td>
                <td className="py-2 px-2 hidden md:table-cell">
                  <div className="text-[11px] text-foreground">{r.venue}</div>
                  <div className="text-[9px] font-mono text-muted-foreground">{r.chain}</div>
                </td>
                <td className="py-2 px-2 text-right text-[10px] font-mono text-muted-foreground whitespace-nowrap">{timeAgo(r.ts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>Source: Simulated Arkham + Nansen labels</span>
        <span className="flex items-center gap-1"><ExternalLink size={9} /> Click row for wallet trace</span>
      </div>
    </Panel>
  );
}
