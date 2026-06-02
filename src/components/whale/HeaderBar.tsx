import { useEffect, useRef, useState } from "react";
import { Activity, LogOut, Settings as SettingsIcon, Shield } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchMarketGlobals } from "@/lib/whale/market.functions";
import { useBinancePriceStream } from "@/hooks/useBinanceWhaleStream";
import { fmtPct, fmtUSD } from "@/lib/whale/format";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AnimatedNumber } from "./AnimatedNumber";

function fgColor(v: number) {
  if (v >= 75) return "text-bull";
  if (v >= 55) return "text-[var(--neon-yellow)]";
  if (v >= 45) return "text-muted-foreground";
  if (v >= 25) return "text-[var(--neon-orange)]";
  return "text-bear";
}

export function HeaderBar() {
  const prices = useBinancePriceStream();
  const fetchG = useServerFn(fetchMarketGlobals);
  const { data: globals } = useQuery({
    queryKey: ["market-globals"],
    queryFn: () => fetchG(),
    refetchInterval: 60_000,
  });
  const [updated, setUpdated] = useState<string>("--:--:--");
  const [email, setEmail] = useState<string | null>(null);
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    setUpdated(new Date().toLocaleTimeString());
  }, [prices]);

  const symbols: Array<"BTC" | "ETH" | "SOL" | "LTC"> = ["BTC", "ETH", "SOL", "LTC"];

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <header className="header-scanline sticky top-0 z-40 border-b border-[color:var(--neon-blue)]/30 bg-[#00000F]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-3 py-3 lg:gap-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] shadow-[0_0_18px_var(--neon-blue)]">
            <span className="text-xl">🐋</span>
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold tracking-[0.1em] leading-none uppercase" style={{ textShadow: "0 0 10px var(--neon-blue)" }}>Whale Intelligence Pro</h1>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--neon-purple)] mt-1 font-mono">
              Powered by Allex@Cyber2
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2 lg:gap-4 font-mono text-xs sm:text-sm">
          {symbols.map((sym) => (
            <PriceChip key={sym} sym={sym} p={prices[sym]} />
          ))}
        </div>

        <div className="flex items-center gap-3 font-mono text-xs flex-wrap">
          {globals && (
            <>
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Fear & Greed</span>
                <span className={`font-bold text-sm ${fgColor(globals.fearGreed.value)}`}>
                  {globals.fearGreed.value} · {globals.fearGreed.label}
                </span>
              </div>
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Mkt Cap</span>
                <span className="font-semibold text-[var(--neon-blue)]">{fmtUSD(globals.marketCap)}</span>
              </div>
              <div className="hidden lg:flex flex-col items-end">
                <span className="text-[10px] uppercase text-muted-foreground tracking-wider">BTC.D</span>
                <span className="font-semibold text-[var(--neon-blue)]">{globals.btcDominance.toFixed(1)}%</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-2 rounded-md border border-bull/50 bg-bull/10 px-2 py-1 shadow-[0_0_10px_color-mix(in_oklab,var(--bull)_40%,transparent)]">
            <span className="h-2 w-2 rounded-full bg-bull pulse-dot" />
            <span className="text-bull text-[10px] font-bold uppercase tracking-wider">Live</span>
            <Activity className="h-3 w-3 text-bull" />
            <span className="text-muted-foreground hidden sm:inline">{updated}</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 rounded-md border border-[var(--neon-blue)]/40 bg-[var(--neon-blue)]/5 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--neon-blue)]">
            <span className="opacity-70">SYS:</span>
            <span className="font-bold blink-cursor">ONLINE</span>
          </div>
          {isAdmin && (
            <Link to="/admin" title="Admin Panel"
              className="rounded-md border border-[var(--neon-purple)]/50 bg-[var(--neon-purple)]/10 p-1.5 text-[var(--neon-purple)] hover:bg-[var(--neon-purple)]/25 hover:shadow-[0_0_12px_var(--neon-purple)]">
              <Shield className="h-3.5 w-3.5" />
            </Link>
          )}
          <Link to="/settings" title="Settings"
            className="rounded-md border border-[var(--neon-blue)]/30 bg-secondary p-1.5 hover:border-[var(--neon-blue)] hover:shadow-[0_0_10px_var(--neon-blue)]">
            <SettingsIcon className="h-3.5 w-3.5" />
          </Link>
          {email && (
            <button onClick={logout} title={`Sign out (${email})`}
              className="rounded-md border border-[var(--neon-blue)]/30 bg-secondary p-1.5 hover:border-bear hover:text-bear hover:shadow-[0_0_10px_var(--bear)]">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="header-bottom-line" />
    </header>
  );
}

type PriceData = { price: number; change24h: number } | undefined;

function PriceChip({ sym, p }: { sym: string; p: PriceData }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    if (!p) return;
    if (prevRef.current !== null && prevRef.current !== p.price) {
      const el = wrapRef.current;
      if (el && typeof el.animate === "function") {
        el.animate(
          [
            { transform: "translateY(8px)", opacity: 0.35, filter: "drop-shadow(0 0 6px var(--neon-blue))" },
            { transform: "translateY(0)", opacity: 1, filter: "drop-shadow(0 0 10px var(--neon-blue))", offset: 0.6 },
            { transform: "translateY(0)", opacity: 1, filter: "drop-shadow(0 0 0 transparent)" },
          ],
          { duration: 400, easing: "ease-out" },
        );
      }
    }
    prevRef.current = p.price;
  }, [p?.price]);

  return (
    <div
      ref={wrapRef}
      className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1.5"
    >
      <span className="text-[10px] sm:text-xs text-muted-foreground">{sym}</span>
      {p ? (
        <AnimatedNumber
          value={p.price}
          duration={400}
          format={(n) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
          className="font-semibold"
        />
      ) : (
        <span className="font-semibold">—</span>
      )}
      {p && (
        <span className={p.change24h >= 0 ? "text-bull text-[10px] sm:text-xs" : "text-bear text-[10px] sm:text-xs"}>
          {fmtPct(p.change24h)}
        </span>
      )}
    </div>
  );
}

