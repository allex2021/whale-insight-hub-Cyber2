// Whale-trade intent classifier.
// Adapts the StephanAkkerman/fintwit-bot approach for our exchange-stream
// data shape: we mostly receive aggregated exchange trades (no from/to wallet
// addresses), so the classifier falls back to size/liquidation heuristics.

const KNOWN_EXCHANGE_WALLETS = new Set<string>([
  // Binance
  "0x28c6c06298d514db089934071355e5743bf21d60",
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549",
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d",
  "0x56eddb7aa87536c09ccc2793473599fd21a8b17f",
  "0xf977814e90da44bfa03b6295a0616a897441acec",
  // Coinbase
  "0x71660c4005ba85c37ccec55d0c4493e66fe775d3",
  "0x503828976d22510aad0201ac7ec88293211d23da",
  "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740",
  "0x3cd751e6b0078be393132286c442345e5dc49699",
  // Kraken / OKX / Bybit
  "0x2910543af39aba0cd09dbb2d50200b3e800a63d2",
  "0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13",
  "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b",
  "0xa7efae728d2936e78bda97dc267687568dd593f3",
  "0xf89d7b9c864f589bbf53a82105107622b35eaa40",
]);

export interface NoiseCheckInput {
  fromAddress?: string;
  toAddress?: string;
  type?: string;
  sizeUsd: number;
  exchange?: string;
}

export interface NoiseResult {
  isNoise: boolean;
  reason?: "exchange_wallet" | "internal_transfer" | "dust";
}

export function detectNoise(input: NoiseCheckInput, minUsd = 50_000): NoiseResult {
  const from = input.fromAddress?.toLowerCase();
  const to = input.toAddress?.toLowerCase();
  if (from && KNOWN_EXCHANGE_WALLETS.has(from)) return { isNoise: true, reason: "exchange_wallet" };
  if (to && KNOWN_EXCHANGE_WALLETS.has(to)) return { isNoise: true, reason: "exchange_wallet" };
  if (input.type === "internal_transfer") return { isNoise: true, reason: "internal_transfer" };
  if (input.sizeUsd < minUsd) return { isNoise: true, reason: "dust" };
  return { isNoise: false };
}

export function isKnownExchangeWallet(addr: string): boolean {
  return KNOWN_EXCHANGE_WALLETS.has(addr.toLowerCase());
}

// ─── Intent classifier ───────────────────────────────────────────────────────

export type TradeIntent =
  | "market_impact"
  | "internal_transfer"
  | "accumulation"
  | "distribution"
  | "liquidation"
  | "unknown";

export interface ClassifyInput {
  from?: string;
  to?: string;
  sizeUsd: number;
  side: "BUY" | "SELL" | "long" | "short" | "buy" | "sell";
  isLiquidation?: boolean;
  priceImpact?: number;
  exchange?: string;
}

export interface ClassifyResult {
  intent: TradeIntent;
  isNoise: boolean;
  label: string;
  emoji: string;
}

export function classifyWhaleIntent(trade: ClassifyInput): ClassifyResult {
  if (trade.isLiquidation) {
    return { intent: "liquidation", isNoise: false, label: "LIQUIDATION", emoji: "🔴" };
  }
  const from = trade.from?.toLowerCase();
  const to = trade.to?.toLowerCase();
  const fromIsExchange = !!from && KNOWN_EXCHANGE_WALLETS.has(from);
  const toIsExchange = !!to && KNOWN_EXCHANGE_WALLETS.has(to);

  if (fromIsExchange && toIsExchange) {
    return { intent: "internal_transfer", isNoise: true, label: "INTERNAL", emoji: "⚪" };
  }
  if (fromIsExchange && !toIsExchange && to) {
    return { intent: "accumulation", isNoise: false, label: "ACCUMULATION", emoji: "🟡" };
  }
  if (!fromIsExchange && toIsExchange && from) {
    return { intent: "distribution", isNoise: false, label: "DISTRIBUTION", emoji: "🟡" };
  }
  // Futures / perp / spot exchange trade with no on-chain addresses
  if (!from && !to) {
    return { intent: "market_impact", isNoise: false, label: "MARKET IMPACT", emoji: "🟢" };
  }
  if (trade.priceImpact && Math.abs(trade.priceImpact) > 0.05) {
    return { intent: "market_impact", isNoise: false, label: "MARKET IMPACT", emoji: "🟢" };
  }
  return { intent: "unknown", isNoise: false, label: "UNCLASSIFIED", emoji: "⚪" };
}
