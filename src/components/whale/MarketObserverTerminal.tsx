import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, Radar, Clock, Zap, TrendingUp, TrendingDown, AlertTriangle,
  Brain, Loader2, History, Sparkles, Target, Shield, Radio,
} from "lucide-react";
import { Panel, Chip, Bar } from "./Panel";
import { generateObserverReport, type ObserverReport } from "@/lib/whale/observer.functions";
import { cn } from "@/lib/utils";

const REPORT_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4h
const ARCHIVE_KEY = "wi_observer_archive_v1";
const ARCHIVE_MAX = 12;

const SCAN_MODULES = [
  { id: "vc", label: "Insider VC Trades", Icon: Radar },
  { id: "liq", label: "Liquidity Heatmaps", Icon: Activity },
  { id: "poc", label: "POC Levels", Icon: Target },
  { id: "oi", label: "OI / Funding Divergence", Icon: TrendingUp },
  { id: "rsi", label: "HTF RSI / EMA Matrix", Icon: Brain },
] as const;

type Stored = { id: string; ts: number; report: ObserverReport };

function loadArchive(): Stored[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Stored[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveArchive(items: Stored[]) {
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(items.slice(0, ARCHIVE_MAX))); } catch { /* ignore */ }
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00h 00m 00s";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export function MarketObserverTerminal() {
  const generate = useServerFn(generateObserverReport);

  const [asset, setAsset] = useState<"BTC" | "ETH" | "SOL">("BTC");
  const [archive, setArchive] = useState<Stored[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextRunAt, setNextRunAt] = useState<number>(() => Date.now() + REPORT_INTERVAL_MS);
  const [now, setNow] = useState(Date.now());
  const [scanIdx, setScanIdx] = useState(0);

  // Tick clock + scan rotator
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setScanIdx((i) => (i + 1) % SCAN_MODULES.length), 1800);
    return () => clearInterval(t);
  }, []);

  // Hydrate archive
  useEffect(() => {
    const stored = loadArchive();
    setArchive(stored);
    if (stored[0]) setSelectedId(stored[0].id);
  }, []);

  const runReport = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const report = await generate({ data: { asset } });
      const entry: Stored = {
        id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        report,
      };
      const next = [entry, ...archive].slice(0, ARCHIVE_MAX);
      setArchive(next); saveArchive(next);
      setSelectedId(entry.id);
      setNextRunAt(Date.now() + REPORT_INTERVAL_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
    } finally { setLoading(false); }
  }, [generate, asset, archive]);

  // Auto-trigger on countdown expiry
  useEffect(() => {
    if (now >= nextRunAt && !loading) {
      void runReport();
    }
  }, [now, nextRunAt, loading, runReport]);

  const remaining = nextRunAt - now;
  const progress = 100 - Math.max(0, Math.min(100, (remaining / REPORT_INTERVAL_MS) * 100));

  const selected = useMemo(
    () => archive.find((a) => a.id === selectedId) ?? archive[0] ?? null,
    [archive, selectedId],
  );

  return (
    <div className="space-y-4">
      {/* Header — watchdog + countdown */}
      <Panel
        title="AI Market Observer & Terminal Reporter"
        subtitle="Autonomous 4H intelligence · scans VC flow, liquidity, POC, OI/funding, HTF momentum"
        accent="purple"
        action={
          <div className="flex items-center gap-2">
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value as typeof asset)}
              disabled={loading}
              className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-foreground focus:border-[var(--neon-purple)] focus:outline-none"
            >
              <option value="BTC">BTC</option>
              <option value="ETH">ETH</option>
              <option value="SOL">SOL</option>
            </select>
            <Chip tone="bull">
              <span className="relative mr-1 inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-[var(--bull)]" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--bull)]" />
              </span>
              Live Sync
            </Chip>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {/* Watchdog scanner */}
          <div className="rounded-lg border border-[var(--neon-blue)]/30 bg-card/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--neon-blue)]">
                <Radio className="h-3.5 w-3.5 animate-pulse" /> Terminal Watchdog
              </div>
              <Chip tone="blue">5 Modules</Chip>
            </div>
            <ul className="space-y-1.5">
              {SCAN_MODULES.map((m, i) => {
                const active = i === scanIdx;
                const Icon = m.Icon;
                return (
                  <li
                    key={m.id}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-2 py-1.5 font-mono text-[11px] transition-all",
                      active
                        ? "border-[var(--neon-blue)]/60 bg-[var(--neon-blue)]/10 text-foreground shadow-[0_0_10px_color-mix(in_oklab,var(--neon-blue)_30%,transparent)]"
                        : "border-border/60 bg-secondary/30 text-muted-foreground",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className={cn("h-3 w-3", active && "text-[var(--neon-blue)]")} />
                      {m.label}
                    </span>
                    <span className={cn("text-[10px]", active ? "text-[var(--neon-blue)]" : "text-bull")}>
                      {active ? "⟳ scanning" : "✓ ok"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Countdown card */}
          <div className="rounded-lg border border-[var(--neon-purple)]/40 bg-gradient-to-br from-[var(--neon-purple)]/10 to-[var(--neon-blue)]/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--neon-purple)]">
                <Clock className="h-3.5 w-3.5" /> Next AI Update In
              </div>
              <Chip tone="purple">Auto · 4H</Chip>
            </div>
            <div className="my-3 text-center font-mono text-3xl font-black tracking-tight text-foreground" style={{ textShadow: "0 0 14px color-mix(in oklab, var(--neon-purple) 60%, transparent)" }}>
              {formatCountdown(remaining)}
            </div>
            <Bar value={progress} tone="purple" />
            <button
              onClick={runReport}
              disabled={loading}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-[var(--neon-purple)] bg-[var(--neon-purple)]/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[var(--neon-purple)] hover:bg-[var(--neon-purple)]/25 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {loading ? "Compiling…" : "Generate Immediate Snapshot"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-bear/40 bg-bear/10 p-2 text-[11px] text-bear">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        )}
      </Panel>

      {/* Report body */}
      <Panel
        title={selected ? `Intelligence Report · ${selected.report.asset}` : "Intelligence Report"}
        subtitle={selected ? new Date(selected.ts).toLocaleString() : "Awaiting first compile — click Generate Immediate Snapshot"}
        accent="blue"
        action={
          archive.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <History className="h-3 w-3 text-muted-foreground" />
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[10px] text-foreground focus:border-[var(--neon-blue)] focus:outline-none"
              >
                {archive.map((a) => (
                  <option key={a.id} value={a.id}>
                    {new Date(a.ts).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })} · {a.report.asset}
                  </option>
                ))}
              </select>
            </div>
          ) : null
        }
      >
        {!selected ? (
          <EmptyReport loading={loading} />
        ) : (
          <ReportView entry={selected} />
        )}
      </Panel>
    </div>
  );
}

function EmptyReport({ loading }: { loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {loading ? (
        <Loader2 className="h-8 w-8 animate-spin text-[var(--neon-purple)]" />
      ) : (
        <Brain className="h-8 w-8 text-muted-foreground" />
      )}
      <p className="font-mono text-xs text-muted-foreground">
        {loading ? "Scanning markets and compiling report…" : "No reports yet. Run a snapshot to bootstrap the archive."}
      </p>
    </div>
  );
}

function SectionHeader({ tag, title, tone = "blue" }: { tag: string; title: string; tone?: "blue" | "purple" | "orange" | "green" }) {
  const colors = {
    blue: "text-[var(--neon-blue)] border-[var(--neon-blue)]/40",
    purple: "text-[var(--neon-purple)] border-[var(--neon-purple)]/40",
    orange: "text-[var(--neon-orange)] border-[var(--neon-orange)]/40",
    green: "text-bull border-bull/40",
  };
  return (
    <div className={cn("mb-2 flex items-center justify-between border-b pb-1.5", colors[tone])}>
      <h3 className={cn("font-mono text-[11px] font-black uppercase tracking-[0.18em]", colors[tone])}>
        [{tag}]
      </h3>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
    </div>
  );
}

function ReportView({ entry }: { entry: Stored }) {
  const r = entry.report;
  return (
    <div className="space-y-4">
      {/* SENTIMENT */}
      <section className="rounded-lg border border-border/60 bg-secondary/20 p-3">
        <SectionHeader tag="MARKET SENTIMENT & REVERSAL STATE" title="Panic / Fear / RSI" tone="blue" />
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Chip tone={r.sentiment.state.includes("FEAR") ? "bear" : r.sentiment.state.includes("GREED") ? "warn" : "blue"}>
            {r.sentiment.state.replace("_", " ")}
          </Chip>
          <Chip tone={r.sentiment.rsiExhaustion === "OVERBOUGHT" ? "bear" : r.sentiment.rsiExhaustion === "OVERSOLD" ? "bull" : "default"}>
            RSI {r.sentiment.rsiExhaustion}
          </Chip>
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-foreground/85">{r.sentiment.summary}</p>
        {r.sentiment.metrics.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {r.sentiment.metrics.map((m, i) => (
              <div key={i} className="rounded border border-border/50 bg-card/40 px-2 py-1">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
                <div className={cn(
                  "font-mono text-[12px] font-bold",
                  m.tone === "BULL" && "text-bull",
                  m.tone === "BEAR" && "text-bear",
                  m.tone === "WARN" && "text-[var(--neon-orange)]",
                  m.tone === "NEUTRAL" && "text-foreground",
                )}>{m.value}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* WHALE INTENT */}
      <section className="rounded-lg border border-border/60 bg-secondary/20 p-3">
        <SectionHeader tag="WHALE & VC INTENT LOG" title="Last 4H · Top desks" tone="purple" />
        <div className="mb-2 flex items-center gap-2">
          <Chip tone={r.whaleIntent.bias === "ACCUMULATION" ? "bull" : r.whaleIntent.bias === "DISTRIBUTION" ? "bear" : "default"}>
            {r.whaleIntent.bias}
          </Chip>
        </div>
        <p className="mb-2 font-mono text-[11px] leading-relaxed text-foreground/85">{r.whaleIntent.summary}</p>
        <ul className="space-y-1">
          {r.whaleIntent.actors.map((a, i) => (
            <li key={i} className="flex items-start gap-2 rounded border border-border/40 bg-card/40 px-2 py-1.5 text-[11px]">
              <span className={cn(
                "mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full",
                a.tone === "BULL" && "bg-bull shadow-[0_0_6px_var(--bull)]",
                a.tone === "BEAR" && "bg-bear shadow-[0_0_6px_var(--bear)]",
                a.tone === "NEUTRAL" && "bg-muted-foreground",
              )} />
              <div className="flex-1">
                <span className="font-mono font-bold text-foreground">{a.name}</span>
                <span className="ml-1 text-muted-foreground">{a.action}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* LIQUIDATION TRAPS */}
      <section className="rounded-lg border border-border/60 bg-secondary/20 p-3">
        <SectionHeader tag="LIQUIDATION TRAPS TO WATCH" title="Nearest heavy pools" tone="orange" />
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[11px]">
            <thead className="text-[9px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border/40">
                <th className="px-2 py-1 text-left">Side</th>
                <th className="px-2 py-1 text-left">Level</th>
                <th className="px-2 py-1 text-left">Notional</th>
                <th className="px-2 py-1 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {r.liquidationTraps.map((t, i) => (
                <tr key={i} className="border-b border-border/20">
                  <td className="px-2 py-1.5">
                    <Chip tone={t.side === "LONG" ? "bear" : "bull"}>
                      {t.side === "LONG" ? <TrendingDown className="h-2.5 w-2.5" /> : <TrendingUp className="h-2.5 w-2.5" />}
                      {t.side}
                    </Chip>
                  </td>
                  <td className="px-2 py-1.5 font-bold text-foreground">{t.level}</td>
                  <td className="px-2 py-1.5 text-[var(--neon-orange)]">{t.notionalUsd}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FORECAST */}
      <section className="relative overflow-hidden rounded-lg border-2 border-[var(--neon-purple)]/50 bg-gradient-to-br from-[var(--neon-purple)]/10 via-card/30 to-[var(--neon-blue)]/10 p-3 shadow-[0_0_25px_color-mix(in_oklab,var(--neon-purple)_15%,transparent)]">
        <SectionHeader tag="FUTURE PREDICTION & FORWARD LOOKING ANALYTICS" title={`Next ${r.forecast.horizonHours}H bias`} tone="purple" />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Chip tone={r.forecast.bias === "BULLISH" ? "bull" : r.forecast.bias === "BEARISH" ? "bear" : r.forecast.bias === "VOLATILE" ? "warn" : "default"}>
            <Zap className="h-2.5 w-2.5" /> {r.forecast.bias}
          </Chip>
          <Chip tone="purple">{r.forecast.horizonHours}H horizon</Chip>
        </div>

        <p className="mb-3 font-mono text-[13px] font-bold leading-snug text-foreground" style={{ textShadow: "0 0 8px color-mix(in oklab, var(--neon-purple) 40%, transparent)" }}>
          {r.forecast.headline}
        </p>

        {/* Confidence meter */}
        <div className="mb-3 rounded-md border border-[var(--neon-purple)]/30 bg-card/40 p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider">
            <span className="text-muted-foreground">Prediction Confidence</span>
            <span className="font-mono font-black text-[var(--neon-purple)]" style={{ textShadow: "0 0 6px var(--neon-purple)" }}>
              {r.forecast.confidence}%
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-gradient-to-r from-[var(--neon-blue)] via-[var(--neon-purple)] to-[var(--neon-orange)] shadow-[0_0_10px_var(--neon-purple)] transition-all duration-1000"
              style={{ width: `${r.forecast.confidence}%` }}
            />
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>
        </div>

        {/* Levels */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded border border-bear/40 bg-bear/10 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-bear">
              <TrendingUp className="h-2.5 w-2.5" /> Breakout Resistance
            </div>
            <div className="font-mono text-[14px] font-black text-foreground">{r.forecast.keyResistance}</div>
          </div>
          <div className="rounded border border-bull/40 bg-bull/10 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-bull">
              <TrendingDown className="h-2.5 w-2.5" /> Breakdown Support
            </div>
            <div className="font-mono text-[14px] font-black text-foreground">{r.forecast.keySupport}</div>
          </div>
        </div>

        <p className="mb-2 font-mono text-[11px] leading-relaxed text-foreground/85">{r.forecast.rationale}</p>

        <div className="flex items-start gap-2 rounded border border-[var(--neon-orange)]/40 bg-[var(--neon-orange)]/10 px-2 py-1.5">
          <Shield className="mt-0.5 h-3 w-3 shrink-0 text-[var(--neon-orange)]" />
          <div className="text-[10px] leading-snug">
            <span className="font-bold uppercase tracking-wider text-[var(--neon-orange)]">Invalidation: </span>
            <span className="font-mono text-foreground/85">{r.forecast.invalidation}</span>
          </div>
        </div>
      </section>

      <p className="text-center text-[9px] uppercase tracking-wider text-muted-foreground/70">
        AI-generated · not financial advice · always verify with on-chain & exchange data
      </p>
    </div>
  );
}
