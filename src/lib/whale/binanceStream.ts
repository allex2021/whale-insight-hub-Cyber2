/**
 * Singleton Binance WebSocket multiplex manager.
 * - One WS per host (spot / futures), all streams multiplexed via combined endpoint.
 * - Subscribers register a stream name + handler; unsubscribe via returned fn.
 * - Auto-reconnect with exponential backoff.
 * - Pauses when document is hidden, resumes when visible.
 */

type Handler = (data: unknown) => void;
type Host = "spot" | "futures";

const HOST_URL: Record<Host, string> = {
  spot: "wss://stream.binance.com:9443/stream",
  futures: "wss://fstream.binance.com/stream",
};

type Conn = {
  ws: WebSocket | null;
  streams: Map<string, Set<Handler>>; // stream name → handlers
  retry: number;
  closed: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
};

const conns: Record<Host, Conn> = {
  spot:    { ws: null, streams: new Map(), retry: 0, closed: false, reconnectTimer: null },
  futures: { ws: null, streams: new Map(), retry: 0, closed: false, reconnectTimer: null },
};

function buildUrl(host: Host, streams: string[]) {
  return `${HOST_URL[host]}?streams=${streams.join("/")}`;
}

function connect(host: Host) {
  const c = conns[host];
  if (c.closed) return;
  if (typeof window === "undefined") return;
  if (document.hidden) return; // wait for visibility
  const streamNames = [...c.streams.keys()];
  if (streamNames.length === 0) return;

  // Close any existing
  try { c.ws?.close(); } catch { /* noop */ }

  const ws = new WebSocket(buildUrl(host, streamNames));
  c.ws = ws;

  ws.onopen = () => { c.retry = 0; };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      const stream: string | undefined = msg.stream;
      const data = msg.data;
      if (!stream || !data) return;
      const handlers = c.streams.get(stream);
      if (!handlers) return;
      handlers.forEach((h) => {
        try { h(data); } catch { /* swallow */ }
      });
    } catch { /* ignore */ }
  };

  ws.onclose = () => {
    if (c.closed) return;
    if (c.streams.size === 0) return;
    const delay = Math.min(30_000, 1000 * 2 ** c.retry);
    c.retry += 1;
    c.reconnectTimer = setTimeout(() => connect(host), delay);
  };

  ws.onerror = () => { /* close will fire */ };
}

function refresh(host: Host) {
  // Re-open WS so the streams query-string includes current subscriptions.
  const c = conns[host];
  if (c.reconnectTimer) { clearTimeout(c.reconnectTimer); c.reconnectTimer = null; }
  if (c.streams.size === 0) {
    try { c.ws?.close(); } catch { /* noop */ }
    c.ws = null;
    return;
  }
  connect(host);
}

// Debounce refreshes so a burst of subscribe() calls in one tick → one reconnect.
const refreshTimers: Record<Host, ReturnType<typeof setTimeout> | null> = {
  spot: null, futures: null,
};
function scheduleRefresh(host: Host) {
  if (refreshTimers[host]) return;
  refreshTimers[host] = setTimeout(() => {
    refreshTimers[host] = null;
    refresh(host);
  }, 30);
}

export function subscribeBinanceStream(
  host: Host,
  stream: string,
  handler: Handler,
): () => void {
  const c = conns[host];
  let set = c.streams.get(stream);
  const isNew = !set;
  if (!set) { set = new Set(); c.streams.set(stream, set); }
  set.add(handler);
  if (isNew) scheduleRefresh(host);

  return () => {
    const s = c.streams.get(stream);
    if (!s) return;
    s.delete(handler);
    if (s.size === 0) {
      c.streams.delete(stream);
      scheduleRefresh(host);
    }
  };
}

// Visibility handling — pause everything when tab hidden, reconnect on focus.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      (["spot", "futures"] as Host[]).forEach((h) => {
        const c = conns[h];
        if (c.reconnectTimer) { clearTimeout(c.reconnectTimer); c.reconnectTimer = null; }
        try { c.ws?.close(); } catch { /* noop */ }
        c.ws = null;
      });
    } else {
      (["spot", "futures"] as Host[]).forEach((h) => {
        if (conns[h].streams.size > 0) connect(h);
      });
    }
  });
}
