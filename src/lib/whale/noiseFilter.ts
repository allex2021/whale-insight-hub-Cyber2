// Noise detection patterns adapted from StephanAkkerman/fintwit-bot
// Filters out exchange internal transfers, known cold/hot wallets, and dust

const KNOWN_EXCHANGE_WALLETS = new Set<string>([
  // Binance
  "0x28c6c06298d514db089934071355e5743bf21d60", // Binance 14 (hot)
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549", // Binance 15
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d", // Binance 16
  "0x56eddb7aa87536c09ccc2793473599fd21a8b17f", // Binance 17 (cold)
  "0xf977814e90da44bfa03b6295a0616a897441acec", // Binance 8 (cold)
  // Coinbase
  "0x71660c4005ba85c37ccec55d0c4493e66fe775d3", // Coinbase 1
  "0x503828976d22510aad0201ac7ec88293211d23da", // Coinbase 2
  "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740", // Coinbase 3
  "0x3cd751e6b0078be393132286c442345e5dc49699", // Coinbase 4
  // Kraken / OKX
  "0x2910543af39aba0cd09dbb2d50200b3e800a63d2", // Kraken 1
  "0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13", // Kraken 2
  "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b", // OKX 1
  "0xa7efae728d2936e78bda97dc267687568dd593f3", // OKX 2
]);

export interface NoiseCheckInput {
  fromAddress?: string;
  toAddress?: string;
  type?: string;            // e.g. "internal_transfer"
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
