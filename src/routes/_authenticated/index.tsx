import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { HeaderBar } from "@/components/whale/HeaderBar";
import { MacroBar } from "@/components/whale/MacroBar";
import { SymbolFilter } from "@/components/whale/SymbolFilter";
import { WhaleTracker } from "@/components/whale/WhaleTracker";
import { WhaleActivityFeed } from "@/components/whale/WhaleActivityFeed";
import { LongShortRatio } from "@/components/whale/LongShortRatio";
import { LazyMount } from "@/components/whale/LazyMount";
import { PriorityAlertTicker } from "@/components/whale/PriorityAlertTicker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// Below-the-fold panels: code-split + mount on scroll
const OrderBookWalls = lazy(() => import("@/components/whale/OrderBookWalls").then(m => ({ default: m.OrderBookWalls })));
const OnChainPanel = lazy(() => import("@/components/whale/OnChainPanel").then(m => ({ default: m.OnChainPanel })));
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
const WhaleDivergence = lazy(() => import("@/components/whale/WhaleDivergence").then(m => ({ default: m.WhaleDivergence })));
const InterMarketCorrelation = lazy(() => import("@/components/whale/InterMarketCorrelation").then(m => ({ default: m.InterMarketCorrelation })));
const AITradingSignals = lazy(() => import("@/components/whale/AITradingSignals").then(m => ({ default: m.AITradingSignals })));
const AlertCenter = lazy(() => import("@/components/whale/AlertCenter").then(m => ({ default: m.AlertCenter })));
const DeribitOptionsPanel = lazy(() => import("@/components/whale/DeribitOptionsPanel").then(m => ({ default: m.DeribitOptionsPanel })));
const CustomAlertBuilder = lazy(() => import("@/components/whale/CustomAlertBuilder").then(m => ({ default: m.CustomAlertBuilder })));

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Whale Intelligence Pro · by Allex@Cyber2" },
      { name: "description", content: "Professional crypto trading intelligence terminal — real-time whale tracking, liquidation heatmaps, AI signals & multi-exchange convergence." },
      { property: "og:title", content: "Whale Intelligence Pro" },
      { property: "og:description", content: "Real-time whale tracking, AI signals & multi-exchange intelligence." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://stream.binance.com" },
      { rel: "preconnect", href: "https://fapi.binance.com" },
      { rel: "preconnect", href: "https://api.coingecko.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Sora:wght@400;600;700&display=swap",
      },
    ],
  }),
  component: Dashboard,
});

const TABS = [
  { v: "overview", label: "Overview" },
  { v: "whales", label: "Whale Tracker" },
  { v: "liquidations", label: "Liquidations" },
  { v: "options", label: "Options Flow" },
  { v: "ai", label: "AI Signals" },
  { v: "macro", label: "Inter-Market" },
  { v: "alerts", label: "Alerts" },
] as const;

function Dashboard() {
  return (
    <div className="min-h-screen text-foreground">
      <HeaderBar />
      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 lg:px-8">
        <PriorityAlertTicker />
        <MacroBar />
        <SymbolFilter />

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-border bg-card/50 p-1 backdrop-blur-sm">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.v}
                value={t.v}
                className="rounded-md px-3 py-1.5 text-xs sm:text-sm font-semibold tracking-wide uppercase data-[state=active]:bg-gradient-to-br data-[state=active]:from-[var(--neon-purple)]/30 data-[state=active]:to-[var(--neon-blue)]/20 data-[state=active]:text-foreground data-[state=active]:shadow-[0_0_15px_rgba(168,85,247,0.25)]"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <WhaleTracker />
            <LongShortRatio />
            <LazyMount minHeight={400}><OnChainPanel /></LazyMount>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LazyMount minHeight={320}><LiquidationFeed /></LazyMount>
              <LazyMount minHeight={320}><StablecoinSupply /></LazyMount>
            </div>
          </TabsContent>

          <TabsContent value="whales" className="space-y-4 mt-4">
            <WhaleTracker />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LazyMount minHeight={360}><SmartMoneyBoard /></LazyMount>
              <LazyMount minHeight={360}><WhaleDivergence /></LazyMount>
            </div>
            <LazyMount minHeight={280}><CVDPanel /></LazyMount>
            <LazyMount minHeight={320}><OrderBookWalls /></LazyMount>
          </TabsContent>

          <TabsContent value="liquidations" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LazyMount minHeight={360}><LiquidationHeatmap /></LazyMount>
              <LazyMount minHeight={360}><FundingRateMonitor /></LazyMount>
            </div>
            <LazyMount minHeight={320}><LiquidationFeed /></LazyMount>
            <LazyMount minHeight={320}><OpenInterestTracker /></LazyMount>
          </TabsContent>

          <TabsContent value="options" className="space-y-4 mt-4">
            <LazyMount minHeight={420}><DeribitOptionsPanel /></LazyMount>
            <LazyMount minHeight={360}><OptionsFlow /></LazyMount>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4 mt-4">
            <LazyMount minHeight={400}><AITradingSignals /></LazyMount>
            <LazyMount minHeight={400}><NewsAI /></LazyMount>
            <LazyMount minHeight={360}><CrossExchangeSignal /></LazyMount>
          </TabsContent>

          <TabsContent value="macro" className="space-y-4 mt-4">
            <LazyMount minHeight={320}><InterMarketCorrelation /></LazyMount>
            <LazyMount minHeight={280}><SupportResistance /></LazyMount>
            <LazyMount minHeight={320}><StablecoinSupply /></LazyMount>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4 mt-4">
            <LazyMount minHeight={360}><CustomAlertBuilder /></LazyMount>
            <LazyMount minHeight={320}><AlertCenter /></LazyMount>
          </TabsContent>
        </Tabs>

        <footer className="border-t border-border pt-6 pb-10 text-center text-xs text-muted-foreground">
          🐋 <span className="font-bold text-foreground">Whale Intelligence Pro</span> · Powered by <span className="text-[var(--neon-purple)] font-semibold">Allex@Cyber2</span>
          <div className="mt-1 opacity-60">Live: Binance WebSocket · CoinGecko · Alternative.me · Deribit · DefiLlama · AI via Lovable Gateway (Gemini)</div>
        </footer>
      </main>
    </div>
  );
}
