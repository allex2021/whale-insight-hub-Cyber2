import { createServerFn } from "@tanstack/react-start";

export type WhalePosition = {
  address: string;
  alias: string;
  accountValue: number;
  dayPnl: number;
  allTimePnl: number;
  coin: string;
  side: "LONG" | "SHORT";
  sizeUsd: number;
  leverage: number;
  entry: number;
  current: number;
  unrealizedPnl: number;
  pnlPct: number;
  liqPrice: number | null;
  liqDistancePct: number | null;
  smartScore: number;
};

type LBRow = {
  ethAddress: string;
  accountValue: string;
  displayName?: string | null;
  windowPerformances: Array<[string, { pnl: string; roi: string; vlm: string }]>;
};

type Ctx = {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  oraclePx: string;
  markPx: string;
};

type Universe = { name: string; maxLeverage: number; szDecimals: number };

type AssetPos = {
  position: {
    coin: string;
    szi: string; // negative => short
    entryPx: string;
    leverage: { type: string; value: number };
    liquidationPx: string | null;
    unrealizedPnl: string;
    positionValue: string;
    returnOnEquity: string;
  };
};

type ClearingState = { assetPositions: AssetPos[] };

const ALIASES = [
  "HyperWhale", "DegenKing", "BigShort", "TrendFollower",
  "InstitutionAlpha", "SizeMatters", "GigaBrain", "LiqHunter",
  "AlphaSeeker", "CryptoOracle", "MoonShooter", "RiskTaker",
];

let cache: { at: number; data: WhalePosition[] } | null = null;

export const fetchHyperliquidWhales = createServerFn({ method: "GET" }).handler(
  async (): Promise<WhalePosition[]> => {
    if (cache && Date.now() - cache.at < 60_000) return cache.data;

    // 1. Leaderboard + market meta in parallel
    const [lbRes, metaRes] = await Promise.all([
      fetch("https://stats-data.hyperliquid.xyz/Mainnet/leaderboard"),
      fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      }),
    ]);
    if (!lbRes.ok) throw new Error(`HL leaderboard ${lbRes.status}`);
    if (!metaRes.ok) throw new Error(`HL meta ${metaRes.status}`);

    const lb = (await lbRes.json()) as { leaderboardRows: LBRow[] };
    const meta = (await metaRes.json()) as [{ universe: Universe[] }, Ctx[]];
    const universe = meta[0].universe;
    const ctxs = meta[1];
    const ctxByCoin = new Map<string, { mark: number; oracle: number }>();
    universe.forEach((u, i) => {
      const c = ctxs[i];
      if (c) ctxByCoin.set(u.name, { mark: parseFloat(c.markPx), oracle: parseFloat(c.oraclePx) });
    });

    // 2. Pick top 25 by day volume (active traders)
    const dayVlm = (r: LBRow) => {
      const w = r.windowPerformances.find(([k]) => k === "day");
      return w ? parseFloat(w[1].vlm) : 0;
    };
    const candidates = lb.leaderboardRows
      .filter((r) => parseFloat(r.accountValue) > 1_000_000)
      .sort((a, b) => dayVlm(b) - dayVlm(a))
      .slice(0, 25);

    // 3. Fetch clearinghouseState for each (parallel, bounded)
    const states = await Promise.all(
      candidates.map(async (r) => {
        try {
          const res = await fetch("https://api.hyperliquid.xyz/info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "clearinghouseState", user: r.ethAddress }),
          });
          if (!res.ok) return null;
          return { row: r, state: (await res.json()) as ClearingState };
        } catch {
          return null;
        }
      }),
    );

    // 4. Build whale rows — biggest position per wallet
    const rows: WhalePosition[] = [];
    let aliasIdx = 0;
    for (const item of states) {
      if (!item || !item.state.assetPositions.length) continue;
      const { row, state } = item;
      const biggest = state.assetPositions
        .map((ap) => ap.position)
        .sort((a, b) => parseFloat(b.positionValue) - parseFloat(a.positionValue))[0];
      if (!biggest) continue;

      const szi = parseFloat(biggest.szi);
      const side: "LONG" | "SHORT" = szi >= 0 ? "LONG" : "SHORT";
      const entry = parseFloat(biggest.entryPx);
      const ctx = ctxByCoin.get(biggest.coin);
      const current = ctx?.mark ?? entry;
      const sizeUsd = parseFloat(biggest.positionValue);
      const lev = biggest.leverage.value;
      const unrealizedPnl = parseFloat(biggest.unrealizedPnl);
      const liqPrice = biggest.liquidationPx ? parseFloat(biggest.liquidationPx) : null;
      const liqDistancePct =
        liqPrice && current ? Math.abs(((current - liqPrice) / current) * 100) : null;
      const pnlPct = parseFloat(biggest.returnOnEquity) * 100;

      const dayP = row.windowPerformances.find(([k]) => k === "day")?.[1];
      const allP = row.windowPerformances.find(([k]) => k === "allTime")?.[1];
      const dayPnl = dayP ? parseFloat(dayP.pnl) : 0;
      const allTimePnl = allP ? parseFloat(allP.pnl) : 0;
      const allRoi = allP ? parseFloat(allP.roi) : 0;

      // Smart score: blend all-time PnL & ROI into 0-100
      const pnlScore = Math.min(60, Math.max(0, (Math.log10(Math.max(allTimePnl, 1)) / 9) * 60));
      const roiScore = Math.min(40, Math.max(0, allRoi * 200));
      const smartScore = Math.round(pnlScore + roiScore);

      rows.push({
        address: row.ethAddress,
        alias: ALIASES[aliasIdx++ % ALIASES.length] + "_" + (aliasIdx),
        accountValue: parseFloat(row.accountValue),
        dayPnl,
        allTimePnl,
        coin: biggest.coin,
        side,
        sizeUsd,
        leverage: lev,
        entry,
        current,
        unrealizedPnl,
        pnlPct,
        liqPrice,
        liqDistancePct,
        smartScore,
      });
      if (rows.length >= 12) break;
    }

    cache = { at: Date.now(), data: rows };
    return rows;
  },
);
