import { cn } from "@/lib/utils";

type SkeletonVariant = "table" | "cards" | "gauge" | "hero" | "ticker" | "default" | "list";

interface SkeletonLoaderProps {
  variant?: SkeletonVariant;
  rows?: number;
  className?: string;
  minHeight?: number;
}

/**
 * Dark shimmer skeleton loader.
 * Replaces text-based loading placeholders with smooth animated bars.
 */
export function SkeletonLoader({
  variant = "default",
  rows = 5,
  className,
  minHeight,
}: SkeletonLoaderProps) {
  const bar = (width: string, height = "h-3", extra?: string) => (
    <div
      className={cn("skeleton-shimmer rounded-md", height, extra)}
      style={{ width }}
    />
  );

  if (variant === "ticker") {
    return (
      <div className={cn("flex items-center gap-3 rounded-lg border border-border/40 px-4 py-2.5", className)}>
        <div className="skeleton-shimmer h-4 w-4 shrink-0 rounded-full" />
        <div className="skeleton-shimmer h-3.5 flex-1 rounded-md" />
        <div className="skeleton-shimmer h-3 w-10 shrink-0 rounded-md" />
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className={cn("space-y-2", className)} style={{ minHeight }}>
        {/* Header row */}
        <div className="flex gap-2 pb-2">
          {bar("20%", "h-2.5")}
          {bar("15%", "h-2.5")}
          {bar("15%", "h-2.5")}
          {bar("15%", "h-2.5")}
          {bar("15%", "h-2.5")}
          {bar("15%", "h-2.5")}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-2 py-1.5">
            {bar("20%", "h-3")}
            {bar("15%", "h-3")}
            {bar("15%", "h-3")}
            {bar("15%", "h-3")}
            {bar("15%", "h-3")}
            {bar("15%", "h-3")}
          </div>
        ))}
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className={cn("space-y-2", className)} style={{ minHeight }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="skeleton-shimmer h-2 w-12 shrink-0 rounded-md" />
            <div className="skeleton-shimmer h-5 w-5 shrink-0 rounded-sm" />
            <div className="skeleton-shimmer h-3 flex-1 rounded-md" />
            <div className="skeleton-shimmer h-3 w-16 shrink-0 rounded-md" />
            <div className="skeleton-shimmer h-3 w-20 shrink-0 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4", className)} style={{ minHeight }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border/40 bg-gradient-to-br from-card/50 to-secondary/30 p-3 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="skeleton-shimmer h-3 w-16 rounded-md" />
              <div className="skeleton-shimmer h-5 w-16 rounded-md" />
            </div>
            <div className="flex items-center justify-between">
              <div className="skeleton-shimmer h-3 w-10 rounded-md" />
              <div className="skeleton-shimmer h-3 w-8 rounded-md" />
              <div className="skeleton-shimmer h-3 w-10 rounded-md" />
            </div>
            <div className="skeleton-shimmer h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "gauge") {
    return (
      <div className={cn("flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6", className)} style={{ minHeight }}>
        {/* Gauge placeholder */}
        <div className="relative shrink-0">
          <div className="skeleton-shimmer h-[180px] w-[180px] rounded-full" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <div className="skeleton-shimmer h-8 w-16 rounded-md" />
            <div className="skeleton-shimmer h-3 w-8 rounded-md" />
          </div>
        </div>
        {/* Right column */}
        <div className="flex-1 space-y-3 w-full">
          <div className="skeleton-shimmer h-4 w-24 rounded-md" />
          <div className="skeleton-shimmer h-8 w-40 rounded-md" />
          <div className="skeleton-shimmer h-3 w-32 rounded-md" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-border/30 bg-secondary/20 px-2 py-2">
              <div className="flex-1 space-y-1">
                <div className="skeleton-shimmer h-3 w-24 rounded-md" />
                <div className="skeleton-shimmer h-2.5 w-32 rounded-md" />
              </div>
              <div className="skeleton-shimmer h-5 w-10 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "hero") {
    return (
      <div className={cn("space-y-4", className)} style={{ minHeight }}>
        {/* Hero row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr_auto]">
          {/* Direction badge */}
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-border/40 px-6 py-4 space-y-3">
            <div className="skeleton-shimmer h-7 w-20 rounded-md" />
            <div className="skeleton-shimmer h-10 w-16 rounded-md" />
            <div className="skeleton-shimmer h-2.5 w-20 rounded-md" />
          </div>
          {/* Targets card */}
          <div className="rounded-lg border border-border/40 bg-gradient-to-br from-card/50 to-secondary/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="skeleton-shimmer h-3 w-24 rounded-md" />
              <div className="skeleton-shimmer h-5 w-16 rounded-md" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="skeleton-shimmer h-16 w-full rounded-md" />
              <div className="skeleton-shimmer h-16 w-full rounded-md" />
            </div>
            <div className="skeleton-shimmer h-2.5 w-full rounded-md" />
          </div>
          {/* AI button placeholder */}
          <div className="flex flex-col items-stretch justify-center gap-2">
            <div className="skeleton-shimmer h-10 w-full rounded-lg" />
            <div className="skeleton-shimmer h-5 w-20 self-center rounded-md" />
          </div>
        </div>
        {/* Chips row */}
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-5 w-16 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  // default: multi-line bars
  return (
    <div className={cn("space-y-2 py-6", className)} style={{ minHeight }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton-shimmer h-2.5 w-8 shrink-0 rounded-md" />
          <div
            className="skeleton-shimmer h-3 rounded-md"
            style={{ width: `${60 + ((i * 37) % 35)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
