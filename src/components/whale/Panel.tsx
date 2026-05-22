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
    blue: "bg-[var(--neon-blue)]",
    purple: "bg-[var(--neon-purple)]",
    green: "bg-[var(--bull)]",
    orange: "bg-[var(--neon-orange)]",
  };
  return (
    <section className={cn(
      "relative overflow-hidden rounded-xl border border-border bg-card/70 backdrop-blur-sm transition-colors hover:border-border-bright",
      className,
    )}>
      {accent && <div className={cn("absolute left-0 top-0 h-full w-[3px]", accentBar[accent])} />}
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.12em]">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Chip({
  children, tone = "default",
}: { children: ReactNode; tone?: "default" | "bull" | "bear" | "warn" | "purple" | "blue" }) {
  const tones = {
    default: "bg-secondary text-foreground border-border",
    bull: "bg-bull/10 text-bull border-bull/40",
    bear: "bg-bear/10 text-bear border-bear/40",
    warn: "bg-[var(--neon-orange)]/10 text-[var(--neon-orange)] border-[var(--neon-orange)]/40",
    purple: "bg-[var(--neon-purple)]/10 text-[var(--neon-purple)] border-[var(--neon-purple)]/40",
    blue: "bg-[var(--neon-blue)]/10 text-[var(--neon-blue)] border-[var(--neon-blue)]/40",
  };
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
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
      <div className={cn("h-full bg-gradient-to-r", colors[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
