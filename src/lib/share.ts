import type { GameState } from "@/hooks/useGameState";
import { getStoredStreak } from "@/lib/storage";
import { MAX_GUESSES } from "@/types/movie";

/** Unicode cells for clipboard/share text only (not shown in modal). */
const GRID_WRONG = "\u2B1B"; // ⬛
const GRID_WIN = "\u{1F7E9}"; // 🟩
const GRID_UNUSED = "\u2B1C"; // ⬜

export type GuessCellKind = "wrong" | "win" | "unused";

/** Same win/loss logic as share emoji row — used by the result modal for CSS cells. */
export function getGuessCellKinds(state: GameState): GuessCellKind[] {
  const used = state.guessesUsed;
  const winIndex = state.status === "won" ? used - 1 : -1;
  const kinds: GuessCellKind[] = [];
  for (let i = 0; i < MAX_GUESSES; i++) {
    if (i < used) {
      kinds.push(i === winIndex ? "win" : "wrong");
    } else {
      kinds.push("unused");
    }
  }
  return kinds;
}

/** Wordle-style emoji cells for share text / clipboard. */
export function getGuessEmojiCells(state: GameState): string[] {
  const map: Record<GuessCellKind, string> = {
    wrong: GRID_WRONG,
    win: GRID_WIN,
    unused: GRID_UNUSED,
  };
  return getGuessCellKinds(state).map((k) => map[k]);
}

export function getGuessEmojiRow(state: GameState): string {
  return getGuessEmojiCells(state).join("");
}

function getShareBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  return "https://taglines.app";
}

function formatPuzzleDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Wordle-style share block: title line, date/score, one emoji row (5 cells), optional streak, URL.
 */
export function buildShareText(state: GameState): string {
  const lines: string[] = [];
  lines.push("TAGLINES");

  const scoreLine =
    state.status === "won"
      ? `${state.guessesUsed}/${MAX_GUESSES}`
      : state.status === "lost"
        ? `X/${MAX_GUESSES}`
        : `${state.guessesUsed}/${MAX_GUESSES}`;

  if (state.isDaily) {
    lines.push(`${formatPuzzleDate(state.dateKey)} · ${scoreLine}`);
  } else {
    lines.push(`Practice · ${scoreLine}`);
  }

  lines.push("");

  lines.push(getGuessEmojiRow(state));

  if (state.isDaily) {
    const streak = typeof window !== "undefined" ? getStoredStreak() : 0;
    if (streak > 0) {
      lines.push("");
      lines.push(`Day ${streak} 🔥`);
    }
  }

  lines.push("");
  lines.push(getShareBaseUrl());
  return lines.join("\n");
}

export async function copyShareToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
