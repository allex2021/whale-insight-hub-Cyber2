import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  format?: (n: number) => string;
  flash?: boolean;
  className?: string;
  style?: CSSProperties;
  prefix?: string;
  suffix?: string;
}

/**
 * Smoothly tweens between number values over `duration` ms.
 * Optionally flashes green (up) / red (down) when the target changes.
 */
export function AnimatedNumber({
  value,
  duration = 400,
  decimals,
  format,
  flash = true,
  className,
  style,
  prefix = "",
  suffix = "",
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const [flashDir, setFlashDir] = useState<"up" | "down" | null>(null);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevTargetRef = useRef(value);

  useEffect(() => {
    const target = value;
    const prev = prevTargetRef.current;
    if (target === prev) return;

    if (flash && Number.isFinite(prev) && Number.isFinite(target) && prev !== target) {
      setFlashDir(target > prev ? "up" : "down");
      const id = window.setTimeout(() => setFlashDir(null), 500);
      // overwrite below in cleanup if needed
      var flashTimeout: number | null = id;
    }

    fromRef.current = display;
    startRef.current = null;
    prevTargetRef.current = target;

    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (target - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(target);
        rafRef.current = null;
      }
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // @ts-expect-error flashTimeout may exist in this closure
      if (typeof flashTimeout === "number") clearTimeout(flashTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, flash]);

  const text = format
    ? format(display)
    : decimals !== undefined
      ? display.toFixed(decimals)
      : String(Math.round(display));

  return (
    <span
      className={cn(
        "tabular-nums transition-colors duration-200",
        flashDir === "up" && "text-bull",
        flashDir === "down" && "text-bear",
        className,
      )}
      style={style}
    >
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
