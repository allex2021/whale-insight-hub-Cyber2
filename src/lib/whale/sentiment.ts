// VADER sentiment scoring for news headlines.
// Pure-JS, edge-safe; English text only (sufficient for CryptoPanic/CoinDesk feeds).
import vader from "vader-sentiment";

export type VaderLabel = "BULLISH" | "BEARISH" | "NEUTRAL";
export type VaderScore = {
  compound: number;   // -1..+1
  positive: number;
  negative: number;
  neutral: number;
  label: VaderLabel;
};

type VaderApi = {
  SentimentIntensityAnalyzer: {
    polarity_scores: (text: string) => { compound: number; pos: number; neg: number; neu: number };
  };
};

export function scoreText(text: string): VaderScore {
  if (!text || typeof text !== "string") {
    return { compound: 0, positive: 0, negative: 0, neutral: 1, label: "NEUTRAL" };
  }
  const api = vader as unknown as VaderApi;
  const s = api.SentimentIntensityAnalyzer.polarity_scores(text);
  const compound = s.compound;
  const label: VaderLabel =
    compound >= 0.2 ? "BULLISH" : compound <= -0.2 ? "BEARISH" : "NEUTRAL";
  return {
    compound,
    positive: s.pos,
    negative: s.neg,
    neutral: s.neu,
    label,
  };
}

// Average compound score across many items, clamped to -1..+1
export function averageCompound(items: Array<{ compound: number } | null | undefined>): number {
  const valid = items.filter((x): x is { compound: number } => !!x && typeof x.compound === "number");
  if (valid.length === 0) return 0;
  const sum = valid.reduce((s, x) => s + x.compound, 0);
  return Math.max(-1, Math.min(1, sum / valid.length));
}
