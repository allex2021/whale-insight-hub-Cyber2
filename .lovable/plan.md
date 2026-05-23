# Add 8 new features to Whale Intelligence Pro

Sob feature **frontend-only** (no backend changes), **free public APIs** (Binance + CoinGecko), tomar existing design system + Panel component use korbe.

## Notun panels (live data)

1. **Order Book Walls** — Binance `@depth20@100ms` WebSocket. Top 5 bid + ask walls (USD value), highlight kore yeta current price er kacha. Boro wall = real-time S/R proof.

2. **CVD (Cumulative Volume Delta)** — Existing `useBinanceWhaleStream` extend kore, ekta lightweight aggTrade-based CVD calculator. BTC/ETH/SOL er jonno running delta (buy vol − sell vol) ekta sparkline. Price up + CVD down = bearish divergence chip.

3. **Open Interest Tracker** — Binance `/fapi/v1/openInterest` + `/futures/data/openInterestHist` (1h, last 24 candles). 9 ta symbol er jonno OI change % + mini sparkline + interpretation chip (OI↑+Price↑ = "TREND", OI↑+Price↓ = "SHORT BUILD", etc.). 60s refresh.

4. **Liquidation Feed (live)** — Binance `!forceOrder@arr` WebSocket. Real-time liquidation ticker, scrolling list with side/asset/USD size. ≥$100k = highlight, ≥$1M = play `playDump`/`playPump` sound.

5. **Macro Bar** — CoinGecko `/global` (free). BTC dominance, Total mcap, Total3 (alts ex-BTC/ETH), 24h change. Header-style strip dashboard er top e.

6. **Stablecoin Supply** — CoinGecko `/coins/markets?ids=tether,usd-coin,dai`. Total stablecoin mcap + 24h delta. Positive delta = liquidity entering crypto.

## UX features

7. **Symbol Favorites Filter** — Header e ekta multi-select chip bar (BTC/ETH/SOL/LTC/BNB/XRP/ADA/DOGE/AVAX). Selection localStorage e save. WhaleTracker, LongShortRatio, OI Tracker — sob ei filter respect korbe. Default: sob selected.

8. **Sound Settings Panel** — Settings page (`/_authenticated/settings`) e notun section. Per-alert-type toggle + volume slider:
   - Whale BUY beep
   - Whale SELL beep
   - Urgent news triple-beep
   - Liquidation alert (notun)
   
   localStorage e save, `useWhaleAlertSound` hook gulo read korbe.

## Files

**New:**
- `src/components/whale/OrderBookWalls.tsx`
- `src/components/whale/CVDPanel.tsx`
- `src/components/whale/OpenInterestTracker.tsx`
- `src/components/whale/LiquidationFeed.tsx`
- `src/components/whale/MacroBar.tsx`
- `src/components/whale/StablecoinSupply.tsx`
- `src/components/whale/SymbolFilter.tsx`
- `src/hooks/useBinanceDepth.ts`
- `src/hooks/useBinanceLiquidations.ts`
- `src/hooks/useSymbolFilter.ts` (Zustand-lite localStorage hook)
- `src/hooks/useSoundSettings.ts`

**Edit:**
- `src/routes/_authenticated/index.tsx` — wire new panels in this order:
  ```
  MacroBar → HeaderBar → SymbolFilter → WhaleTracker → LongShortRatio
  → OrderBookWalls → CVDPanel → OpenInterestTracker → SupportResistance
  → LiquidationFeed | StablecoinSupply (grid-2)
  → [existing rest]
  ```
- `src/hooks/useWhaleAlertSound.ts` — sound settings respect korbe (volume + enabled flags)
- `src/components/whale/WhaleTracker.tsx`, `LongShortRatio.tsx` — symbol filter integrate
- `src/routes/_authenticated/settings.tsx` — sound settings UI add

## Technical notes

- Sob Binance API public (no auth, no rate-limit issues at our cadence).
- CoinGecko free tier: 30 calls/min, amra 60s refresh use korchi, fine.
- WebSocket gulo `useEffect` cleanup + exponential backoff reconnect (existing pattern).
- Design tokens (`--neon-*`, `bull`/`bear`, `Panel`/`Chip`) consistent rakhbo.
- Mobile (750px) e sob panel responsive grid-collapse korbe.

## Skipped (require backend/paid APIs)

ETF flows, Telegram webhooks, Backtester, Wallet watchlist, Light theme — alada turn e bolle add korbo.
