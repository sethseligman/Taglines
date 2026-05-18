const STREAK_KEY = "taglines-streak";
const HISTORY_KEY = "taglines-history";
const LAST_PLAYED_KEY = "taglines-last-played";
const BEST_STREAK_KEY = "taglines-best-streak";

export interface DailyCompletionResult {
  status: "won" | "lost";
  guessesUsed: number;
  dateKey: string;
  movieTitle: string;
  movieYear: number;
  movieGenre: string;
  posterUrl: string | null;
}

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

export function getStoredBestStreak(): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = localStorage.getItem(BEST_STREAK_KEY);
    return v ? Math.max(0, parseInt(v, 10)) : 0;
  } catch {
    return 0;
  }
}

/** Persist rolling max streak (e.g. after a daily win). Does not decrease stored best. */
export function maybeUpdateStoredBestStreak(currentStreak: number): void {
  if (typeof window === "undefined") return;
  try {
    const prev = getStoredBestStreak();
    if (currentStreak > prev) {
      localStorage.setItem(BEST_STREAK_KEY, String(currentStreak));
    }
  } catch {
    // ignore
  }
}

function getDailyResultStorageKey(dateKey: string): string {
  return `taglines-daily-result-${dateKey}`;
}

function getDailyResultSeenKey(dateKey: string): string {
  return `taglines:daily:seen:${dateKey}`;
}

export function markDailyResultSeen(dateKey: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getDailyResultSeenKey(dateKey), "1");
  } catch {
    // ignore
  }
}

export function hasDailyResultBeenSeen(dateKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(getDailyResultSeenKey(dateKey)) === "1";
  } catch {
    return false;
  }
}

export function setDailyCompletionResult(result: DailyCompletionResult): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getDailyResultStorageKey(result.dateKey), JSON.stringify(result));
  } catch {
    // ignore
  }
}

export function getDailyCompletionResult(dateKey: string): DailyCompletionResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getDailyResultStorageKey(dateKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DailyCompletionResult> | null;
    if (!parsed) return null;
    if (parsed.dateKey !== dateKey) return null;
    if (parsed.status !== "won" && parsed.status !== "lost") return null;
    if (typeof parsed.guessesUsed !== "number") return null;
    if (typeof parsed.movieTitle !== "string") return null;
    if (typeof parsed.movieYear !== "number") return null;
    if (typeof parsed.movieGenre !== "string") return null;
    if (!(typeof parsed.posterUrl === "string" || parsed.posterUrl === null)) return null;
    return {
      status: parsed.status,
      guessesUsed: parsed.guessesUsed,
      dateKey: parsed.dateKey,
      movieTitle: parsed.movieTitle,
      movieYear: parsed.movieYear,
      movieGenre: parsed.movieGenre,
      posterUrl: parsed.posterUrl,
    };
  } catch {
    return null;
  }
}
