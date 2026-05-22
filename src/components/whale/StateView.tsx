import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

export function LoadingState({ label = "Loading live data…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin text-[var(--neon-blue)]" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-bear" />
      <div className="space-y-1">
        <div className="text-xs font-bold text-bear">API request failed</div>
        <div className="max-w-md break-words font-mono text-[11px] text-muted-foreground">{error}</div>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-md border border-[var(--neon-blue)]/50 bg-[var(--neon-blue)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--neon-blue)] hover:bg-[var(--neon-blue)]/25"
      >
        <RefreshCw className="h-3 w-3" /> Retry
      </button>
    </div>
  );
}

export function EmptyState({ label = "No data yet" }: { label?: string }) {
  return <div className="py-10 text-center text-xs text-muted-foreground">{label}</div>;
}
