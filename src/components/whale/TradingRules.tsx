import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Send, ShieldAlert } from "lucide-react";

interface Rule {
  num: string;
  title: string;
  emoji: string;
  body: string;
}

const RULES: Rule[] = [
  {
    num: "1️⃣", emoji: "❗", title: "Plan",
    body: "প্রতিটা trade-এর আগে clear plan লিখে রাখো — entry, target, stop loss, position size আগে থেকেই ঠিক করা। Plan ছাড়া trade = gambling. Market খোলার আগে এবং প্রতিটা signal-এ ৩টা প্রশ্ন করো: Why am I entering? Where do I exit? What if I'm wrong?",
  },
  {
    num: "2️⃣", emoji: "💸", title: "Investment",
    body: "শুধু সেই টাকা invest করো যা হারালেও জীবন থেমে যাবে না। Loan, credit card, EMI money কখনোই না। Total capital-এর সর্বোচ্চ ১০-২০% crypto-তে রাখো; বাকিটা stablecoin/cash reserve।",
  },
  {
    num: "3️⃣", emoji: "📚", title: "Trade Strategies",
    body: "একটা strategy পুরোপুরি master করার আগে দ্বিতীয়টায় যেও না। Scalping, swing, trend-following — যেটাই হোক, কমপক্ষে ৫০টা trade-এ backtest করে statistics বের করো। Win rate, average R:R, max drawdown — এই তিনটা না জানলে strategy নেই।",
  },
  {
    num: "4️⃣", emoji: "🔍", title: "Leverage",
    body: "Leverage হচ্ছে দ্বি-ধারী তলোয়ার। Beginner হলে spot-এ থাকো, futures-এ গেলেও 2x-3x-এর বেশি না। 10x+ leverage মানে ছোট move-এও liquidate। যত বেশি leverage, তত tight stop loss দরকার।",
  },
  {
    num: "5️⃣", emoji: "💵", title: "Take Profits",
    body: "Greed-এর জন্য পুরোটা hold করো না। Partial profit booking strategy: Target 1-এ 30%, Target 2-এ 40%, Target 3+ পর্যন্ত বাকিটা trailing stop দিয়ে carry করো। Profit booked না হলে profit না।",
  },
  {
    num: "6️⃣", emoji: "🚫", title: "Stop Loss",
    body: "Every single trade-এ stop loss MUST। Mental stop loss না — exchange-এ actual order বসাও। Stop loss সরানো যাবে না trade চালু থাকা অবস্থায়। একটাই কাজ — wrong হলে দ্রুত বের হয়ে আসা।",
  },
  {
    num: "7️⃣", emoji: "📚", title: "Risk Management",
    body: "প্রতি trade-এ total capital-এর সর্বোচ্চ 1-2% risk। অর্থাৎ stop loss hit হলে portfolio-র 2%-এর বেশি হারানো যাবে না। R:R minimum 1:2 — 1 টাকা risk-এ 2 টাকা reward না থাকলে trade নাও না।",
  },
  {
    num: "8️⃣", emoji: "🎯", title: "How Many Trades are Safe at a Time?",
    body: "একসাথে সর্বোচ্চ 3-5টা open position। বেশি হলে monitor করা যাবে না, emotional decisions আসবে। Correlated assets (BTC+ETH+SOL সবই long) মানে কার্যত একটাই trade — concentrated risk।",
  },
  {
    num: "9️⃣", emoji: "❓", title: "Panic Situation",
    body: "Market crash বা flash dump-এ panic sell করো না। Plan-এ যা লেখা আছে সেটাই follow করো। Stop loss hit হলে হলো — নতুন setup-এর জন্য অপেক্ষা করো। Revenge trading সবচেয়ে বড় account killer।",
  },
];

export function TradingRules() {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 sm:p-6 backdrop-blur-sm">
      <header className="mb-5 space-y-2 text-center">
        <h2 className="font-bold tracking-tight text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>
          <span className="text-2xl">🐂</span> Bulls make money, <span className="text-2xl">🐻</span> Bears make money, <span className="text-2xl">🐷🐖</span> Pigs get slaughtered
        </h2>
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4 text-[var(--neon-orange)]" />
          Must follow rules if you want to earn money from crypto market
          <ShieldAlert className="h-4 w-4 text-[var(--neon-orange)]" />
        </p>
      </header>

      <Accordion type="single" collapsible className="space-y-2">
        {RULES.map((r, i) => (
          <AccordionItem
            key={i}
            value={`rule-${i}`}
            className="rounded-lg border border-border bg-secondary/30 px-4 data-[state=open]:border-[var(--neon-purple)]/40 data-[state=open]:bg-secondary/50"
          >
            <AccordionTrigger className="text-left hover:no-underline">
              <span className="flex items-center gap-2 text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>
                <span className="text-lg">{r.num}</span>
                {r.title}
                <span>{r.emoji}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
              {r.body}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <a
        href="https://t.me/"
        target="_blank"
        rel="noreferrer noopener"
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-[var(--neon-blue)] py-4 text-base font-semibold text-background shadow-[0_0_25px_rgba(56,189,248,0.35)] transition-all hover:scale-[1.01] hover:shadow-[0_0_35px_rgba(56,189,248,0.5)]"
      >
        Join Telegram
        <Send className="h-5 w-5" />
      </a>
    </div>
  );
}
