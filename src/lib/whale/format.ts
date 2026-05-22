export const fmtUSD = (n: number, max = 0) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K`
  : `$${n.toFixed(max)}`;

export const fmtPrice = (n: number) =>
  n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
  : n.toFixed(2);

export const fmtPct = (n: number, digits = 2) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

export const timeAgo = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export const liqDistancePct = (current: number, liq: number) =>
  Math.abs(((current - liq) / current) * 100);
