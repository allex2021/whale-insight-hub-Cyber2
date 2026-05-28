import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Panel, Chip } from "./Panel";
import { timeAgo } from "@/lib/whale/format";
import { useAsync } from "@/lib/whale/useAsync";
import { fetchNewsServer } from "@/lib/whale/market.functions";
import { ErrorState, LoadingState } from "./StateView";
import { useWhaleAlertSound } from "@/hooks/useWhaleAlertSound";
import { cn } from "@/lib/utils";

type Filter = "ALL" | "BULLISH" | "BEARISH" | "HIGH";

export function NewsAI() {
  const fn = useServerFn(fetchNewsServer);
  const fetcher = useMemo(() => (_s: AbortSignal) => fn(), [fn]);
  const { data: items, error, loading, retry } = useAsync(fetcher, [], { refreshMs: 120_000 });
  const [filter, setFilter] = useState<Filter>("ALL");
  const { playUrgent } = useWhaleAlertSound();
  const seenUrgent = useRef<Set<string>>(new Set());
  const firstRun = useRef(true);

  // Aggregate market mood (-100 bear → +100 bull), weighted by impact + confidence
  const mood = useMemo(() => {
    if (!items || items.length === 0) return { score: 0, bull: 0, bear: 0, neutral: 0 };
    let weighted = 0, total = 0, bull = 0, bear = 0, neutral = 0;
    for (const n of items) {
      const a = n.ai; if (!a) continue;
      const w = (a.impact === "HIGH" ? 3 : a.impact === "MEDIUM" ? 2 : 1) * ((a.confidence ?? 50) / 100);
      const sign = a.verdict === "BULLISH" ? 1 : a.verdict === "BEARISH" ? -1 : 0;
      weighted += sign * w * a.score;
      total += w * 10;
      if (a.verdict === "BULLISH") bull++;
      else if (a.verdict === "BEARISH") bear++;
      else neutral++;
    }
    return { score: total ? Math.round((weighted / total) * 100) : 0, bull, bear, neutral };
  }, [items]);

  // VADER sentiment index — independent NLP signal across all headlines
  const vaderIndex = useMemo(() => {
    if (!items || items.length === 0) return { avg: 0, count: 0 };
    const valid = items.filter((i) => i.sentiment);
    if (valid.length === 0) return { avg: 0, count: 0 };
    const sum = valid.reduce((s, i) => s + (i.sentiment?.compound ?? 0), 0);
    return { avg: sum / valid.length, count: valid.length };
  }, [items]);

  const breaking = items?.find((i) => (i.ai?.score ?? 0) >= 9 && i.ai?.impact === "HIGH");

  const filtered = useMemo(() => {
    if (!items) return [];
    if (filter === "ALL") return items;
    if (filter === "HIGH") return items.filter((i) => i.ai?.impact === "HIGH");
    return items.filter((i) => i.ai?.verdict === filter);
  }, [items, filter]);

  // Beep on new high-impact arrivals
  useEffect(() => {
    if (!items) return;
    const urgent = items.filter((i) => (i.ai?.score ?? 0) >= 8);
    if (firstRun.current) {
      urgent.forEach((i) => seenUrgent.current.add(String(i.id)));
      firstRun.current = false;
      return;
    }
    let fired = false;
    for (const i of urgent) {
      const id = String(i.id);
      if (!seenUrgent.current.has(id)) {
        seenUrgent.current.add(id);
        if (!fired) { playUrgent(); fired = true; }
      }
    }
  }, [items, playUrgent]);

  const moodLabel = mood.score >= 30 ? "BULLISH" : mood.score <= -30 ? "BEARISH" : "NEUTRAL";
  const moodTone = mood.score >= 30 ? "bull" : mood.score <= -30 ? "bear" : "default";
  const aiCount = items?.filter((i) => i.ai?.aiPowered).length ?? 0;

  return (
    <Panel
      title="News & AI Sentiment"
      subtitle={`Gemini-analyzed · ${aiCount}/${items?.length ?? 0} AI-scored · 5min refresh`}
      accent="purple"
      action={
        <div className="flex gap-1">
          {(["ALL", "BULLISH", "BEARISH", "HIGH"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-bold uppercase border",
                filter === f ? "border-[var(--neon-purple)] bg-[var(--neon-purple)]/20 text-foreground" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
            >{f}</button>
          ))}
        </div>
      }
    >
      {loading && !items && <LoadingState label="Analyzing news with AI…" />}
      {error && !items && <ErrorState error={error} onRetry={retry} />}
      {items && (
        <>
          {/* Market Mood Meter */}
          <div className="mb-3 rounded-lg border border-border bg-secondary/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-[var(--neon-purple)]" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Market Mood</span>
                <Chip tone={moodTone as "bull" | "bear" | "default"}>{moodLabel} · {mood.score > 0 ? "+" : ""}{mood.score}</Chip>
              </div>
              <div className="flex items-center gap-3 font-mono text-[10px]">
                <span className="text-bull">▲ {mood.bull}</span>
                <span className="text-muted-foreground">● {mood.neutral}</span>
                <span className="text-bear">▼ {mood.bear}</span>
              </div>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-secondary">
              <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
              <div
                className={cn("absolute top-0 h-full transition-all", mood.score >= 0 ? "bg-bull left-1/2" : "bg-bear right-1/2")}
                style={{ width: `${Math.min(50, Math.abs(mood.score) / 2)}%` }}
              />
            </div>
            {vaderIndex.count > 0 && (
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="uppercase tracking-widest text-muted-foreground">VADER NLP Index</span>
                <span className="font-mono">
                  <span className={cn(
                    "font-bold",
                    vaderIndex.avg > 0.1 ? "text-bull" : vaderIndex.avg < -0.1 ? "text-bear" : "text-muted-foreground",
                  )}>
                    {vaderIndex.avg > 0 ? "+" : ""}{vaderIndex.avg.toFixed(3)}
                  </span>
                  <span className="text-muted-foreground"> · {vaderIndex.count} items</span>
                </span>
              </div>
            )}
          </div>

          {breaking && (
            <div className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--neon-purple)]/60 bg-[var(--neon-purple)]/10 px-3 py-2">
              <span className="text-lg">🚨</span>
              <div className="flex-1 text-sm">
                <span className="font-bold text-[var(--neon-purple)]">BREAKING:</span>{" "}
                <a href={breaking.url} target="_blank" rel="noreferrer" className="hover:underline">{breaking.title}</a>
              </div>
              <Chip tone="purple">{breaking.ai!.score}/10</Chip>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {filtered.map((n) => {
              const a = n.ai;
              const Icon = a?.verdict === "BULLISH" ? TrendingUp : a?.verdict === "BEARISH" ? TrendingDown : Minus;
              return (
                <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className="block rounded-md border border-border bg-secondary/40 p-3 hover:border-border-bright">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold uppercase tracking-wide">{n.source}</span>
                      {a?.aiPowered && <span className="rounded bg-[var(--neon-purple)]/20 px-1 py-0.5 text-[8px] font-bold text-[var(--neon-purple)]">AI</span>}
                      {a?.impact === "HIGH" && <span className="rounded bg-bear/20 px-1 py-0.5 text-[8px] font-bold text-bear">HIGH IMPACT</span>}
                    </div>
                    <span>{timeAgo(n.publishedAt)}</span>
                  </div>
                  <h3 className="text-sm font-semibold leading-snug">{n.title}</h3>
                  {a && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-[11px] text-muted-foreground italic line-clamp-2">{a.summary}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone={a.verdict === "BULLISH" ? "bull" : a.verdict === "BEARISH" ? "bear" : "default"}>
                          <Icon className="h-3 w-3" /> {a.verdict} · {a.score}/10
                        </Chip>
                        {n.sentiment && (
                          <span
                            className={cn(
                              "rounded border px-1.5 py-0.5 text-[9px] font-mono",
                              n.sentiment.label === "BULLISH" ? "border-bull/50 bg-bull/10 text-bull" :
                              n.sentiment.label === "BEARISH" ? "border-bear/50 bg-bear/10 text-bear" :
                              "border-border bg-secondary/40 text-muted-foreground",
                            )}
                            title="VADER NLP sentiment compound score"
                          >
                            VADER {n.sentiment.compound > 0 ? "+" : ""}{n.sentiment.compound.toFixed(2)}
                          </span>
                        )}
                        {a.confidence !== undefined && (
                          <span className="rounded border border-border px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
                            conf {a.confidence}%
                          </span>
                        )}
                        {a.assets?.slice(0, 4).map((t) => (
                          <span key={t} className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 text-[9px] font-mono font-bold">
                            ${t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </a>
              );
            })}
            {filtered.length === 0 && (
              <div className="lg:col-span-2 py-6 text-center text-xs text-muted-foreground">
                No {filter.toLowerCase()} news in the current batch.
              </div>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
