import type {
  Whale, NewsItem, FundingRow, ExchangeSignal, OptionTrade,
  AISignal, DivergenceRow, Alert, Symbol, Tier,
} from "./types";

const wallets = [
  "0x7f3a9b2c8d1e4f5a6b7c8d9e0f1a2b3c", "0x3c8d4e1f9a2b5c6d7e8f9a0b1c2d3e4f",
  "0x9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d", "0x5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a",
  "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e", "0x8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
  "0x4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b", "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
  "0x6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f", "0xa1b2c3d4e5f67890abcdef1234567890",
  "0xb2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7", "0xc3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
];
const aliases = [
  "Whale_Alpha", "DeFi_King", "Cipher_Bot", "Hyperion", "NightOwl",
  "QuantumX", "PerpLord", "ChainHunter", "AlphaTrader", "MysticWhale",
  "OnyxFund", "VegaPrime",
];

const tierFor = (size: number): Tier =>
  size > 10_000_000 ? "MEGA" : size > 1_000_000 ? "SHARK" : "BIGFISH";

function shortWallet(w: string) {
  return `${w.slice(0, 6)}...${w.slice(-4)}`;
}

export function buildMockWhales(): Whale[] {
  const basePrices = { BTC: 97_850, ETH: 3_720, SOL: 215 } as const;
  const symbols: Symbol[] = ["BTC", "ETH", "SOL"];
  const now = Date.now();
  return wallets.map((w, i) => {
    const symbol = symbols[i % 3];
    const side: "LONG" | "SHORT" = i % 3 === 1 ? "SHORT" : "LONG";
    const sizeBuckets = [12_400_000, 8_500_000, 4_200_000, 2_100_000, 1_300_000, 720_000, 410_000, 220_000];
    const size = sizeBuckets[i % sizeBuckets.length];
    const leverage = [5, 10, 15, 20, 25][i % 5];
    const current = basePrices[symbol];
    const entryDelta = (Math.sin(i * 1.3) * 0.04);
    const entry = +(current * (1 - entryDelta)).toFixed(2);
    const liqGap = side === "LONG" ? -(1 / leverage) * 0.95 : (1 / leverage) * 0.95;
    // Make a couple near liquidation for visual interest
    const liqMultiplier = i === 2 ? 0.96 : i === 5 ? 0.93 : 1;
    const liqPrice = +(entry * (1 + liqGap * liqMultiplier)).toFixed(2);
    return {
      id: `w-${i}`,
      wallet: shortWallet(w),
      alias: aliases[i] ?? `Wallet_${i}`,
      tier: tierFor(size),
      symbol,
      side,
      size,
      leverage,
      entry,
      current,
      liqPrice,
      smartScore: [94, 88, 76, 91, 62, 48, 83, 71, 95, 55, 79, 67][i],
      openedAt: now - (i + 1) * 1000 * 60 * (15 + (i % 5) * 7),
    };
  });
}

export function buildMockNews(): NewsItem[] {
  const now = Date.now();
  const items = [
    { source: "CoinDesk", title: "Spot Bitcoin ETFs see record $1.2B inflow as institutions pile in" },
    { source: "The Block", title: "Ethereum Pectra upgrade scheduled for early next quarter, devs confirm" },
    { source: "Decrypt", title: "Solana DEX volume surges past $8B weekly, flips Ethereum L1" },
    { source: "Bloomberg", title: "Fed signals dovish pivot — risk assets rally, BTC reclaims $97k" },
    { source: "Reuters", title: "SEC drops appeal in landmark crypto case, opening door for new products" },
    { source: "CryptoSlate", title: "Whale wallet moves 8,000 BTC to derivatives exchange — analysts split" },
  ];
  return items.map((n, i) => ({
    id: `n-${i}`,
    source: n.source,
    title: n.title,
    url: "#",
    publishedAt: now - (i + 1) * 1000 * 60 * (3 + i * 4),
    ai: {
      score: [9, 7, 8, 9, 6, 5][i],
      verdict: (["BULLISH", "BULLISH", "BULLISH", "BULLISH", "NEUTRAL", "BEARISH"][i]) as "BULLISH" | "BEARISH" | "NEUTRAL",
      impact: (["HIGH", "MEDIUM", "HIGH", "HIGH", "MEDIUM", "MEDIUM"][i]) as "HIGH" | "MEDIUM" | "LOW",
      summary: [
        "Massive institutional demand signals continued bull thesis.",
        "Network upgrade likely to reduce gas, bullish mid-term.",
        "On-chain activity confirms Solana ecosystem momentum.",
        "Macro tailwind: risk-on environment favors crypto.",
        "Regulatory clarity slowly improving, neutral immediate impact.",
        "Whale derivatives move suggests hedging or distribution.",
      ][i],
    },
  }));
}

export function buildMockFunding(): FundingRow[] {
  const mk = (sym: Symbol, vals: number[], avg: number, sq: number, hist: number[]): FundingRow => ({
    symbol: sym,
    binance: vals[0], bybit: vals[1], okx: vals[2],
    avg, status: avg > 0.05 ? "Extreme Long" : avg > 0.01 ? "Long" : avg < -0.01 ? "Short" : "Neutral",
    squeezeProb: sq, history: hist,
  });
  return [
    mk("BTC", [0.012, 0.014, 0.011], 0.0123, 32, [0.008, 0.011, 0.009, 0.013, 0.012, 0.014, 0.0123]),
    mk("ETH", [0.058, 0.061, 0.055], 0.058, 78, [0.02, 0.025, 0.03, 0.04, 0.05, 0.055, 0.058]),
    mk("SOL", [-0.018, -0.022, -0.015], -0.0183, 41, [0.005, 0, -0.005, -0.01, -0.015, -0.02, -0.0183]),
  ];
}

export function buildMockExchangeSignals(): Record<Symbol, ExchangeSignal[]> {
  return {
    BTC: [
      { exchange: "Binance", direction: "LONG", oiChange: 5.2, funding: 0.012, volume: 2.1e9, signal: "BUY", strength: 80 },
      { exchange: "Bybit",   direction: "LONG", oiChange: 4.8, funding: 0.011, volume: 1.8e9, signal: "BUY", strength: 76 },
      { exchange: "OKX",     direction: "LONG", oiChange: 3.1, funding: 0.009, volume: 0.9e9, signal: "BUY", strength: 64 },
    ],
    ETH: [
      { exchange: "Binance", direction: "LONG", oiChange: 6.5, funding: 0.058, volume: 1.4e9, signal: "BUY", strength: 88 },
      { exchange: "Bybit",   direction: "LONG", oiChange: 5.9, funding: 0.061, volume: 1.1e9, signal: "BUY", strength: 84 },
      { exchange: "OKX",     direction: "SHORT", oiChange: -2.1, funding: -0.003, volume: 0.6e9, signal: "SELL", strength: 40 },
    ],
    SOL: [
      { exchange: "Binance", direction: "SHORT", oiChange: -3.2, funding: -0.018, volume: 0.7e9, signal: "SELL", strength: 62 },
      { exchange: "Bybit",   direction: "SHORT", oiChange: -2.8, funding: -0.022, volume: 0.5e9, signal: "SELL", strength: 58 },
      { exchange: "OKX",     direction: "SHORT", oiChange: -1.9, funding: -0.015, volume: 0.3e9, signal: "SELL", strength: 50 },
    ],
  };
}

export function buildMockOptions(): OptionTrade[] {
  const now = Date.now();
  return Array.from({ length: 14 }, (_, i) => ({
    time: now - i * 1000 * 60 * 3,
    exchange: i % 2 ? "Deribit" : "OKX",
    symbol: i % 3 === 0 ? "ETH" : "BTC",
    type: (i % 2 ? "CALL" : "PUT") as "CALL" | "PUT",
    strike: i % 3 === 0 ? 4000 + i * 50 : 100_000 + i * 1000,
    expiry: ["28DEC25", "31JAN26", "28FEB26"][i % 3],
    premium: 12_000 + i * 8_400,
    side: (i % 2 ? "BUY" : "SELL") as "BUY" | "SELL",
    size: 5 + i * 3,
    unusual: i % 4 === 0,
  }));
}

export function buildMockAISignals(): AISignal[] {
  const now = Date.now();
  return [
    {
      asset: "BTC", signal: "LONG", entryZone: "97,200 – 97,800", target: 102_500, stop: 95_400,
      confidence: 82, evidence: ["📊 OI Rising", "🐋 Whale Long Cluster", "💰 Funding Neutral"],
      risk: "MEDIUM", time: now - 2 * 60_000,
    },
    {
      asset: "ETH", signal: "LONG", entryZone: "3,680 – 3,740", target: 4_050, stop: 3_540,
      confidence: 74, evidence: ["📈 Funding Hot", "🎯 Smart Wallets Buying", "📰 News Bullish"],
      risk: "HIGH", time: now - 8 * 60_000,
    },
    {
      asset: "SOL", signal: "SHORT", entryZone: "215 – 218", target: 195, stop: 224,
      confidence: 61, evidence: ["⚠️ Negative Funding Drift", "🐋 Whale Short Bias"],
      risk: "MEDIUM", time: now - 14 * 60_000,
    },
  ];
}

export function buildMockDivergence(): DivergenceRow[] {
  return [
    { symbol: "BTC", smart: 73, retail: 41, divergence: 32 },
    { symbol: "ETH", smart: 61, retail: 58, divergence: 3 },
    { symbol: "SOL", smart: 45, retail: 67, divergence: 22 },
  ];
}

export function buildMockLiqHeatmap() {
  const center = 97_850;
  return Array.from({ length: 31 }, (_, i) => {
    const offset = (i - 15) / 100; // ±15%
    const price = +(center * (1 + offset)).toFixed(0);
    const longLiq = offset < 0 ? Math.exp(-Math.abs(offset) * 12) * 1.4e9 + Math.random() * 1e8 : Math.random() * 5e7;
    const shortLiq = offset > 0 ? Math.exp(-Math.abs(offset) * 12) * 1.3e9 + Math.random() * 1e8 : Math.random() * 5e7;
    return { price, longLiq: Math.round(longLiq), shortLiq: Math.round(shortLiq) };
  });
}

export function buildMockCorrelation() {
  const make = (base: number, vol: number, corr: number) =>
    Array.from({ length: 14 }, (_, i) => {
      const btc = 92_000 + Math.sin(i / 2) * 3000 + i * 400;
      const other = base + Math.sin(i / 2) * vol * -corr + i * (corr > 0 ? vol / 8 : -vol / 8);
      return { day: i + 1, btc: +btc.toFixed(0), other: +other.toFixed(2) };
    });
  return {
    dxy: { data: make(104, 1.2, -0.73), corr: -0.73, label: "DXY vs BTC", interp: "Strong Inverse" },
    spx: { data: make(5800, 80, 0.62),  corr: 0.62,  label: "S&P 500 vs BTC", interp: "Positive" },
    gold: { data: make(2650, 40, 0.21), corr: 0.21,  label: "Gold vs BTC", interp: "Weak" },
    ethBtc: { data: make(0.038, 0.001, 0.85), corr: 0.85, label: "ETH/BTC Ratio", interp: "Strong" },
  };
}

export const MOCK_GLOBAL_ALERTS: Alert[] = [
  { id: "a1", type: "WHALE", icon: "🐋", title: "WHALE MOVE", description: "Whale_Alpha opened LONG BTC $12.4M @ 10x", severity: "high", timestamp: Date.now() - 30_000 },
  { id: "a2", type: "FUNDING", icon: "📊", title: "FUNDING ANOMALY", description: "ETH funding 0.058% — 4.2× weekly avg", severity: "high", timestamp: Date.now() - 90_000 },
  { id: "a3", type: "NEWS", icon: "📰", title: "MAJOR NEWS", description: "Fed dovish pivot — AI sentiment 9/10", severity: "high", timestamp: Date.now() - 180_000 },
  { id: "a4", type: "CONVERGENCE", icon: "⚡", title: "CONVERGENCE", description: "BTC: 3/3 exchanges aligned LONG", severity: "medium", timestamp: Date.now() - 240_000 },
  { id: "a5", type: "DIVERGENCE", icon: "🔀", title: "DIVERGENCE", description: "BTC whale/retail gap 32%", severity: "medium", timestamp: Date.now() - 360_000 },
];
