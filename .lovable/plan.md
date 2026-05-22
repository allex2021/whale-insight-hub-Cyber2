## Goal
Whale Tracker e beshi wallet/position dekhano — currently max 12 row asche.

## Current limits (`src/lib/whale/hyperliquid.functions.ts`)
- Leaderboard candidates: top **25** by 24h volume
- Output cap: **12** rows (`if (rows.length >= 12) break;`)
- Per wallet: shudhu **1-ta biggest position**

## Proposed changes

1. **Candidate pool barano:** `.slice(0, 25)` → `.slice(0, 60)` (Hyperliquid API call beshi hobe, but parallel — ~2-3s acceptable)

2. **Output cap barano:** `if (rows.length >= 12) break;` → `if (rows.length >= 40) break;`

3. **Per-wallet positions (optional, recommended):** Shudhu biggest na niye, pretyek wallet er shob open position list korbo (size threshold e.g. > $100k). Eta korle table e ekjon trader er multiple coin position dekha jabe (BTC + ETH + SOL etc.) — much richer view.

4. **Account value threshold komano:** `> 1_000_000` → `> 500_000` — aro beshi trader qualify korbe.

## Trade-offs
- More rows = beshi API calls to Hyperliquid (rate limit risk komano jabe cache 60s rakhle, already ache)
- Table taller — already scrollable, kono UI issue nai
- Filter (LONG/SHORT) still works per row

## Files
- Edit: `src/lib/whale/hyperliquid.functions.ts` (only)
- No DB / no other component changes

## Question
Apni ki chan:
- **A)** Shudhu cap barabo (12 → 40 rows, 1 position per wallet) — quick fix
- **B)** Full revamp — pretyek wallet er shob position dekhabo (could be 50-100+ rows)

Default suggestion: **A** — clean, fast, predictable.