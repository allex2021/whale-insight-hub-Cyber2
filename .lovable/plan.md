## Goal
Real-time Binance whale trades ke Alert Center e mix korbo, ar LONG (BUY) trade ele Web Audio beep bajbe.

## Approach

1. **New hook `src/hooks/useWhaleAlertSound.ts`**
   - Web Audio API diye short beep (800Hz, 150ms, fade out) — no asset file, no API call
   - `playBeep()` function export
   - First-call e AudioContext lazy-create (browser autoplay rules respect)

2. **`AlertCenter.tsx` update korbo:**
   - `useBinanceWhaleStream(500_000, 50)` add korbo
   - Stream theke notun trade ele:
     - Local "live alert" object banabo (id, type="WHALE", severity, message like `"BTC LONG · $1.2M @ $76,021"`, asset, created_at)
     - DB alerts ar stream alerts merge kore display korbo (sorted by time, top 50)
     - `side === "BUY"` (LONG) hole `playBeep()` call
   - Top-right e ekta speaker mute/unmute toggle button (localStorage e save) — user beep off korte parbe
   - Threshold $500k hardcoded (later settings e move kora jabe)

3. **Visual:**
   - Live whale alerts er border `border-bull/40` (LONG) / `border-bear/40` (SHORT) — quick visual cue
   - Icon: 🐋

## Files
- New: `src/hooks/useWhaleAlertSound.ts`
- Edit: `src/components/whale/AlertCenter.tsx`

## No DB changes, no secrets, no API costs.