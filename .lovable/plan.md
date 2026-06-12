# Elite Intelligence Terminal — SMC Command Center

A new dashboard tab inspired by glint.trade, hyper-focused on Smart Money Concepts. No candlestick charts — pure 4-column raw data terminal with live streams, monospace typography, and a glowing neon command-center theme.

## Where it lives

- New tab in `src/routes/_authenticated/index.tsx`:
  - `v: "elite"`, label `Elite SMC`, icon `Terminal`
  - Inserted after `Pro Chart`, before `AI Observer`
  - Mobile nav grid bumped `grid-cols-8 → grid-cols-9`
- New component: `src/components/whale/EliteIntelTerminal.tsx`
  - Lazy-imported + wrapped in `LazyMount` (min-height 900px)

## Layout

Top bar:
- Asset selector (BTC, ETH, SOL, LTC, BNB, XRP, DOGE — USDT pairs)
- Live status: pulsing neon-green dot + "STREAM ACTIVE" + last-tick timestamp
- Tiny ticker readout (price + 24h % from existing `useBinancePrice`/Binance WS hook already used elsewhere)

Main grid: `grid-cols-1 lg:grid-cols-4 gap-3` — each column = one widget.

```text
┌────────────── ASSET SELECTOR | STREAM ACTIVE | PRICE ──────────────┐
│  COL 1            │  COL 2            │  COL 3          │  COL 4   │
│  Liquidity Hunt   │  Algorithmic      │  Institutional  │  Tom     │
│  & Sweep Logger   │  Liquidity Matrix │  Order Blocks   │  Hougaard│
│  (scrolling log)  │  (BSL / SSL)      │  (Demand/Supply)│  Sentinel│
└──────────────── INSTITUTIONAL RISK DISCLAIMER ─────────────────────┘
```

## Widgets

### 1. Live Liquidity Hunt & Sweep Logger
- Vertical auto-scrolling terminal log, fixed height (~720px), newest at top
- Each line: `[HH:MM:SS] | [TICKER] 🚨 ALERT: [SMC action text]`
- Color coding: BSL sweeps = neon-red, SSL sweeps = neon-green, accumulation = neon-blue, distribution = amber
- Generator: setInterval (1.5–3.5s jitter) pulls from a templated pool of SMC events (BSL/SSL swept, OB tapped, FVG filled, MSS confirmed, liquidity grab, equal-highs/lows taken) seeded by current price ± realistic ATR offsets
- Buffer cap: 80 lines (drop oldest)
- Pause-on-hover, "CLEAR" + "PAUSE" buttons

### 2. Algorithmic Liquidity Matrix (BSL / SSL)
- Two oversized glowing numbers:
  - `BSL TARGET MAGNET ▲` (price + distance % + est. liquidation $ pool) — neon-green glow
  - `SSL DANGER ZONE ▼` (price + distance % + est. liquidation $ pool) — neon-red glow
- Re-computed each tick: BSL ≈ price × (1 + bsl_offset), SSL ≈ price × (1 − ssl_offset); offsets drift slowly via a smoothed random walk to feel live
- Secondary row: mid-range "equilibrium" + "premium / discount" badge based on price position
- Uses existing `AnimatedNumber` for smooth tweens

### 3. Institutional Supply & Demand Order Blocks
- Two stacked cards inside one column:
  - **LIVE WHALE DEMAND** (lower OB) — neon-green border, shows price zone (low–high), depth in USD, age, "Tapped 2x" counter
  - **LIVE WHALE SUPPLY** (upper OB) — neon-red border, same fields
- 2–3 active blocks per side, refreshed every ~6s; flashes when price re-enters zone
- Pure text/numbers, no charts

### 4. Tom Hougaard Sentiment & Anti-FOMO Counter
- Reads the sweep logger's recent buffer: counts sweep events in last 60s
- States:
  - `DISCIPLINED` (≤2 sweeps/min) — calm neon-blue
  - `ELEVATED` (3–5) — amber
  - `HEAVY SWEEP PHASE` (≥6) — flashing neon-red, shows the full Tom Hougaard warning verbatim
- Includes a small "FOMO meter" (0–100) and a rotating Hougaard discipline quote
- Reuses the existing Tom Hougaard tone from `TomHougaardSuite.tsx` for consistency

## Theme & Typography

- Monospace everywhere: add `font-mono` via Tailwind (`ui-monospace, SFMono-Regular, JetBrains Mono, Menlo`) — no new font files
- Reuse existing neon CSS vars (`--neon-purple`, `--neon-blue`, `--neon-green`, `--neon-red`/`--bear`) already defined in `src/styles.css` (referenced by current tabs). If `--neon-green` / `--neon-red` aren't present, add them to `:root` in `src/styles.css` alongside the existing neon set
- Card shells: dark `bg-card/40` + 1px neon-tinted border + soft outer glow `shadow-[0_0_18px_rgba(...)]`
- Scanline / subtle CRT vibe on the log column only (CSS gradient overlay, no extra deps)
- All numbers tabular-nums

## Data

- 100% client-side mock streams (no new server functions, no API calls)
- Single `useEliteStream(symbol)` hook inside the component file: returns `{ price, sweeps[], bsl, ssl, demandOBs[], supplyOBs[], fomoScore }`
- Seeded from a base price per asset, evolves via smoothed random walk so values feel coherent across widgets
- All intervals cleaned up on unmount; pauses when tab/document hidden

## Disclaimer

Full-width footer strip inside the component:
> INSTITUTIONAL RISK DISCLAIMER — Simulated data feed for educational analysis only. Smart Money Concept signals, liquidity zones, and order blocks shown here are algorithmic estimates, not investment advice. Crypto derivatives carry substantial risk of loss. You are solely responsible for your trading decisions.

## Files touched

- **Create** `src/components/whale/EliteIntelTerminal.tsx`
- **Edit** `src/routes/_authenticated/index.tsx` — register lazy import, add tab entry, add `TabsContent`, bump mobile grid to `grid-cols-9`
- **Edit** `src/styles.css` *only if* `--neon-green` / `--neon-red` tokens are missing

## Out of scope

- No real on-chain or exchange wiring (mock streams only, as implied by "live mock data streams")
- No candlestick chart of any kind
- No changes to other tabs
