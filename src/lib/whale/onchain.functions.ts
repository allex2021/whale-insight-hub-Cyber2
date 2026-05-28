import { createServerFn } from "@tanstack/react-start";

/**
 * Bitcoin network stats from Blockchain.com public endpoints (no API key).
 * Cached 60s to stay well under their rate limits.
 */

export type BtcNetwork = {
  fetchedAt: number;
  priceUsd: number;
  hashRateEhs: number; // EH/s
  difficulty: number;
  unconfirmedTx: number;
  mempoolBytes: number;
  minutesBetweenBlocks: number;
  blocksMined24h: number;
  btcMined24h: number;
  minersRevenueUsd: number;
  totalFeesBtc: number;
  marketCapUsd: number;
  txRate: number; // tx/sec (estimated)
};

type RawStats = {
  market_price_usd: number;
  hash_rate: number; // GH/s
  difficulty: number;
  minutes_between_blocks: number;
  n_btc_mined: number; // satoshis
  n_blocks_mined: number;
  miners_revenue_usd: number;
  total_fees_btc: number; // satoshis
  market_cap: number;
  trade_volume_btc: number;
  estimated_transaction_volume_usd: number;
  n_tx: number;
};

type RawMempool = { size: number; bytes: number };

let cache: { at: number; data: BtcNetwork } | null = null;

export const fetchBtcNetwork = createServerFn({ method: "GET" }).handler(
  async (): Promise<BtcNetwork> => {
    if (cache && Date.now() - cache.at < 60_000) return cache.data;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const [statsR, mpR] = await Promise.all([
        fetch("https://api.blockchain.info/stats", { signal: ctrl.signal }),
        fetch("https://api.blockchain.info/mempool/fees", { signal: ctrl.signal }).catch(() => null),
        // fallback to unconfirmed count
      ]);
      if (!statsR.ok) throw new Error(`stats ${statsR.status}`);
      const s = (await statsR.json()) as RawStats;

      // Get unconfirmed tx count separately (lightweight)
      let unconfirmed = 0;
      let bytes = 0;
      try {
        const u = await fetch("https://blockchain.info/q/unconfirmedcount", {
          signal: ctrl.signal,
        });
        if (u.ok) unconfirmed = Number((await u.text()).trim()) || 0;
      } catch {
        /* ignore */
      }
      if (mpR && mpR.ok) {
        try {
          const m = (await mpR.json()) as RawMempool;
          bytes = Number(m.bytes) || 0;
        } catch {
          /* ignore */
        }
      }

      const data: BtcNetwork = {
        fetchedAt: Date.now(),
        priceUsd: Number(s.market_price_usd) || 0,
        hashRateEhs: (Number(s.hash_rate) || 0) / 1e9, // GH/s → EH/s
        difficulty: Number(s.difficulty) || 0,
        unconfirmedTx: unconfirmed,
        mempoolBytes: bytes,
        minutesBetweenBlocks: Number(s.minutes_between_blocks) || 0,
        blocksMined24h: Number(s.n_blocks_mined) || 0,
        btcMined24h: (Number(s.n_btc_mined) || 0) / 1e8,
        minersRevenueUsd: Number(s.miners_revenue_usd) || 0,
        totalFeesBtc: (Number(s.total_fees_btc) || 0) / 1e8,
        marketCapUsd: Number(s.market_cap) || 0,
        txRate: (Number(s.n_tx) || 0) / 86400,
      };
      cache = { at: Date.now(), data };
      return data;
    } finally {
      clearTimeout(t);
    }
  },
);
