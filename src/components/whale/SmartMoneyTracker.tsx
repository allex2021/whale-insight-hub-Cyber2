import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star, Copy, Trash2, ExternalLink, TrendingUp, TrendingDown, X } from "lucide-react";
import { Panel, Chip, Bar } from "./Panel";
import { LoadingState, ErrorState, EmptyState } from "./StateView";
import { fetchHyperliquidWhales, type WhalePosition } from "@/lib/whale/hyperliquid.functions";
import { useFollowedWallets, useCopySignals, type CopySignal } from "@/hooks/useFollowedWallets";
import { fmtUSD, fmtPrice, fmtPct, timeAgo } from "@/lib/whale/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Tab = "all" | "followed" | "signals";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function SmartMoneyTracker() {
  const fetchFn = useServerFn(fetchHyperliquidWhales);
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["hl-whales-tracker"],
    queryFn: () => fetchFn(),
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  const { followed, toggle, isFollowed } = useFollowedWallets();
  const { signals, clear } = useCopySignals();
  const [tab, setTab] = useState<Tab>("all");
  const [copyTarget, setCopyTarget] = useState<WhalePosition | null>(null);

  const rows = useMemo(() => {
    const all = (data ?? []).slice().sort((a, b) => b.smartScore - a.smartScore);
    if (tab === "followed") return all.filter((w) => isFollowed(w.address));
    return all.slice(0, 20);
  }, [data, tab, isFollowed]);

  const action = (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card/60 p-0.5">
      {(["all", "followed", "signals"] as Tab[]).map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={cn(
            "rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors",
            tab === t
              ? "bg-[var(--neon-purple)]/25 text-foreground shadow-[0_0_10px_rgba(168,85,247,0.3)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t === "all" ? "Top 20" : t === "followed" ? `Followed (${followed.length})` : `Signals (${signals.length})`}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Panel
        title="Smart Money Wallet Tracker"
        subtitle="Hyperliquid leaderboard · top traders' live positions · follow & copy"
        accent="purple"
        action={action}
      >
        {isLoading && !data && <LoadingState />}
        {error && <ErrorState error={String((error as Error).message)} onRetry={() => refetch()} />}

        {tab === "signals" && (
          <SignalHistory signals={signals} onClear={clear} />
        )}

        {tab !== "signals" && data && rows.length === 0 && (
          <EmptyState
            label={tab === "followed" ? "No wallets followed yet. Tap the ★ on any trader below to follow them." : "No whales online right now."}
          />
        )}

        {tab !== "signals" && data && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="text-[10px] uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-2 py-2 text-left">Trader</th>
                  <th className="px-2 py-2 text-left">Position</th>
                  <th className="px-2 py-2 text-right">Size</th>
                  <th className="px-2 py-2 text-right">Lev</th>
                  <th className="px-2 py-2 text-right">Entry / Mark</th>
                  <th className="px-2 py-2 text-right">uPnL</th>
                  <th className="px-2 py-2 text-right">Liq</th>
                  <th className="px-2 py-2 text-center">Score</th>
                  <th className="px-2 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => {
                  const followedNow = isFollowed(w.address);
                  return (
                    <tr key={w.address} className="border-b border-border/60 hover:bg-card-hover">
                      <td className="px-2 py-2">
                        <div className="font-semibold">{w.alias}</div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span>{shortAddr(w.address)}</span>
                          <a
                            href={`https://app.hyperliquid.xyz/explorer/address/${w.address}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-[var(--neon-blue)]"
                            aria-label="Open on Hyperliquid"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <div className="text-[10px] text-muted-foreground">AV {fmtUSD(w.accountValue)}</div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold">{w.coin}</span>
                          <Chip tone={w.side === "LONG" ? "bull" : "bear"}>
                            {w.side === "LONG" ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                            {w.side}
                          </Chip>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">{fmtUSD(w.sizeUsd)}</td>
                      <td className="px-2 py-2 text-right">
                        <span className={cn(
                          "font-bold",
                          w.leverage >= 20 ? "text-bear" : w.leverage >= 10 ? "text-[var(--neon-orange)]" : "text-foreground",
                        )}>
                          {w.leverage}x
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div>{fmtPrice(w.entry)}</div>
                        <div className="text-[10px] text-muted-foreground">{fmtPrice(w.current)}</div>
                      </td>
                      <td className={cn("px-2 py-2 text-right font-bold", w.unrealizedPnl >= 0 ? "text-bull" : "text-bear")}>
                        <div>{fmtUSD(Math.abs(w.unrealizedPnl))}</div>
                        <div className="text-[10px]">{fmtPct(w.pnlPct)}</div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        {w.liqPrice ? (
                          <>
                            <div className="text-bear">{fmtPrice(w.liqPrice)}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {w.liqDistancePct ? fmtPct(w.liqDistancePct, 1) : "—"}
                            </div>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-7 text-right font-bold">{w.smartScore}</span>
                          <Bar value={w.smartScore} tone="purple" />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              toggle(w.address);
                              toast.success(followedNow ? `Unfollowed ${w.alias}` : `Following ${w.alias}`);
                            }}
                            className={cn(
                              "rounded p-1.5 transition-colors",
                              followedNow
                                ? "bg-[var(--neon-yellow)]/20 text-[var(--neon-yellow)]"
                                : "text-muted-foreground hover:bg-card-hover hover:text-foreground",
                            )}
                            aria-label={followedNow ? "Unfollow" : "Follow"}
                            title={followedNow ? "Unfollow" : "Follow"}
                          >
                            <Star className={cn("h-3.5 w-3.5", followedNow && "fill-current")} />
                          </button>
                          <button
                            onClick={() => setCopyTarget(w)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-[var(--neon-purple)]/20 hover:text-[var(--neon-purple)] transition-colors"
                            aria-label="Copy signal"
                            title="Generate copy signal"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {copyTarget && <CopySignalModal whale={copyTarget} onClose={() => setCopyTarget(null)} />}
    </>
  );
}

// ───────────────────────────────── Copy Signal Modal ─────────────────────────────────

function CopySignalModal({ whale, onClose }: { whale: WhalePosition; onClose: () => void }) {
  const { save } = useCopySignals();
  const [accountUsd, setAccountUsd] = useState<number>(() => {
    if (typeof window === "undefined") return 10_000;
    const saved = Number(localStorage.getItem("wip:account-usd"));
    return saved > 0 ? saved : 10_000;
  });
  const [riskPct, setRiskPct] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const saved = Number(localStorage.getItem("wip:risk-pct"));
    return saved > 0 ? saved : 1;
  });
  const [maxLev, setMaxLev] = useState<number>(10);

  // Risk math: stop = halfway between current and liq (capped to 5% adverse move).
  // Target = 2R from entry, in trade direction.
  const calc = useMemo(() => {
    const isLong = whale.side === "LONG";
    const entry = whale.current; // copy at current mark, not their stale entry
    let stop: number;
    if (whale.liqPrice) {
      // Place stop at 50% of distance to liq, but never worse than 5% adverse
      const halfwayToLiq = (entry + whale.liqPrice) / 2;
      const cap = isLong ? entry * 0.95 : entry * 1.05;
      stop = isLong ? Math.max(halfwayToLiq, cap) : Math.min(halfwayToLiq, cap);
    } else {
      stop = isLong ? entry * 0.97 : entry * 1.03;
    }
    const stopDistPct = Math.abs((entry - stop) / entry) * 100;
    const target = isLong
      ? entry + (entry - stop) * 2
      : entry - (stop - entry) * 2;

    const riskUsd = (accountUsd * riskPct) / 100;
    // notional = riskUsd / (stopDistPct/100)
    const notional = riskUsd / Math.max(stopDistPct / 100, 0.001);
    const reqLev = notional / accountUsd;
    const usedLev = Math.min(Math.max(1, Math.round(reqLev)), maxLev);
    const positionUsd = Math.min(notional, accountUsd * maxLev);

    return { entry, stop, target, stopDistPct, riskUsd, positionUsd, usedLev };
  }, [whale, accountUsd, riskPct, maxLev]);

  const onSave = () => {
    try {
      localStorage.setItem("wip:account-usd", String(accountUsd));
      localStorage.setItem("wip:risk-pct", String(riskPct));
    } catch {}
    const sig: CopySignal = {
      id: `${whale.address}-${Date.now()}`,
      ts: Date.now(),
      alias: whale.alias,
      address: whale.address,
      coin: whale.coin,
      side: whale.side,
      entry: calc.entry,
      stop: calc.stop,
      target: calc.target,
      leverage: calc.usedLev,
      positionUsd: calc.positionUsd,
      riskUsd: calc.riskUsd,
      accountUsd,
      riskPct,
    };
    save(sig);
    toast.success(`Signal saved: ${whale.side} ${whale.coin} @ ${fmtPrice(calc.entry)}`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl border-2 border-[var(--neon-purple)]/40 bg-card shadow-[0_0_40px_rgba(168,85,247,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-card-hover hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-bold uppercase tracking-wider">Copy Signal · Risk Sizing</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Mirroring <span className="font-semibold text-foreground">{whale.alias}</span> · {shortAddr(whale.address)}
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base">{whale.coin}</span>
                <Chip tone={whale.side === "LONG" ? "bull" : "bear"}>{whale.side}</Chip>
              </div>
              <div className="text-right">
                <div className="text-muted-foreground text-[10px]">THEIR SIZE / LEV</div>
                <div className="font-mono font-bold">{fmtUSD(whale.sizeUsd)} @ {whale.leverage}x</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Account Size (USD)</span>
              <input
                type="number"
                min={100}
                value={accountUsd}
                onChange={(e) => setAccountUsd(Math.max(100, Number(e.target.value) || 0))}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[var(--neon-purple)]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Risk per Trade (%)</span>
              <input
                type="number"
                min={0.1}
                max={10}
                step={0.1}
                value={riskPct}
                onChange={(e) => setRiskPct(Math.max(0.1, Math.min(10, Number(e.target.value) || 0)))}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[var(--neon-purple)]"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Max Leverage</span>
              <span className="font-mono text-xs font-bold">{maxLev}x</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              value={maxLev}
              onChange={(e) => setMaxLev(Number(e.target.value))}
              className="w-full accent-[var(--neon-purple)]"
            />
          </label>

          <div className="rounded-lg border border-[var(--neon-purple)]/30 bg-gradient-to-br from-[var(--neon-purple)]/10 to-transparent p-3 space-y-1.5 font-mono text-xs">
            <Row label="Entry"        value={fmtPrice(calc.entry)} />
            <Row label="Stop Loss"    value={`${fmtPrice(calc.stop)}  (${fmtPct(calc.stopDistPct, 2)})`} tone="bear" />
            <Row label="Target (2R)"  value={fmtPrice(calc.target)} tone="bull" />
            <div className="my-1 border-t border-border" />
            <Row label="Position Size" value={fmtUSD(calc.positionUsd)} />
            <Row label="Suggested Lev" value={`${calc.usedLev}x`} />
            <Row label="Risk Amount"   value={fmtUSD(calc.riskUsd)} tone="warn" />
          </div>

          <button
            onClick={onSave}
            className="w-full rounded-md bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] px-4 py-2 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_15px_rgba(168,85,247,0.4)] hover:opacity-90 transition-opacity"
          >
            Save Signal
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" | "warn" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "warn" ? "text-[var(--neon-orange)]" : "text-foreground";
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-bold", c)}>{value}</span>
    </div>
  );
}

// ───────────────────────────────── Signal History ─────────────────────────────────

function SignalHistory({ signals, onClear }: { signals: CopySignal[]; onClear: () => void }) {
  if (signals.length === 0) {
    return <EmptyState label="No saved copy signals yet. Tap the copy icon on any trader to generate one." />;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{signals.length} saved signal{signals.length === 1 ? "" : "s"} (max 50, stored locally)</span>
        <button
          onClick={() => { onClear(); toast.success("Signal history cleared"); }}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:border-bear hover:text-bear transition-colors"
        >
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>
      <div className="space-y-2">
        {signals.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-card/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold">{s.coin}</span>
                <Chip tone={s.side === "LONG" ? "bull" : "bear"}>{s.side}</Chip>
                <span className="text-[10px] text-muted-foreground">via {s.alias}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{timeAgo(s.ts)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
              <Stat label="Entry"    value={fmtPrice(s.entry)} />
              <Stat label="Stop"     value={fmtPrice(s.stop)} tone="bear" />
              <Stat label="Target"   value={fmtPrice(s.target)} tone="bull" />
              <Stat label="Lev"      value={`${s.leverage}x`} />
              <Stat label="Position" value={fmtUSD(s.positionUsd)} />
              <Stat label="Risk"     value={fmtUSD(s.riskUsd)} tone="warn" />
              <Stat label="Account"  value={fmtUSD(s.accountUsd)} />
              <Stat label="Risk %"   value={`${s.riskPct}%`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" | "warn" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "warn" ? "text-[var(--neon-orange)]" : "text-foreground";
  return (
    <div className="rounded border border-border/60 bg-secondary/20 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("font-bold", c)}>{value}</div>
    </div>
  );
}
