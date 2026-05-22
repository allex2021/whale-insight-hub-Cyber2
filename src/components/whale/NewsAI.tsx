import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Panel, Chip } from "./Panel";
import { timeAgo } from "@/lib/whale/format";
import { useAsync } from "@/lib/whale/useAsync";
import { fetchNewsServer } from "@/lib/whale/market.functions";
import { ErrorState, LoadingState } from "./StateView";

export function NewsAI() {
  const fn = useServerFn(fetchNewsServer);
  const fetcher = useMemo(() => () => fn(), [fn]);
  const { data: items, error, loading, retry } = useAsync(fetcher, [], { refreshMs: 120_000 });
  const breaking = items?.find((i) => (i.ai?.score ?? 0) >= 9);

  return (
    <Panel title="News & AI Analysis" subtitle="Live CryptoPanic feed · community-scored" accent="purple">
      {loading && !items && <LoadingState label="Fetching news…" />}
      {error && !items && <ErrorState error={error} onRetry={retry} />}
      {items && (
        <>
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
            {items.map((n) => (
              <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className="block rounded-md border border-border bg-secondary/40 p-3 hover:border-border-bright">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span className="font-semibold uppercase tracking-wide">{n.source}</span>
                  <span>{timeAgo(n.publishedAt)}</span>
                </div>
                <h3 className="text-sm font-semibold leading-snug">{n.title}</h3>
                {n.ai && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground italic flex-1">{n.ai.summary}</p>
                    <Chip tone={n.ai.verdict === "BULLISH" ? "bull" : n.ai.verdict === "BEARISH" ? "bear" : "default"}>
                      {n.ai.verdict} · {n.ai.score}/10
                    </Chip>
                  </div>
                )}
              </a>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
