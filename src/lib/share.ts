import type { GameState } from "@/hooks/useGameState";
import { getStoredStreak } from "@/lib/storage";
import { MAX_GUESSES } from "@/types/movie";

/**
 * Build emoji-style share text (Wordle-style grid).
 * One row per guess: ✅ correct, ❌ wrong.
 * Then a line with score and streak.
 */
export function buildShareText(state: GameState): string {
  const lines: string[] = ["🎬 Taglines"];
  const total = state.guessesUsed;
  for (let i = 0; i < total; i++) {
    const won = state.status === "won" && i === total - 1;
    lines.push(won ? "✅" : "❌");
  }
  const remaining = MAX_GUESSES - total;
  for (let i = 0; i < remaining && state.status === "playing"; i++) {
    lines.push("⬜");
  }
  if (state.status === "won") {
    lines.push(`\n${state.guessesUsed}/${MAX_GUESSES} guesses`);
  } else if (state.status === "lost") {
    lines.push(`\nX/${MAX_GUESSES}`);
  }
  const streak = typeof window !== "undefined" ? getStoredStreak() : 0;
  if (streak > 0 && state.isDaily) {
    lines.push(`🔥 ${streak} day streak`);
  }
  return lines.join(" ");
}

export async function copyShareToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
