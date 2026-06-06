import { useMemo, useState } from "react";
import { Shield, AlertTriangle, TrendingDown, Calculator, Zap } from "lucide-react";
import { Panel, Chip } from "./Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type AssetKey = "BTC_SPOT" | "ETH_SPOT" | "SOL_SPOT" | "ALT_BASKET" | "POLYMARKET" | "LP_POSITION";

const ASSETS: Record<AssetKey, { label: string; beta: number; hedgeSymbol: string; hedgeName: string; corr: number }> = {
  BTC_SPOT:   { label: "BTC Spot",            beta: 1.00, hedgeSymbol: "BTCUSDT-PERP", hedgeName: "Binance BTC Perpetual", corr: 1.00 },
  ETH_SPOT:   { label: "ETH Spot",            beta: 1.25, hedgeSymbol: "ETHUSDT-PERP", hedgeName: "Binance ETH Perpetual", corr: 0.92 },
  SOL_SPOT:   { label: "SOL Spot",            beta: 1.60, hedgeSymbol: "SOLUSDT-PERP", hedgeName: "Binance SOL Perpetual", corr: 0.84 },
  ALT_BASKET: { label: "Altcoin Basket",      beta: 1.85, hedgeSymbol: "ETHUSDT-PERP", hedgeName: "Binance ETH Perpetual (proxy)", corr: 0.78 },
  POLYMARKET: { label: "Polymarket Bet (USDC)", beta: 0.15, hedgeSymbol: "BTCUSDT-PERP", hedgeName: "Binance BTC Perpetual (tail hedge)", corr: 0.20 },
  LP_POSITION:{ label: "DeFi LP Position",    beta: 1.10, hedgeSymbol: "ETHUSDT-PERP", hedgeName: "Binance ETH Perpetual", corr: 0.88 },
};

export function WhaleShieldHedging() {
  const [asset, setAsset] = useState<AssetKey>("BTC_SPOT");
  const [notional, setNotional] = useState<number>(25000);
  const [risk, setRisk] = useState<number>(60); // 0-100
  const [hedgeRatio, setHedgeRatio] = useState<number>(75); // % of full delta-neutral

  const calc = useMemo(() => {
    const a = ASSETS[asset];
    // Delta-neutral hedge notional = portfolio * beta * (riskScore/100) * (hedgeRatio/100)
    const riskAdj = risk / 100;
    const ratioAdj = hedgeRatio / 100;
    const fullDeltaNotional = notional * a.beta;
    const recommendedNotional = fullDeltaNotional * riskAdj * ratioAdj;
    const recommendedLeverage = Math.max(0.1, Math.min(5, (recommendedNotional / Math.max(notional, 1)) * 2));
    const sizeX = recommendedNotional / Math.max(notional, 1); // e.g. 0.5x of portfolio
    // Var-style 1-day downside estimate using a crude 4% daily vol * beta
    const dailyVol = 0.04 * a.beta;
    const unhedgedVar = notional * dailyVol * 1.65;
    const residual = 1 - ratioAdj * a.corr;
    const hedgedVar = unhedgedVar * residual;
    const protection = 1 - hedgedVar / Math.max(unhedgedVar, 1);
    const marginEst = recommendedNotional / 5; // assume 5x margin
    return {
      a, recommendedNotional, recommendedLeverage, sizeX,
      unhedgedVar, hedgedVar, protection, marginEst,
    };
  }, [asset, notional, risk, hedgeRatio]);

  const riskLabel = risk < 33 ? "LOW" : risk < 66 ? "ELEVATED" : "EXTREME";
  const riskTone: "bull" | "warn" | "bear" = risk < 33 ? "bull" : risk < 66 ? "warn" : "bear";

  return (
    <Panel
      title="Whale Shield · Hedging Engine"
      subtitle="Delta-neutral position sizing for institutional portfolio defense"
      accent="purple"
      action={<Chip tone="purple"><Shield size={10} /> PREMIUM</Chip>}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-4 rounded-lg border border-border bg-background/40 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Calculator size={14} className="text-[var(--neon-blue)]" /> Position Inputs
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Current Asset / Exposure</Label>
            <Select value={asset} onValueChange={(v) => setAsset(v as AssetKey)}>
              <SelectTrigger className="font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ASSETS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="font-mono text-xs">{v.label} <span className="text-muted-foreground ml-2">β {v.beta.toFixed(2)}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Investment Amount (USD)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={notional}
              onChange={(e) => setNotional(Math.max(0, Number(e.target.value) || 0))}
              className="font-mono text-sm"
              placeholder="25000"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Current Market Risk</Label>
              <Chip tone={riskTone}>{riskLabel} · {risk}</Chip>
            </div>
            <Slider value={[risk]} onValueChange={(v) => setRisk(v[0])} min={0} max={100} step={1} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Hedge Aggressiveness</Label>
              <span className="font-mono text-xs text-muted-foreground">{hedgeRatio}% of Δ-neutral</span>
            </div>
            <Slider value={[hedgeRatio]} onValueChange={(v) => setHedgeRatio(v[0])} min={0} max={100} step={5} />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => { setRisk(25); setHedgeRatio(40); }}>Conservative</Button>
            <Button size="sm" variant="outline" onClick={() => { setRisk(60); setHedgeRatio(75); }}>Balanced</Button>
            <Button size="sm" variant="outline" onClick={() => { setRisk(90); setHedgeRatio(100); }}>Defensive</Button>
          </div>
        </div>

        {/* Recommendation */}
        <div className="space-y-3">
          <div className="rounded-lg border-2 border-[var(--neon-purple)]/50 bg-gradient-to-br from-[var(--neon-purple)]/10 to-transparent p-4 shadow-[0_0_20px_rgba(168,85,247,0.15)]">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--neon-purple)]">
              <Zap size={12} /> Recommended Hedge
            </div>
            <div className="mt-2 font-mono text-2xl font-extrabold text-foreground">
              SHORT {calc.sizeX.toFixed(2)}x <span className="text-[var(--neon-blue)]">{calc.a.hedgeSymbol}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Open a <span className="font-bold text-bear">{calc.sizeX.toFixed(2)}x short</span> on {calc.a.hedgeName} to neutralize {(hedgeRatio).toFixed(0)}% of directional delta.
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Stat label="Hedge Notional" value={`$${fmt(calc.recommendedNotional)}`} />
              <Stat label="Suggested Leverage" value={`${calc.recommendedLeverage.toFixed(1)}x`} />
              <Stat label="Est. Initial Margin" value={`$${fmt(calc.marginEst)}`} />
              <Stat label="Portfolio Beta (β)" value={calc.a.beta.toFixed(2)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Metric label="Unhedged 1d VaR" value={`-$${fmt(calc.unhedgedVar)}`} tone="bear" />
            <Metric label="Hedged 1d VaR" value={`-$${fmt(calc.hedgedVar)}`} tone="warn" />
            <Metric label="Downside Reduced" value={`${(calc.protection * 100).toFixed(1)}%`} tone="bull" />
          </div>

          <div className="rounded-lg border border-border bg-background/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <div className="mb-1 font-bold uppercase tracking-wider text-foreground">Formula · Delta-Neutral</div>
            HedgeNotional = Portfolio × β × RiskScore × Aggressiveness<br />
            = ${fmt(notional)} × {calc.a.beta.toFixed(2)} × {(risk/100).toFixed(2)} × {(hedgeRatio/100).toFixed(2)}<br />
            = <span className="text-foreground">${fmt(calc.recommendedNotional)}</span> · ρ={calc.a.corr.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Alternative Options strategy */}
      <div className="mt-4 rounded-lg border border-[var(--neon-blue)]/30 bg-[var(--neon-blue)]/5 p-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--neon-blue)]">
          <TrendingDown size={12} /> Alternative · Options Hedge
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Capital-efficient tail protection: buy <span className="font-mono font-bold text-foreground">{Math.max(1, Math.round(calc.recommendedNotional / 5000))} × {calc.a.hedgeSymbol.replace("-PERP","")} 7d Put</span> at ~10% OTM on Deribit.
          Premium cost ≈ <span className="font-mono font-bold text-foreground">${fmt(calc.recommendedNotional * 0.015)}</span> (1.5% of hedge notional). Capped downside, unlimited upside.
        </p>
      </div>

      <Alert variant="destructive" className="mt-4 border-[var(--neon-orange)]/60 bg-[var(--neon-orange)]/10 text-foreground">
        <AlertTriangle className="h-4 w-4 text-[var(--neon-orange)]" />
        <AlertTitle className="text-[var(--neon-orange)] font-bold uppercase tracking-wide text-xs">Risk Disclaimer</AlertTitle>
        <AlertDescription className="text-[11px] leading-relaxed text-muted-foreground">
          This is an algorithmic estimate based on simplified delta-neutral assumptions (constant β, normal-distribution VaR at 95% confidence, daily vol ≈ 4% × β). Real markets exhibit gap risk, funding cost, basis drift, liquidation cascades, and correlation breakdown during stress. Futures and options can result in <span className="font-bold text-[var(--neon-orange)]">total loss of margin or more</span>. Not financial advice — sizes are illustrative. Always verify on a paper account, monitor funding rates, and consult a licensed advisor before deploying capital.
        </AlertDescription>
      </Alert>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background/60 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "bull" | "bear" | "warn" }) {
  const colors = {
    bull: "text-bull border-[color:var(--bull)]/40",
    bear: "text-bear border-[color:var(--bear)]/40",
    warn: "text-[var(--neon-orange)] border-[var(--neon-orange)]/40",
  };
  return (
    <div className={`rounded-lg border bg-background/40 p-2.5 ${colors[tone]}`}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-base font-extrabold">{value}</div>
    </div>
  );
}

function fmt(n: number) {
  if (!isFinite(n)) return "0";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + "k";
  return n.toFixed(2);
}
