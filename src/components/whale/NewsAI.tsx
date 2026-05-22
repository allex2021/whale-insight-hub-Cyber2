import { useMemo } from "react";
import { Panel, Chip, Bar } from "./Panel";
import { buildMockNews } from "@/lib/whale/mock";
import { timeAgo } from "@/lib/whale/format";

export function NewsAI() {
  const items = useMemo(() => buildMockNews(), []);
  const breaking = items.find((i) => (i.ai?.score ?? 0) >= 9);
  return (
    <Panel title="News & AI Analysis" subtitle="Sentiment-scored crypto headlines" accent="purple">
      {breaking && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--neon-purple)]/60 bg-[var(--neon-purple)]/10 px-3 py-2">
          <span className="text-lg">🚨</span>
          <div className="flex-1 text-sm">
            <span className="font-bold text-[var(--neon-purple)]">BREAKING:</span>{" "}
            <span>{breaking.title}</span>
          </div>
          <Chip tone="purple">AI {breaking.ai!.score}/10</Chip>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {items.map((n) => (
          <div key={n.id} className="rounded-md border border-border bg-secondary/40 p-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
              <span className="font-semibold uppercase tracking-wide">{n.source}</span>
              <span>{timeAgo(n.publishedAt)}</span>
            </div>
            <h3 className="text-sm font-semibold leading-snug">{n.title}</h3>
            {n.ai && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground italic">{n.ai.summary}</p>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Chip tone={n.ai.verdict === "BULLISH" ? "bull" : n.ai.verdict === "BEARISH" ? "bear" : "default"}>
                      {n.ai.verdict === "BULLISH" ? "🟢" : n.ai.verdict === "BEARISH" ? "🔴" : "⚪"} {n.ai.verdict}
                    </Chip>
                    <Chip tone={n.ai.impact === "HIGH" ? "warn" : "default"}>{n.ai.impact} impact</Chip>
                  </div>
                  <div className="flex items-center gap-2 w-32">
                    <span className="text-[10px] text-muted-foreground">AI</span>
                    <Bar value={n.ai.score * 10} tone={n.ai.score >= 7 ? "bull" : n.ai.score <= 4 ? "bear" : "blue"} />
                    <span className="font-mono text-xs font-bold">{n.ai.score}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
