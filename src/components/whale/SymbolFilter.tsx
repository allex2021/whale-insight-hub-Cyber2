import { useSymbolFilter } from "@/hooks/useSymbolFilter";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

export function SymbolFilter() {
  const { selected, toggle, selectAll, all } = useSymbolFilter();
  const allOn = selected.length === all.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card/60 px-3 py-2 backdrop-blur-sm">
      <Star className="h-3.5 w-3.5 text-[var(--neon-yellow)]" />
      <span className="mr-1 text-[10px] uppercase tracking-widest text-muted-foreground">Watching</span>
      {all.map((s) => {
        const on = selected.includes(s);
        return (
          <button
            key={s}
            onClick={() => toggle(s)}
            className={cn(
              "rounded-md border px-2 py-1 font-mono text-[10px] font-bold transition-colors",
              on
                ? "border-[var(--neon-blue)] bg-[var(--neon-blue)]/15 text-[var(--neon-blue)]"
                : "border-border bg-secondary text-muted-foreground hover:border-border-bright"
            )}
          >
            {s}
          </button>
        );
      })}
      <button
        onClick={selectAll}
        disabled={allOn}
        className="ml-auto rounded-md border border-border bg-secondary px-2 py-1 text-[10px] uppercase text-muted-foreground hover:border-border-bright disabled:opacity-40"
      >
        All
      </button>
    </div>
  );
}
