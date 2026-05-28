## Goal

Phase 1 integrations — JS-equivalent stack যোগ করে existing panels upgrade:
1. **CCXT** → 108+ exchange unified API (cross-exchange data expand)
2. **VADER sentiment** → news article-এ NLP score, ConfluenceScore-এ weight যোগ

দুটোই pure JS, edge-runtime safe, কোনো extra secret লাগবে না।

## Implementation

### 1. Dependencies install
```
bun add ccxt vader-sentiment
```

### 2. New file: `src/lib/whale/ccxt.functions.ts`
TanStack server function (`createServerFn`)। CCXT server-side চলবে (edge runtime-এ ccxt-এর pro REST mode কাজ করে)।

Exposes:
- `getMultiExchangeTickers({ symbol })` — Binance, Bybit, OKX, Kraken, Coinbase, MEXC, Gate, KuCoin থেকে last price + 24h volume + change%
- `getAggregatedFunding({ symbol })` — perpetual funding rate aggregate (Binance, Bybit, OKX, MEXC, Gate)
- `getAggregatedOI({ symbol })` — open interest sum across exchanges

Each call wrapped in try/catch per exchange — একটা fail হলেও বাকিগুলো return হবে।

### 3. Update: `src/components/whale/CrossExchangeSignal.tsx`
- Existing 4-exchange data-র পাশে নতুন "Extended exchanges" section
- CCXT data fetch করে 8 exchange-এর price spread + volume share দেখাবে
- Convergence indicator (≥6 exchanges agree direction = STRONG signal)

### 4. New file: `src/lib/whale/sentiment.ts`
Pure client-safe helper:
```ts
import vader from 'vader-sentiment';
export function scoreText(text: string): { compound: number; label: 'BULLISH'|'BEARISH'|'NEUTRAL' }
```
Compound score >0.2 → BULLISH, <-0.2 → BEARISH, else NEUTRAL.

### 5. Update: `src/lib/whale/services.ts` (news fetcher)
- প্রতিটা news item-এর `title + description`-এ VADER চালাবে
- Result attach করবে `item.sentiment = { compound, label }`
- Gemini AI call rate-limited fallback হিসেবে rakhbo (heavy items only)

### 6. Update: `src/components/whale/NewsAI.tsx`
- Per-article-এ VADER score badge (color-coded)
- Aggregate "News Sentiment Index" header — last 20 article-এর average compound

### 7. Update: `src/components/whale/ConfluenceScore.tsx`
- New factor: `newsSentiment` (weight 10%)
- Pull average compound from cached news; map to ±score
- Display in factor breakdown row

## Files affected

**Create:**
- `src/lib/whale/ccxt.functions.ts`
- `src/lib/whale/sentiment.ts`

**Edit:**
- `src/components/whale/CrossExchangeSignal.tsx`
- `src/lib/whale/services.ts`
- `src/components/whale/NewsAI.tsx`
- `src/components/whale/ConfluenceScore.tsx`
- `package.json` (via bun add)

## Risks / notes

- **CCXT bundle size** — ~2MB; only server-side import (server function), client-এ যাবে না। Safe.
- **Rate limits** — CCXT-এর default; per-exchange request টা parallel + 5s cache layer যোগ করব।
- **Edge runtime** — CCXT-এর কিছু exchange WebSocket mode Worker-এ চলে না; আমরা শুধু REST methods (`fetchTicker`, `fetchFundingRate`, `fetchOpenInterest`) use করব — সব safe।
- **VADER** — English text only; CryptoPanic mostly English, fine.

## Verification

- Build pass check
- `/` route load করে CrossExchangeSignal-এ 8 exchange visible
- NewsAI-তে sentiment badge দৃশ্যমান
- ConfluenceScore breakdown-এ new "News Sentiment" row
