import { createFileRoute } from "@tanstack/react-router";
import { lazy, useState } from "react";
import { Activity, TrendingUp, Flame, Brain, Bell, Shield, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeaderBar } from "@/components/whale/HeaderBar";
import { MacroBar } from "@/components/whale/MacroBar";
import { SymbolFilter } from "@/components/whale/SymbolFilter";
import { WhaleTracker } from "@/components/whale/WhaleTracker";
import { WhaleActivityFeed } from "@/components/whale/WhaleActivityFeed";
import { LongShortRatio } from "@/components/whale/LongShortRatio";
import { LazyMount } from "@/components/whale/LazyMount";
import { PriorityAlertTicker } from "@/components/whale/PriorityAlertTicker";
import { ConfluenceScore } from "@/components/whale/ConfluenceScore";
import { MasterSignal } from "@/components/whale/MasterSignal";
import { SignalErrorBoundary } from "@/components/whale/SignalErrorBoundary";
import { TradingRules } from "@/components/whale/TradingRules";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// Below-the-fold panels: code-split + mount on scroll
const OrderBookWalls = lazy(() => import("@/components/whale/OrderBookWalls").then(m => ({ default: m.OrderBookWalls })));
const OnChainPanel = lazy(() => import("@/components/whale/OnChainPanel").then(m => ({ default: m.OnChainPanel })));
const MultiTimeframeTA = lazy(() => import("@/components/whale/MultiTimeframeTA").then(m => ({ default: m.MultiTimeframeTA })));
const CVDPanel = lazy(() => import("@/components/whale/CVDPanel").then(m => ({ default: m.CVDPanel })));
const OpenInterestTracker = lazy(() => import("@/components/whale/OpenInterestTracker").then(m => ({ default: m.OpenInterestTracker })));
const SupportResistance = lazy(() => import("@/components/whale/SupportResistance").then(m => ({ default: m.SupportResistance })));
const LiquidationFeed = lazy(() => import("@/components/whale/LiquidationFeed").then(m => ({ default: m.LiquidationFeed })));
const StablecoinSupply = lazy(() => import("@/components/whale/StablecoinSupply").then(m => ({ default: m.StablecoinSupply })));
const LiquidationHeatmap = lazy(() => import("@/components/whale/LiquidationHeatmap").then(m => ({ default: m.LiquidationHeatmap })));
const FundingRateMonitor = lazy(() => import("@/components/whale/FundingRateMonitor").then(m => ({ default: m.FundingRateMonitor })));
const OptionsFlow = lazy(() => import("@/components/whale/OptionsFlow").then(m => ({ default: m.OptionsFlow })));
const CrossExchangeSignal = lazy(() => import("@/components/whale/CrossExchangeSignal").then(m => ({ default: m.CrossExchangeSignal })));
const NewsAI = lazy(() => import("@/components/whale/NewsAI").then(m => ({ default: m.NewsAI })));
const SmartMoneyBoard = lazy(() => import("@/components/whale/SmartMoneyBoard").then(m => ({ default: m.SmartMoneyBoard })));
const SmartMoneyTracker = lazy(() => import("@/components/whale/SmartMoneyTracker").then(m => ({ default: m.SmartMoneyTracker })));
const WhaleDivergence = lazy(() => import("@/components/whale/WhaleDivergence").then(m => ({ default: m.WhaleDivergence })));
const InterMarketCorrelation = lazy(() => import("@/components/whale/InterMarketCorrelation").then(m => ({ default: m.InterMarketCorrelation })));
const AITradingSignals = lazy(() => import("@/components/whale/AITradingSignals").then(m => ({ default: m.AITradingSignals })));
const AlertCenter = lazy(() => import("@/components/whale/AlertCenter").then(m => ({ default: m.AlertCenter })));
const DeribitOptionsPanel = lazy(() => import("@/components/whale/DeribitOptionsPanel").then(m => ({ default: m.DeribitOptionsPanel })));
const CustomAlertBuilder = lazy(() => import("@/components/whale/CustomAlertBuilder").then(m => ({ default: m.CustomAlertBuilder })));
const StrategySimulator = lazy(() => import("@/components/whale/StrategySimulator").then(m => ({ default: m.StrategySimulator })));
const AIAssistant = lazy(() => import("@/components/whale/AIAssistant").then(m => ({ default: m.AIAssistant })));
const ExecutionEngine = lazy(() => import("@/components/whale/ExecutionEngine").then(m => ({ default: m.ExecutionEngine })));
const InsiderVCTracker = lazy(() => import("@/components/whale/InsiderVCTracker").then(m => ({ default: m.InsiderVCTracker })));
const LiquidityWalls = lazy(() => import("@/components/whale/LiquidityWalls").then(m => ({ default: m.LiquidityWalls })));
const OnChainWhaleBotFeed = lazy(() => import("@/components/whale/OnChainWhaleBotFeed").then(m => ({ default: m.OnChainWhaleBotFeed })));
const HTFTrendMatrix = lazy(() => import("@/components/whale/HTFTrendMatrix").then(m => ({ default: m.HTFTrendMatrix })));
const VolumeProfilePOC = lazy(() => import("@/components/whale/VolumeProfilePOC").then(m => ({ default: m.VolumeProfilePOC })));
const RangeBreakoutScanner = lazy(() => import("@/components/whale/RangeBreakoutScanner").then(m => ({ default: m.RangeBreakoutScanner })));
const OIFundingDivergence = lazy(() => import("@/components/whale/OIFundingDivergence").then(m => ({ default: m.OIFundingDivergence })));
const WhaleShieldHedging = lazy(() => import("@/components/whale/WhaleShieldHedging").then(m => ({ default: m.WhaleShieldHedging })));
const TomHougaardDashboard = lazy(() => import("@/components/whale/TomHougaardSuite").then(m => ({ default: m.TomHougaardDashboard })));

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Whale Intelligence Pro · by Allex@Cyber2" },
      { name: "description", content: "Professional crypto trading intelligence terminal — real-time whale tracking, liquidation heatmaps, AI signals & multi-exchange convergence." },
      { property: "og:title", content: "Whale Intelligence Pro" },
      { property: "og:description", content: "Real-time whale tracking, AI signals & multi-exchange intelligence." },
    ],
    links: [
      { rel: "preconnect", href: "https://stream.binance.com" },
      { rel: "preconnect", href: "https://fapi.binance.com" },
      { rel: "preconnect", href: "https://api.coingecko.com" },
    ],
  }),
  component: Dashboard,
});

const TABS = [
  { v: "live", label: "Live", short: "Live", Icon: Activity },
  { v: "pro", label: "Pro Chart", short: "Chart", Icon: LineChart },
  { v: "derivs", label: "Derivatives", short: "Derivs", Icon: TrendingUp },
  { v: "heatmap", label: "Heatmap", short: "Heatmap", Icon: Flame },
  { v: "shield", label: "Shield", short: "Shield", Icon: Shield },
  { v: "ai", label: "AI", short: "AI", Icon: Brain },
  { v: "macro", label: "Macro & Alerts", short: "Alerts", Icon: Bell },
] as const;

function Dashboard() {
  const [tab, setTab] = useState<typeof TABS[number]["v"]>("live");
  return (
    <div className="min-h-screen text-foreground">
      <HeaderBar />
      <main className="mx-auto max-w-[1600px] space-y-4 px-3 sm:px-4 py-4 sm:py-6 lg:px-8 pb-24 md:pb-6">
        <PriorityAlertTicker />
        <div className="rounded-xl border-2 border-[var(--neon-purple)]/60 bg-gradient-to-br from-[var(--neon-purple)]/10 to-[var(--neon-blue)]/5 p-1 shadow-[0_0_40px_rgba(168,85,247,0.3)]">
          <SignalErrorBoundary label="Master Signal">
            <MasterSignal />
          </SignalErrorBoundary>
        </div>
        <div className="rounded-xl border border-[var(--neon-purple)]/30 bg-card/30 p-1 shadow-[0_0_20px_rgba(168,85,247,0.15)]">
          <SignalErrorBoundary label="Confluence Score">
            <ConfluenceScore />
          </SignalErrorBoundary>
        </div>
        <MacroBar />
        <SymbolFilter />

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof TABS[number]["v"]) } className="space-y-4">
          <TabsList className="hidden md:inline-flex h-9 w-auto gap-1 rounded-lg border border-border bg-card/50 p-1 backdrop-blur-sm">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.v}
                value={t.v}
                className="h-7 rounded-md px-3 text-[11px] sm:text-xs font-semibold tracking-wide uppercase data-[state=active]:bg-gradient-to-br data-[state=active]:from-[var(--neon-purple)]/30 data-[state=active]:to-[var(--neon-blue)]/20 data-[state=active]:text-foreground data-[state=active]:shadow-[0_0_15px_rgba(168,85,247,0.25)]"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="live" className="space-y-4 mt-4">
            <div className="-mx-3 sm:mx-0 overflow-x-auto md:overflow-visible"><div className="min-w-[640px] md:min-w-0 px-3 sm:px-0"><WhaleActivityFeed /></div></div>
            <LazyMount minHeight={520}><HTFTrendMatrix /></LazyMount>
            <LazyMount minHeight={620}><RangeBreakoutScanner /></LazyMount>
            <LazyMount minHeight={620}><InsiderVCTracker /></LazyMount>
            <LazyMount minHeight={560}><OnChainWhaleBotFeed /></LazyMount>
            <WhaleTracker />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LazyMount minHeight={360}><SmartMoneyBoard /></LazyMount>
              <LazyMount minHeight={360}><WhaleDivergence /></LazyMount>
            </div>
            <LazyMount minHeight={480}><SmartMoneyTracker /></LazyMount>
            <div className="rounded-xl border-2 border-[var(--neon-purple)]/30 bg-card/30 p-1 shadow-[0_0_20px_rgba(168,85,247,0.15)]">
              <LazyMount minHeight={420}><AlertCenter /></LazyMount>
            </div>
            <LongShortRatio />
            <LazyMount minHeight={280}><CVDPanel /></LazyMount>
            <LazyMount minHeight={320}><OrderBookWalls /></LazyMount>
            <LazyMount minHeight={400}><OnChainPanel /></LazyMount>
            <LazyMount minHeight={400}><MultiTimeframeTA /></LazyMount>
          </TabsContent>

          <TabsContent value="pro" className="space-y-4 mt-4">
            <LazyMount minHeight={760}><TomHougaardDashboard /></LazyMount>
          </TabsContent>

          <TabsContent value="derivs" className="space-y-4 mt-4">
            <LazyMount minHeight={560}><OIFundingDivergence /></LazyMount>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LazyMount minHeight={360}><FundingRateMonitor /></LazyMount>
              <LazyMount minHeight={360}><OpenInterestTracker /></LazyMount>
            </div>
            <LazyMount minHeight={320}><LiquidationFeed /></LazyMount>
            <LazyMount minHeight={420}><DeribitOptionsPanel /></LazyMount>
            <LazyMount minHeight={360}><OptionsFlow /></LazyMount>
          </TabsContent>

          <TabsContent value="heatmap" className="space-y-4 mt-4">
            <div className="-mx-3 sm:mx-0 overflow-x-auto md:overflow-visible"><div className="min-w-[720px] md:min-w-0 px-3 sm:px-0"><LazyMount minHeight={520}><LiquidationHeatmap /></LazyMount></div></div>
            <LazyMount minHeight={720}><VolumeProfilePOC /></LazyMount>
            <LazyMount minHeight={720}><LiquidityWalls /></LazyMount>
          </TabsContent>

          <TabsContent value="shield" className="space-y-4 mt-4">
            <LazyMount minHeight={720}><WhaleShieldHedging /></LazyMount>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4 mt-4">

            <LazyMount minHeight={620}><AIAssistant /></LazyMount>
            <LazyMount minHeight={400}><AITradingSignals /></LazyMount>
            <LazyMount minHeight={520}><StrategySimulator /></LazyMount>
            <LazyMount minHeight={620}><ExecutionEngine /></LazyMount>
            <LazyMount minHeight={400}><NewsAI /></LazyMount>
            <LazyMount minHeight={360}><CrossExchangeSignal /></LazyMount>
          </TabsContent>

          <TabsContent value="macro" className="space-y-4 mt-4">
            <LazyMount minHeight={320}><InterMarketCorrelation /></LazyMount>
            <LazyMount minHeight={280}><SupportResistance /></LazyMount>
            <LazyMount minHeight={320}><StablecoinSupply /></LazyMount>
            <LazyMount minHeight={360}><CustomAlertBuilder /></LazyMount>
            <TradingRules />
          </TabsContent>

        </Tabs>

        <footer className="border-t border-border pt-6 pb-10 text-center text-xs text-muted-foreground">
          🐋 <span className="font-bold text-foreground">Whale Intelligence Pro</span> · Powered by <span className="text-[var(--neon-purple)] font-semibold">Allex@Cyber2</span>
          <div className="mt-1 opacity-60">Live: Binance WebSocket · CoinGecko · Alternative.me · Deribit · DefiLlama · AI via Lovable Gateway (Gemini)</div>
        </footer>
      </main>

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.4)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-7">
          {TABS.map((t) => {
            const active = tab === t.v;
            const Icon = t.Icon;
            return (
              <button
                key={t.v}
                type="button"
                onClick={() => setTab(t.v)}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold tracking-wide uppercase transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground/80",
                )}
              >
                <Icon
                  size={20}
                  className={cn(
                    "transition-all",
                    active && "text-[var(--neon-purple)] drop-shadow-[0_0_6px_rgba(168,85,247,0.6)]",
                  )}
                />
                <span>{t.short}</span>
                {active && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-b bg-[var(--neon-purple)] shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
