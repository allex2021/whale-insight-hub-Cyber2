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

/**
 * mempool.space free API: recommended fees + top mining pools (24h share).
 */

export type MempoolFees = {
  fastest: number; // sat/vB
  halfHour: number;
  hour: number;
  economy: number;
  minimum: number;
};

export type MiningPool = {
  name: string;
  blockCount: number;
  share: number; // 0..1
};

export type BtcFeesPools = {
  fetchedAt: number;
  fees: MempoolFees;
  pools: MiningPool[];
  totalBlocks24h: number;
};

let fpCache: { at: number; data: BtcFeesPools } | null = null;

type RawFees = {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
};
type RawPools = {
  pools: Array<{ name: string; blockCount: number }>;
  blockCount: number;
};

export const fetchBtcFeesPools = createServerFn({ method: "GET" }).handler(
  async (): Promise<BtcFeesPools> => {
    if (fpCache && Date.now() - fpCache.at < 60_000) return fpCache.data;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const [feesR, poolsR] = await Promise.all([
        fetch("https://mempool.space/api/v1/fees/recommended", { signal: ctrl.signal }),
        fetch("https://mempool.space/api/v1/mining/pools/24h", { signal: ctrl.signal }),
      ]);
      if (!feesR.ok) throw new Error(`fees ${feesR.status}`);
      if (!poolsR.ok) throw new Error(`pools ${poolsR.status}`);
      const f = (await feesR.json()) as RawFees;
      const p = (await poolsR.json()) as RawPools;
      const total = Number(p.blockCount) || p.pools.reduce((s, x) => s + (x.blockCount || 0), 0);
      const pools: MiningPool[] = (p.pools || [])
        .slice(0, 6)
        .map((x) => ({
          name: x.name,
          blockCount: Number(x.blockCount) || 0,
          share: total > 0 ? (Number(x.blockCount) || 0) / total : 0,
        }));
      const data: BtcFeesPools = {
        fetchedAt: Date.now(),
        fees: {
          fastest: Number(f.fastestFee) || 0,
          halfHour: Number(f.halfHourFee) || 0,
          hour: Number(f.hourFee) || 0,
          economy: Number(f.economyFee) || 0,
          minimum: Number(f.minimumFee) || 0,
        },
        pools,
        totalBlocks24h: total,
      };
      fpCache = { at: Date.now(), data };
      return data;
    } finally {
      clearTimeout(t);
    }
  },
);
