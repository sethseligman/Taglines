const STREAK_KEY = "taglines-streak";
const HISTORY_KEY = "taglines-history";
const LAST_PLAYED_KEY = "taglines-last-played";

export interface GameResult {
  date: string;
  won: boolean;
  guessesUsed: number;
  maxGuesses: number;
}

export function getStoredStreak(): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = localStorage.getItem(STREAK_KEY);
    return v ? Math.max(0, parseInt(v, 10)) : 0;
  } catch {
    return 0;
  }
}

export function setStoredStreak(streak: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STREAK_KEY, String(Math.max(0, streak)));
  } catch {
    // ignore
  }
}

export function getStoredHistory(): GameResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendStoredResult(result: GameResult): void {
  if (typeof window === "undefined") return;
  try {
    const history = getStoredHistory();
    const filtered = history.filter((r) => r.date !== result.date);
    filtered.push(result);
    // Keep last 30 days
    const trimmed = filtered.slice(-30);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

export function getLastPlayedDate(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_PLAYED_KEY);
  } catch {
    return null;
  }
}

export function setLastPlayedDate(date: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_PLAYED_KEY, date);
  } catch {
    // ignore
  }
}

export function getWinCount(): number {
  return getStoredHistory().filter((r) => r.won).length;
}

export function getPlayCount(): number {
  return getStoredHistory().length;
}
