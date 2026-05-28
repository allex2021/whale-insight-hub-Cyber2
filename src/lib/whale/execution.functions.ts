import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

// Multi-exchange best-price routing
export const getBestPrice = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      asset: z.string().min(1).max(10),
      side: z.enum(["buy", "sell"]),
      qty: z.number().positive(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const sym = data.asset.toUpperCase();
    const venues: Array<{ name: string; price: number | null; error?: string }> = [];

    // Binance
    try {
      const r = await fetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${sym}USDT`);
      const j = await r.json();
      const px = data.side === "buy" ? parseFloat(j.askPrice) : parseFloat(j.bidPrice);
      venues.push({ name: "Binance", price: Number.isFinite(px) ? px : null });
    } catch (e) {
      venues.push({ name: "Binance", price: null, error: String(e) });
    }

    // Coinbase
    try {
      const r = await fetch(`https://api.exchange.coinbase.com/products/${sym}-USD/ticker`);
      const j = await r.json();
      const bid = parseFloat(j.bid);
      const ask = parseFloat(j.ask);
      const px = data.side === "buy" ? ask : bid;
      venues.push({ name: "Coinbase", price: Number.isFinite(px) ? px : null });
    } catch (e) {
      venues.push({ name: "Coinbase", price: null, error: String(e) });
    }

    // Kraken
    try {
      const pair = `${sym}USD`;
      const r = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
      const j = await r.json();
      const result = j?.result ? Object.values(j.result)[0] as any : null;
      const ask = result ? parseFloat(result.a[0]) : NaN;
      const bid = result ? parseFloat(result.b[0]) : NaN;
      const px = data.side === "buy" ? ask : bid;
      venues.push({ name: "Kraken", price: Number.isFinite(px) ? px : null });
    } catch (e) {
      venues.push({ name: "Kraken", price: null, error: String(e) });
    }

    // OKX
    try {
      const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${sym}-USDT`);
      const j = await r.json();
      const d = j?.data?.[0];
      const ask = d ? parseFloat(d.askPx) : NaN;
      const bid = d ? parseFloat(d.bidPx) : NaN;
      const px = data.side === "buy" ? ask : bid;
      venues.push({ name: "OKX", price: Number.isFinite(px) ? px : null });
    } catch (e) {
      venues.push({ name: "OKX", price: null, error: String(e) });
    }

    const valid = venues.filter((v) => v.price !== null) as Array<{ name: string; price: number }>;
    const best = valid.length
      ? data.side === "buy"
        ? valid.reduce((a, b) => (b.price < a.price ? b : a))
        : valid.reduce((a, b) => (b.price > a.price ? b : a))
      : null;

    const worstPrice = valid.length
      ? data.side === "buy"
        ? Math.max(...valid.map((v) => v.price))
        : Math.min(...valid.map((v) => v.price))
      : null;
    const savingsBps = best && worstPrice
      ? Math.abs((worstPrice - best.price) / best.price) * 10000
      : 0;

    return {
      venues,
      best,
      notional: best ? best.price * data.qty : null,
      savingsBps: Math.round(savingsBps * 100) / 100,
      ts: Date.now(),
    };
  });

// Smart-order slicer: TWAP / VWAP / Iceberg simulation against Binance klines
export const simulateSmartOrder = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      asset: z.string().min(1).max(10),
      side: z.enum(["buy", "sell"]),
      totalQty: z.number().positive(),
      type: z.enum(["TWAP", "VWAP", "ICEBERG"]),
      slices: z.number().int().min(2).max(50),
      intervalMin: z.number().int().min(1).max(60).default(5),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const sym = `${data.asset.toUpperCase()}USDT`;
    // recent 1m klines for live simulation
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1m&limit=${Math.min(data.slices * data.intervalMin, 500)}`);
    const k = (await r.json()) as any[];
    if (!Array.isArray(k) || k.length === 0) throw new Error("No price data");

    const candles = k.map((c) => ({
      time: c[0] as number,
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      vol: parseFloat(c[5]),
    }));

    // Sample at slice points
    const step = Math.floor(candles.length / data.slices) || 1;
    const samples = Array.from({ length: data.slices }, (_, i) =>
      candles[Math.min(i * step, candles.length - 1)],
    );

    let qtyPerSlice: number[] = [];
    if (data.type === "TWAP") {
      const q = data.totalQty / data.slices;
      qtyPerSlice = samples.map(() => q);
    } else if (data.type === "VWAP") {
      const totalVol = samples.reduce((s, c) => s + c.vol, 0);
      qtyPerSlice = samples.map((c) => (totalVol > 0 ? (c.vol / totalVol) * data.totalQty : data.totalQty / data.slices));
    } else {
      // ICEBERG: small visible chunks; uniform small slice (10%) repeated
      const visible = data.totalQty / data.slices;
      qtyPerSlice = samples.map(() => visible);
    }

    const fills = samples.map((c, i) => ({
      time: c.time,
      price: c.close,
      qty: qtyPerSlice[i],
      notional: c.close * qtyPerSlice[i],
    }));

    const totalNotional = fills.reduce((s, f) => s + f.notional, 0);
    const totalQty = fills.reduce((s, f) => s + f.qty, 0);
    const avgFill = totalNotional / totalQty;
    const arrival = samples[0].close;
    const slippageBps = ((avgFill - arrival) / arrival) * 10000 * (data.side === "buy" ? 1 : -1);

    return {
      fills,
      avgFill,
      arrival,
      slippageBps: Math.round(slippageBps * 100) / 100,
      totalQty,
      totalNotional,
    };
  });

// AI trade journal analysis
export const analyzeTradeJournal = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      trades: z.array(z.object({
        asset: z.string(),
        side: z.string(),
        qty: z.number(),
        avgFill: z.number(),
        type: z.string(),
        slippageBps: z.number(),
        pnlPct: z.number().nullable().optional(),
        note: z.string().optional(),
        ts: z.number(),
      })).min(1).max(50),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY!;
    const provider = createLovableAiGatewayProvider(apiKey);
    const model = provider("google/gemini-2.5-flash");

    const summary = data.trades.map((t, i) => {
      const date = new Date(t.ts).toISOString();
      return `#${i + 1} [${date}] ${t.side.toUpperCase()} ${t.qty} ${t.asset} via ${t.type} @ avg ${t.avgFill.toFixed(2)} | slippage ${t.slippageBps}bps${t.pnlPct != null ? ` | PnL ${t.pnlPct}%` : ""}${t.note ? ` | note: ${t.note}` : ""}`;
    }).join("\n");

    const { text } = await generateText({
      model,
      messages: [
        {
          role: "system",
          content: "Tumi ekjon professional trade coach. Bangla te short, sharp insight dao. Markdown bullet use koro. 6-8 line max.",
        },
        {
          role: "user",
          content: `Eta amar trade journal:\n${summary}\n\nAnalysis dao: execution quality (slippage), risk pattern, mistake, improvement. Bangla te.`,
        },
      ],
    });

    return { analysis: text };
  });
