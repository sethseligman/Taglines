import { getNarratorLine } from "@/lib/narratorLines";

const narratorLineCache = new Map<string, string>();

/** Big headline after a round (result modal + daily completion). */
export function narratorResultLine(status: "won" | "lost", guessesUsed: number): string {
  const key = `${status}:${guessesUsed}`;
  const cached = narratorLineCache.get(key);
  if (cached) return cached;
  const picked = getNarratorLine(status, guessesUsed);
  narratorLineCache.set(key, picked);
  return picked;
}
