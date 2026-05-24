import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBroadcasts } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/broadcasts")({
  component: BroadcastsPage,
});

function BroadcastsPage() {
  const list = useServerFn(listBroadcasts);
  const { data, isLoading } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => list(),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Broadcast History</h2>
        <p className="text-sm text-muted-foreground">Last 100 signal dispatches to your channels.</p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Time</th>
              <th className="px-3 py-2 text-left">Signal</th>
              <th className="px-3 py-2 text-left">Channel</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.broadcasts.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">No broadcasts yet — the hourly scanner will populate this list.</td></tr>
            )}
            {data?.broadcasts.map((b) => {
              const s = b.ai_signals as { asset: string; direction: string; confidence: number; timeframe: string } | null;
              const c = b.broadcast_channels as { name: string; channel_type: string } | null;
              return (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {s ? (
                      <span>
                        <span className={s.direction === "LONG" ? "text-bull" : s.direction === "SHORT" ? "text-bear" : ""}>
                          {s.direction}
                        </span>{" "}
                        {s.asset} · {s.timeframe} · {s.confidence}%
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">{c?.name ?? "—"} <span className="text-xs text-muted-foreground">({c?.channel_type})</span></td>
                  <td className="px-3 py-2">
                    {b.status === "sent" && <span className="text-bull">✓ sent</span>}
                    {b.status === "failed" && <span className="text-bear" title={b.error ?? ""}>✗ failed</span>}
                    {b.status === "pending" && <span className="text-muted-foreground">…</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
