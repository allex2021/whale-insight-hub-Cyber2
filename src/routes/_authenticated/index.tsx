import { createFileRoute } from "@tanstack/react-router";
import { HeaderBar } from "@/components/whale/HeaderBar";
import { WhaleTracker } from "@/components/whale/WhaleTracker";
import { LiquidationHeatmap } from "@/components/whale/LiquidationHeatmap";
import { FundingRateMonitor } from "@/components/whale/FundingRateMonitor";
import { OptionsFlow } from "@/components/whale/OptionsFlow";
import { CrossExchangeSignal } from "@/components/whale/CrossExchangeSignal";
import { NewsAI } from "@/components/whale/NewsAI";
import { SmartMoneyBoard } from "@/components/whale/SmartMoneyBoard";
import { WhaleDivergence } from "@/components/whale/WhaleDivergence";
import { InterMarketCorrelation } from "@/components/whale/InterMarketCorrelation";
import { AITradingSignals } from "@/components/whale/AITradingSignals";
import { AlertCenter } from "@/components/whale/AlertCenter";

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
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Sora:wght@400;600;700&display=swap",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="min-h-screen text-foreground">
      <HeaderBar />
      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 lg:px-8">
        <WhaleTracker />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LiquidationHeatmap />
          <FundingRateMonitor />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <OptionsFlow />
          <CrossExchangeSignal />
        </div>

        <NewsAI />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SmartMoneyBoard />
          <WhaleDivergence />
        </div>

        <InterMarketCorrelation />

        <AITradingSignals />

        <AlertCenter />

        <footer className="border-t border-border pt-6 pb-10 text-center text-xs text-muted-foreground">
          🐋 <span className="font-bold text-foreground">Whale Intelligence Pro</span> · Powered by <span className="text-[var(--neon-purple)] font-semibold">Allex@Cyber2</span>
          <div className="mt-1 opacity-60">Live: Binance WebSocket · CoinGecko · Alternative.me · AI via Lovable Gateway (Gemini)</div>
        </footer>
      </main>
    </div>
  );
}
