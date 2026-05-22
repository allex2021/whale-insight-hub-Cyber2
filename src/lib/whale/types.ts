export type Side = "LONG" | "SHORT";
export type Tier = "MEGA" | "SHARK" | "BIGFISH";
export type Symbol = "BTC" | "ETH" | "SOL";

export interface Whale {
  id: string;
  wallet: string;
  alias: string;
  tier: Tier;
  symbol: Symbol;
  side: Side;
  size: number;
  leverage: number;
  entry: number;
  current: number;
  liqPrice: number;
  smartScore: number;
  openedAt: number;
  aiVerdict?: { text: string; risk: number };
}

export interface PriceTick {
  symbol: Symbol;
  price: number;
  change24h: number;
}

export interface MarketGlobals {
  fearGreed: { value: number; label: string };
  marketCap: number;
  btcDominance: number;
}

export interface NewsItem {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt: number;
  ai?: {
    score: number;
    verdict: "BULLISH" | "BEARISH" | "NEUTRAL";
    impact: "HIGH" | "MEDIUM" | "LOW";
    summary: string;
  };
}

export interface FundingRow {
  symbol: Symbol;
  binance: number;
  bybit: number;
  okx: number;
  avg: number;
  status: string;
  squeezeProb: number;
  history: number[];
}

export interface ExchangeSignal {
  exchange: string;
  direction: Side;
  oiChange: number;
  funding: number;
  volume: number;
  signal: "BUY" | "SELL";
  strength: number;
}

export interface Alert {
  id: string;
  type: string;
  icon: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  timestamp: number;
}

export interface OptionTrade {
  time: number;
  exchange: string;
  symbol: string;
  type: "CALL" | "PUT";
  strike: number;
  expiry: string;
  premium: number;
  side: "BUY" | "SELL";
  size: number;
  unusual: boolean;
}

export interface AISignal {
  asset: Symbol;
  signal: "LONG" | "SHORT" | "NEUTRAL";
  entryZone: string;
  target: number;
  stop: number;
  confidence: number;
  evidence: string[];
  risk: "LOW" | "MEDIUM" | "HIGH";
  time: number;
}

export interface DivergenceRow {
  symbol: Symbol;
  smart: number;
  retail: number;
  divergence: number;
}
