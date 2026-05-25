// Economic calendar — free ForexFactory community JSON mirror.
// High-impact macro events (FOMC, CPI, NFP, ECB, etc.) often move BTC 2-5%.
// We surface a caution flag when one is within the next 60 minutes.

export interface FFEvent {
  title: string;
  country: string;
  date: string;     // ISO timestamp
  impact: "High" | "Medium" | "Low" | "Holiday";
  forecast?: string;
  previous?: string;
}

export interface UpcomingEvent {
  title: string;
  country: string;
  at: number;       // epoch ms
  minutesUntil: number;
  impact: "High" | "Medium" | "Low" | "Holiday";
}

const FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const CORS = (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`;

let cache: { at: number; data: FFEvent[] } | null = null;
const TTL_MS = 30 * 60_000; // refresh every 30min — feed updates weekly

export async function fetchEconomicCalendar(signal?: AbortSignal): Promise<FFEvent[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    let res = await fetch(FEED_URL, { signal }).catch(() => null);
    if (!res || !res.ok) res = await fetch(CORS(FEED_URL), { signal });
    if (!res.ok) throw new Error(`calendar ${res.status}`);
    const data = (await res.json()) as FFEvent[];
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return cache?.data ?? [];
  }
}

// Currencies whose high-impact prints typically move crypto.
const RELEVANT = new Set(["USD", "EUR", "CNY", "GBP", "JPY"]);

export function getUpcomingHighImpact(events: FFEvent[], windowMinutes = 60): UpcomingEvent[] {
  const now = Date.now();
  const horizon = now + windowMinutes * 60_000;
  const out: UpcomingEvent[] = [];
  for (const ev of events) {
    if (ev.impact !== "High") continue;
    if (!RELEVANT.has(ev.country)) continue;
    const at = new Date(ev.date).getTime();
    if (!Number.isFinite(at)) continue;
    if (at < now || at > horizon) continue;
    out.push({
      title: ev.title,
      country: ev.country,
      at,
      minutesUntil: Math.round((at - now) / 60_000),
      impact: ev.impact,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}
