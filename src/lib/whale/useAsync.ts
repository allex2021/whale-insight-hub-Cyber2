import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  retry: () => void;
}

export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
  opts: { refreshMs?: number } = {},
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const retry = useCallback(() => setTick((t) => t + 1), []);

  const lastFetchRef = useRef(0);

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    lastFetchRef.current = Date.now();
    fnRef.current(ctrl.signal)
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e) => {
        if (cancelled || ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    let interval: ReturnType<typeof setInterval> | undefined;
    if (opts.refreshMs) {
      interval = setInterval(() => setTick((t) => t + 1), opts.refreshMs);
    }
    // Refresh on visibility/focus — but only if data is older than half the refresh window
    // (prevents thrashing when user tabs in/out rapidly).
    const minGap = Math.max(5_000, Math.floor((opts.refreshMs ?? 60_000) / 2));
    const maybeRefresh = () => {
      if (Date.now() - lastFetchRef.current >= minGap) setTick((t) => t + 1);
    };
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        maybeRefresh();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", maybeRefresh);
    }
    return () => {
      cancelled = true;
      ctrl.abort();
      if (interval) clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", maybeRefresh);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, loading, retry };
}
