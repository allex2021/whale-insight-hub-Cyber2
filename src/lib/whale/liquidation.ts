// Ported from vsching/liquidation-heatmap & gelatotrade/Hyperliquid-Liquidation-Levels (Python -> TS)

export interface Position {
  walletAddress?: string;
  asset: string;
  side: "long" | "short";
  size: number;       // base asset units
  entryPrice: number;
  leverage: number;
  marginUsed?: number;
}

export interface HeatmapBin {
  price: number;
  longs: number;   // USD value of long liq at this bin
  shorts: number;
  total: number;
}

/**
 * Approximate liquidation price (isolated margin).
 * Long: P_liq ≈ entry * (1 - 1/lev + mmr)
 * Short: P_liq ≈ entry * (1 + 1/lev - mmr)
 */
export function calculateLiquidationPrice(
  pos: Pick<Position, "side" | "entryPrice" | "leverage">,
  maintenanceMarginRate = 0.005,
): number {
  const { side, entryPrice, leverage } = pos;
  if (!leverage || leverage <= 0) return 0;
  if (side === "long") {
    return entryPrice * (1 - 1 / leverage + maintenanceMarginRate);
  }
  return entryPrice * (1 + 1 / leverage - maintenanceMarginRate);
}

export function buildLiquidationHeatmap(
  positions: Position[],
  currentPrice: number,
  binSizePercent = 0.1, // % of current price per bin
): HeatmapBin[] {
  const range = { min: currentPrice * 0.85, max: currentPrice * 1.15 };
  const binWidth = (currentPrice * binSizePercent) / 100;
  if (binWidth <= 0) return [];
  const bins = new Map<number, { longs: number; shorts: number }>();

  for (const pos of positions) {
    const liq = calculateLiquidationPrice(pos);
    if (liq < range.min || liq > range.max) continue;
    const binPrice = Math.round(liq / binWidth) * binWidth;
    const bucket = bins.get(binPrice) ?? { longs: 0, shorts: 0 };
    const usd = pos.size * pos.entryPrice;
    if (pos.side === "long") bucket.longs += usd;
    else bucket.shorts += usd;
    bins.set(binPrice, bucket);
  }

  return Array.from(bins.entries())
    .map(([price, { longs, shorts }]) => ({ price, longs, shorts, total: longs + shorts }))
    .sort((a, b) => a.price - b.price);
}

/** Find proximity (%) from current price to the nearest large liq cluster */
export function nearestCluster(
  bins: HeatmapBin[],
  currentPrice: number,
  minClusterUsd = 1_000_000,
): { distancePct: number; side: "long" | "short" | "neutral"; cluster?: HeatmapBin } {
  const big = bins.filter((b) => b.total >= minClusterUsd);
  if (!big.length) return { distancePct: 100, side: "neutral" };
  let nearest = big[0];
  let minDist = Math.abs(nearest.price - currentPrice);
  for (const b of big) {
    const d = Math.abs(b.price - currentPrice);
    if (d < minDist) { minDist = d; nearest = b; }
  }
  const distPct = (minDist / currentPrice) * 100;
  const side: "long" | "short" | "neutral" =
    nearest.longs > nearest.shorts * 1.5 ? "long" :
    nearest.shorts > nearest.longs * 1.5 ? "short" : "neutral";
  return { distancePct: distPct, side, cluster: nearest };
}
