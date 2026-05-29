import { useQuery } from "@tanstack/react-query";
import { Panel, Chip } from "./Panel";
import { SkeletonLoader } from "./SkeletonLoader";
import { ErrorState } from "./StateView";
import { TrendingDown, TrendingUp, Sigma } from "lucide-react";
import { cn } from "@/lib/utils";

type DeribitBook = {
  instrument_name: string;
  underlying_price: number;
  mark_price: number;
  open_interest: number;
  volume: number; // 24h in contracts
  volume_usd: number;
  base_currency: string;
  quote_currency: string;
  mark_iv?: number;
};

type DeribitData = {
  currency: "BTC" | "ETH";
  spotPrice: number;
  totalVolume24h: number;
  totalOI: number;
  callVolume: number;
  putVolume: number;
  pcr: number; // put/call ratio
  topByOi: { name: string; type: "CALL" | "PUT"; strike: number; expiry: string; oi: number; iv?: number }[];
  topByVol: { name: string; type: "CALL" | "PUT"; strike: number; expiry: string; vol: number; iv?: number }[];
};

function parseInstrument(name: string) {
  // e.g. BTC-25SEP26-80000-C
  const parts = name.split("-");
  if (parts.length < 4) return null;
  const expiry = parts[1];
  const strike = parseFloat(parts[2]);
  const type: "CALL" | "PUT" = parts[3] === "C" ? "CALL" : "PUT";
  return { expiry, strike, type };
}

async function fetchDeribit(currency: "BTC" | "ETH"): Promise<DeribitData> {
  const url = `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Deribit ${r.status}`);
  const j = await r.json();
  const books: DeribitBook[] = j.result ?? [];
  if (!books.length) throw new Error("no options data");

  const spotPrice = books[0].underlying_price;
  let totalVolume24h = 0, totalOI = 0, callVolume = 0, putVolume = 0;
  type Item = { name: string; type: "CALL" | "PUT"; strike: number; expiry: string; oi: number; vol: number; iv?: number };
  const items: Item[] = [];

  for (const b of books) {
    const meta = parseInstrument(b.instrument_name);
    if (!meta) continue;
    const oi = b.open_interest;
    const vol = b.volume;
    totalVolume24h += vol;
    totalOI += oi;
    if (meta.type === "CALL") callVolume += vol; else putVolume += vol;
    items.push({ name: b.instrument_name, ...meta, oi, vol, iv: b.mark_iv });
  }

  const topByOi = [...items].sort((a, b) => b.oi - a.oi).slice(0, 6)
    .map(({ name, type, strike, expiry, oi, iv }) => ({ name, type, strike, expiry, oi, iv }));
  const topByVol = [...items].sort((a, b) => b.vol - a.vol).slice(0, 6)
    .map(({ name, type, strike, expiry, vol, iv }) => ({ name, type, strike, expiry, vol, iv }));

  return {
    currency,
    spotPrice,
    totalVolume24h,
    totalOI,
    callVolume,
    putVolume,
    pcr: callVolume > 0 ? putVolume / callVolume : 0,
    topByOi,
    topByVol,
  };
}

function fmtNum(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function CurrencyBlock({ data }: { data: DeribitData }) {
  const bias = data.pcr > 0.85 ? "BEARISH" : data.pcr < 0.55 ? "BULLISH" : "NEUTRAL";
  const biasTone = bias === "BULLISH" ? "bull" : bias === "BEARISH" ? "bear" : "default";
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-bold text-foreground">{data.currency}</span>
          <span className="font-mono text-xs text-muted-foreground">${data.spotPrice.toLocaleString()}</span>
        </div>
        <Chip tone={biasTone}>{bias === "BULLISH" ? "🟢" : bias === "BEARISH" ? "🔴" : "⚪"} {bias}</Chip>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded border border-border/40 bg-card/40 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">P/C Ratio</div>
          <div className={cn("font-mono text-sm font-bold",
            data.pcr > 1 ? "text-bear" : "text-bull")}>{data.pcr.toFixed(2)}</div>
        </div>
        <div className="rounded border border-border/40 bg-card/40 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">24h Vol</div>
          <div className="font-mono text-sm font-bold text-foreground">{fmtNum(data.totalVolume24h)}</div>
        </div>
        <div className="rounded border border-border/40 bg-card/40 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Open Int</div>
          <div className="font-mono text-sm font-bold text-foreground">{fmtNum(data.totalOI)}</div>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          <Sigma className="h-3 w-3" /> Top by Open Interest
        </div>
        <div className="space-y-1">
          {data.topByOi.slice(0, 5).map((o) => (
            <div key={o.name} className="flex items-center justify-between rounded bg-card/30 px-2 py-1 text-[11px]">
              <div className="flex items-center gap-2">
                <span className={cn("inline-flex items-center gap-0.5 font-mono font-bold",
                  o.type === "CALL" ? "text-bull" : "text-bear")}>
                  {o.type === "CALL" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {o.type}
                </span>
                <span className="font-mono">${o.strike.toLocaleString()}</span>
                <span className="text-[9px] text-muted-foreground">{o.expiry}</span>
              </div>
              <div className="flex items-center gap-2">
                {typeof o.iv === "number" && (
                  <span className="font-mono text-[10px] text-[var(--neon-yellow)]">{o.iv.toFixed(0)}% IV</span>
                )}
                <span className="font-mono text-foreground">{fmtNum(o.oi)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DeribitOptionsPanel() {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["deribit-options"],
    queryFn: async () => {
      const [btc, eth] = await Promise.all([fetchDeribit("BTC"), fetchDeribit("ETH")]);
      return { btc, eth };
    },
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  return (
    <Panel
      title="Deribit Options Flow"
      subtitle="Real institutional options · BTC & ETH · Put/Call ratio · top strikes by OI"
      accent="purple"
    >
      {isLoading && !data && <LoadingState label="Loading Deribit options book…" />}
      {error && !data && <ErrorState error={String(error)} onRetry={() => refetch()} />}
      {data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CurrencyBlock data={data.btc} />
          <CurrencyBlock data={data.eth} />
        </div>
      )}
    </Panel>
  );
}
