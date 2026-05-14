import { narratorLines } from "@/lib/narratorLines";

const narratorLineCache = new Map<string, string>();
const DAILY_NARRATOR_KEY_PREFIX = "taglines-daily-narrator-line-";

interface NarratorResultOptions {
  isDaily?: boolean;
  dateKey?: string;
}

function pickFromNarratorPools(status: "won" | "lost", guessesUsed: number): string {
  if (status === "lost") {
    const pool = narratorLines[0];
    return pool[Math.floor(Math.random() * pool.length)] ?? narratorLines[0][0];
  }
  const n = Math.min(5, Math.max(1, guessesUsed)) as 1 | 2 | 3 | 4 | 5;
  const pool = narratorLines[n];
  return pool[Math.floor(Math.random() * pool.length)] ?? narratorLines[5][0];
}

/** Big headline after a round (result modal + daily completion). */
export function narratorResultLine(
  status: "won" | "lost",
  guessesUsed: number,
  options: NarratorResultOptions = {}
): string {
  const dailyKey = options.isDaily && options.dateKey ? `${DAILY_NARRATOR_KEY_PREFIX}${options.dateKey}` : null;
  const key = dailyKey ?? `${status}:${guessesUsed}`;
  const cached = narratorLineCache.get(key);
  if (cached) return cached;

  if (dailyKey && typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(dailyKey);
      if (stored) {
        narratorLineCache.set(key, stored);
        return stored;
      }
    } catch {
      // ignore storage failures
    }
  }

  const picked = pickFromNarratorPools(status, guessesUsed);
  narratorLineCache.set(key, picked);
  if (dailyKey && typeof window !== "undefined") {
    try {
      localStorage.setItem(dailyKey, picked);
    } catch {
      // ignore storage failures
    }
  }
  return picked;
}
