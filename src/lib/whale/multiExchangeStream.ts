/**
 * Multi-exchange whale trade aggregator (Bybit + OKX + Hyperliquid).
 * Binance has its own dedicated multiplex hook (useBinanceWhaleStream).
 *
 * - One WS per exchange, all assets multiplexed per connection.
 * - Auto-reconnect with exponential backoff: 2s → 4s → 8s → … capped 30s.
 * - Pauses on document.hidden, resumes on visible.
 * - Exposes a per-exchange connection status store.
 */

import type { WhaleAsset, WhaleTrade } from "@/hooks/useBinanceWhaleStream";

export type ExchangeId = "binance" | "bybit" | "okx" | "hyperliquid";

export const EXCHANGE_META: Record<ExchangeId, { label: string; color: string }> = {
  binance:     { label: "Binance",     color: "#f3ba2f" },
  bybit:       { label: "Bybit",       color: "#f7a600" },
  okx:         { label: "OKX",         color: "#3b82f6" },
  hyperliquid: { label: "Hyperliquid", color: "#a855f7" },
};

const ASSETS: WhaleAsset[] = ["BTC", "ETH", "SOL", "LTC", "BNB", "XRP", "ADA", "DOGE", "AVAX"];

const BYBIT_SYMS: Record<string, WhaleAsset> = {
  BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL", LTCUSDT: "LTC",
  BNBUSDT: "BNB", XRPUSDT: "XRP", ADAUSDT: "ADA", DOGEUSDT: "DOGE", AVAXUSDT: "AVAX",
};
const OKX_SYMS: Record<string, WhaleAsset> = {
  "BTC-USDT": "BTC", "ETH-USDT": "ETH", "SOL-USDT": "SOL", "LTC-USDT": "LTC",
  "BNB-USDT": "BNB", "XRP-USDT": "XRP", "ADA-USDT": "ADA", "DOGE-USDT": "DOGE", "AVAX-USDT": "AVAX",
};

type TradeListener = (t: WhaleTrade) => void;
type StatusListener = (s: Record<ExchangeId, boolean>) => void;

const tradeListeners = new Set<TradeListener>();
const statusListeners = new Set<StatusListener>();

const status: Record<ExchangeId, boolean> = {
  binance: false, bybit: false, okx: false, hyperliquid: false,
};

function emitStatus() {
  const snap = { ...status };
  statusListeners.forEach((l) => { try { l(snap); } catch { /* noop */ } });
}
function emitTrade(t: WhaleTrade) {
  tradeListeners.forEach((l) => { try { l(t); } catch { /* noop */ } });
}

type ConnState = {
  id: ExchangeId;
  url: string;
  ws: WebSocket | null;
  retry: number;
  closed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  onOpen: (ws: WebSocket) => void;
  onMessage: (data: unknown) => void;
};

function connect(c: ConnState) {
  if (c.closed) return;
  if (typeof window === "undefined") return;
  if (typeof document !== "undefined" && document.hidden) return;
  try { c.ws?.close(); } catch { /* noop */ }
  const ws = new WebSocket(c.url);
  c.ws = ws;
  ws.onopen = () => {
    c.retry = 0;
    status[c.id] = true;
    emitStatus();
    try { c.onOpen(ws); } catch { /* noop */ }
  };
  ws.onmessage = (ev) => {
    try { c.onMessage(JSON.parse(ev.data)); } catch { /* ignore parse */ }
  };
  ws.onclose = () => {
    status[c.id] = false;
    emitStatus();
    if (c.closed) return;
    const delay = Math.min(30_000, 2000 * 2 ** c.retry);
    c.retry += 1;
    c.timer = setTimeout(() => connect(c), delay);
  };
  ws.onerror = () => { /* close will fire */ };
}

const conns: ConnState[] = [];
let started = false;

function startAll() {
  if (started) return;
  if (typeof window === "undefined") return;
  started = true;

  // ── Bybit (linear perpetuals) ─────────────────────────────
  conns.push({
    id: "bybit",
    url: "wss://stream.bybit.com/v5/public/linear",
    ws: null, retry: 0, closed: false, timer: null,
    onOpen: (ws) => {
      ws.send(JSON.stringify({
        op: "subscribe",
        args: Object.keys(BYBIT_SYMS).map((s) => `publicTrade.${s}`),
      }));
    },
    onMessage: (raw) => {
      const msg = raw as { topic?: string; data?: Array<{ s: string; S: string; v: string; p: string; T: number; i?: string }> };
      if (!msg.topic?.startsWith("publicTrade.") || !Array.isArray(msg.data)) return;
      for (const d of msg.data) {
        const asset = BYBIT_SYMS[d.s];
        if (!asset) continue;
        const price = parseFloat(d.p);
        const qty = parseFloat(d.v);
        const sizeUsd = price * qty;
        emitTrade({
          id: `bybit-${d.s}-${d.i ?? `${d.T}-${d.p}-${d.v}`}`,
          asset,
          side: d.S === "Buy" ? "BUY" : "SELL",
          price, quantity: qty, sizeUsd,
          tradeTime: Number(d.T),
          exchange: "bybit",
        });
      }
    },
  });

  // ── OKX (spot trades) ─────────────────────────────────────
  conns.push({
    id: "okx",
    url: "wss://ws.okx.com:8443/ws/v5/public",
    ws: null, retry: 0, closed: false, timer: null,
    onOpen: (ws) => {
      ws.send(JSON.stringify({
        op: "subscribe",
        args: Object.keys(OKX_SYMS).map((instId) => ({ channel: "trades", instId })),
      }));
    },
    onMessage: (raw) => {
      const msg = raw as { arg?: { channel?: string }; data?: Array<{ instId: string; tradeId: string; px: string; sz: string; side: string; ts: string }> };
      if (msg.arg?.channel !== "trades" || !Array.isArray(msg.data)) return;
      for (const d of msg.data) {
        const asset = OKX_SYMS[d.instId];
        if (!asset) continue;
        const price = parseFloat(d.px);
        const qty = parseFloat(d.sz);
        const sizeUsd = price * qty;
        emitTrade({
          id: `okx-${d.instId}-${d.tradeId}`,
          asset,
          side: d.side === "buy" ? "BUY" : "SELL",
          price, quantity: qty, sizeUsd,
          tradeTime: Number(d.ts),
          exchange: "okx",
        });
      }
    },
  });

  // ── Hyperliquid (perp trades) ─────────────────────────────
  conns.push({
    id: "hyperliquid",
    url: "wss://api.hyperliquid.xyz/ws",
    ws: null, retry: 0, closed: false, timer: null,
    onOpen: (ws) => {
      for (const coin of ASSETS) {
        ws.send(JSON.stringify({
          method: "subscribe",
          subscription: { type: "trades", coin },
        }));
      }
    },
    onMessage: (raw) => {
      const msg = raw as { channel?: string; data?: Array<{ coin: string; side: string; px: string; sz: string; time: number; tid?: number | string }> };
      if (msg.channel !== "trades" || !Array.isArray(msg.data)) return;
      for (const d of msg.data) {
        if (!ASSETS.includes(d.coin as WhaleAsset)) continue;
        const price = parseFloat(d.px);
        const qty = parseFloat(d.sz);
        const sizeUsd = price * qty;
        emitTrade({
          id: `hl-${d.coin}-${d.tid ?? `${d.time}-${d.px}-${d.sz}`}`,
          asset: d.coin as WhaleAsset,
          side: d.side === "B" ? "BUY" : "SELL",
          price, quantity: qty, sizeUsd,
          tradeTime: Number(d.time),
          exchange: "hyperliquid",
        });
      }
    },
  });

  conns.forEach(connect);
}

// Visibility handling — pause on hidden, reconnect on visible.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      conns.forEach((c) => {
        if (c.timer) { clearTimeout(c.timer); c.timer = null; }
        try { c.ws?.close(); } catch { /* noop */ }
      });
    } else {
      conns.forEach((c) => { if (!c.ws || c.ws.readyState >= 2) connect(c); });
    }
  });
}

/** Subscribe to the merged whale trade firehose across Bybit/OKX/Hyperliquid. */
export function subscribeMultiExchangeTrades(l: TradeListener): () => void {
  startAll();
  tradeListeners.add(l);
  return () => { tradeListeners.delete(l); };
}

/** Subscribe to per-exchange connection status changes. */
export function subscribeExchangeStatus(l: StatusListener): () => void {
  startAll();
  statusListeners.add(l);
  l({ ...status });
  return () => { statusListeners.delete(l); };
}
