import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title, subtitle, action, children, className, accent,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  accent?: "blue" | "purple" | "green" | "orange";
}) {
  const accentBar = {
    blue: "bg-[var(--neon-blue)] shadow-[0_0_10px_var(--neon-blue)]",
    purple: "bg-[var(--neon-purple)] shadow-[0_0_10px_var(--neon-purple)]",
    green: "bg-[var(--bull)] shadow-[0_0_10px_var(--bull)]",
    orange: "bg-[var(--neon-orange)] shadow-[0_0_10px_var(--neon-orange)]",
  };
  return (
    <section className={cn(
      "relative overflow-hidden rounded-xl border border-[color:var(--border)] bg-card/60 backdrop-blur-sm",
      className,
    )}>
      {accent && <div className={cn("absolute left-0 top-0 h-full w-[3px] z-10", accentBar[accent])} />}
      <header className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3 relative">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-foreground" style={{ textShadow: "0 0 8px color-mix(in oklab, var(--neon-blue) 60%, transparent)" }}>{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{subtitle}</p>}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </header>
      <div className="p-4 relative">{children}</div>
    </section>
  );
}

export function Chip({
  children, tone = "default",
}: { children: ReactNode; tone?: "default" | "bull" | "bear" | "warn" | "purple" | "blue" }) {
  const tones = {
    default: "bg-secondary text-foreground border-[color:var(--border)]",
    bull: "bg-bull/10 text-bull border-[color:var(--bull)]/50 shadow-[0_0_8px_color-mix(in_oklab,var(--bull)_35%,transparent)]",
    bear: "bg-bear/10 text-bear border-[color:var(--bear)]/50 shadow-[0_0_8px_color-mix(in_oklab,var(--bear)_35%,transparent)]",
    warn: "bg-[var(--neon-orange)]/10 text-[var(--neon-orange)] border-[var(--neon-orange)]/50 shadow-[0_0_8px_color-mix(in_oklab,var(--neon-orange)_35%,transparent)]",
    purple: "bg-[var(--neon-purple)]/10 text-[var(--neon-purple)] border-[var(--neon-purple)]/50 shadow-[0_0_8px_color-mix(in_oklab,var(--neon-purple)_35%,transparent)]",
    blue: "bg-[var(--neon-blue)]/10 text-[var(--neon-blue)] border-[var(--neon-blue)]/50 shadow-[0_0_8px_color-mix(in_oklab,var(--neon-blue)_35%,transparent)]",
  };
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide font-mono",
      tones[tone],
    )}>
      {children}
    </span>
  );
}

export function Bar({ value, max = 100, tone = "blue" }: { value: number; max?: number; tone?: "blue" | "bull" | "bear" | "purple" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const colors = {
    blue: "from-[var(--neon-blue)] to-[var(--accent)]",
    bull: "from-bull to-[var(--neon-blue)]",
    bear: "from-bear to-[var(--neon-orange)]",
    purple: "from-[var(--neon-purple)] to-[var(--neon-blue)]",
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className={cn("h-full bg-gradient-to-r shadow-[0_0_6px_currentColor]", colors[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
