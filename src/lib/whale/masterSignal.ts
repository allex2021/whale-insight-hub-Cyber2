// Pure rule-based Master Signal aggregator.
// Combines: Confluence (0-100), funding, L/S, OB imbalance, F&G, OI, whale bias,
// recent whale $ flow, divergence — into ONE actionable trade idea.

export type Direction = "LONG" | "SHORT" | "NEUTRAL";

export interface MasterInputs {
  asset: "BTC" | "ETH" | "SOL";
  price: number;
  // Pre-computed confluence
  confluenceScore: number;          // 0-100
  // Raw market
  fundingRate: number;              // decimal (0.0001 = 0.01%)
  longShortRatio: number;
  orderBookImbalance: number;       // -1..+1
  fearGreedIndex: number;           // 0..100
  openInterestChange1h: number;     // %
  // Whale flow (6h)
  whaleBuyCount: number;
  whaleSellCount: number;
  whaleNetUsd: number;              // buy$ - sell$
  // Optional contextual
  priceChange24h?: number;          // %
  atrPct?: number;                  // % daily volatility estimate (fallback 2%)
}

export interface MasterSignal {
  direction: Direction;
  confidence: number;               // 0-100
  entry: number;
  target: number;
  stop: number;
  rr: number;                       // risk/reward ratio
  horizon: string;                  // e.g. "4-12h"
  reasons: { label: string; bias: "BULL" | "BEAR" | "NEUTRAL"; weight: number }[];
  headline: string;
}

export function computeMasterSignal(i: MasterInputs): MasterSignal {
  const reasons: MasterSignal["reasons"] = [];
  let bull = 0;
  let bear = 0;

  // Confluence baseline (strongest weight)
  const confDelta = i.confluenceScore - 50;
  if (confDelta > 0) bull += confDelta * 1.0;
  else bear += Math.abs(confDelta) * 1.0;
  reasons.push({
    label: `Confluence ${i.confluenceScore}/100`,
    bias: confDelta > 5 ? "BULL" : confDelta < -5 ? "BEAR" : "NEUTRAL",
    weight: Math.abs(confDelta),
  });

  // Whale net flow (USD)
  const whaleScore = Math.max(-25, Math.min(25, i.whaleNetUsd / 1_000_000));
  if (whaleScore > 0) bull += whaleScore;
  else bear += Math.abs(whaleScore);
  reasons.push({
    label: `Whale net 6h $${(i.whaleNetUsd / 1e6).toFixed(1)}M`,
    bias: whaleScore > 2 ? "BULL" : whaleScore < -2 ? "BEAR" : "NEUTRAL",
    weight: Math.abs(whaleScore),
  });

  // Funding contrarian
  const fr = i.fundingRate * 10000;
  if (fr > 1) { bear += Math.min(15, fr); reasons.push({ label: `Funding ${(i.fundingRate * 100).toFixed(3)}% — longs paying`, bias: "BEAR", weight: Math.min(15, fr) }); }
  else if (fr < -1) { bull += Math.min(15, -fr); reasons.push({ label: `Funding ${(i.fundingRate * 100).toFixed(3)}% — shorts paying`, bias: "BULL", weight: Math.min(15, -fr) }); }

  // L/S contrarian extremes
  if (i.longShortRatio > 2.0) { bear += 12; reasons.push({ label: `L/S ${i.longShortRatio.toFixed(2)} — crowded long`, bias: "BEAR", weight: 12 }); }
  else if (i.longShortRatio < 0.6) { bull += 15; reasons.push({ label: `L/S ${i.longShortRatio.toFixed(2)} — crowded short`, bias: "BULL", weight: 15 }); }

  // Order book imbalance (top 20)
  const obW = Math.abs(i.orderBookImbalance) * 12;
  if (i.orderBookImbalance > 0.1) { bull += obW; reasons.push({ label: "Order book bid-heavy", bias: "BULL", weight: obW }); }
  else if (i.orderBookImbalance < -0.1) { bear += obW; reasons.push({ label: "Order book ask-heavy", bias: "BEAR", weight: obW }); }

  // OI delta confirms trend
  if (Math.abs(i.openInterestChange1h) > 1) {
    const w = Math.min(8, Math.abs(i.openInterestChange1h));
    if (i.openInterestChange1h > 0 && (i.priceChange24h ?? 0) > 0) { bull += w; reasons.push({ label: `OI +${i.openInterestChange1h.toFixed(1)}% w/ price up`, bias: "BULL", weight: w }); }
    else if (i.openInterestChange1h > 0 && (i.priceChange24h ?? 0) < 0) { bear += w; reasons.push({ label: `OI +${i.openInterestChange1h.toFixed(1)}% w/ price down (shorts building)`, bias: "BEAR", weight: w }); }
  }

  // Fear & Greed contrarian
  if (i.fearGreedIndex < 25) { bull += 8; reasons.push({ label: `F&G ${i.fearGreedIndex} — extreme fear`, bias: "BULL", weight: 8 }); }
  else if (i.fearGreedIndex > 80) { bear += 8; reasons.push({ label: `F&G ${i.fearGreedIndex} — extreme greed`, bias: "BEAR", weight: 8 }); }

  // Decide direction
  const net = bull - bear;
  const total = bull + bear;
  const direction: Direction = Math.abs(net) < 10 ? "NEUTRAL" : net > 0 ? "LONG" : "SHORT";
  const confidence = Math.max(0, Math.min(100, Math.round(40 + (Math.abs(net) / Math.max(20, total)) * 60)));

  // Trade levels — use ATR estimate (default 2.5%)
  const atr = (i.atrPct ?? 2.5) / 100;
  const stopMult = 1.0;
  const targetMult = 2.2;

  let entry = i.price;
  let stop: number, target: number;
  if (direction === "LONG") {
    stop = +(entry * (1 - atr * stopMult)).toFixed(2);
    target = +(entry * (1 + atr * targetMult)).toFixed(2);
  } else if (direction === "SHORT") {
    stop = +(entry * (1 + atr * stopMult)).toFixed(2);
    target = +(entry * (1 - atr * targetMult)).toFixed(2);
  } else {
    stop = +(entry * (1 - atr * 0.8)).toFixed(2);
    target = +(entry * (1 + atr * 0.8)).toFixed(2);
  }
  const rr = +(targetMult / stopMult).toFixed(2);

  const horizon =
    confidence >= 80 ? "4-12h" :
    confidence >= 60 ? "12-36h" :
    "1-3d";

  const headline =
    direction === "NEUTRAL" ? `${i.asset} — no edge, stand aside` :
    `${i.asset} ${direction} · ${confidence}% conviction`;

  // Sort reasons by weight
  reasons.sort((a, b) => b.weight - a.weight);

  return { direction, confidence, entry, target, stop, rr, horizon, reasons: reasons.slice(0, 7), headline };
}
