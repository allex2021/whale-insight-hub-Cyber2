import { useEffect, useRef, useState, type ReactNode, Suspense } from "react";

/**
 * Mounts children only when scrolled near viewport.
 * Saves WebSocket/API spin-up for off-screen panels → huge initial load win.
 */
export function LazyMount({
  children,
  minHeight = 200,
  rootMargin = "400px",
  fallback,
}: {
  children: ReactNode;
  minHeight?: number;
  rootMargin?: string;
  fallback?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={ref} style={{ minHeight: visible ? undefined : minHeight }}>
      {visible ? (
        <Suspense fallback={fallback ?? <PanelSkeleton height={minHeight} />}>
          {children}
        </Suspense>
      ) : (
        fallback ?? <PanelSkeleton height={minHeight} />
      )}
    </div>
  );
}

function PanelSkeleton({ height }: { height: number }) {
  return (
    <div
      className="animate-pulse rounded-lg border border-border/40 bg-card/30"
      style={{ height }}
    />
  );
}
