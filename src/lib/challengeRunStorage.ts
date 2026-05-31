import type { ChallengeRunStatus } from "@/types/challenges";

export interface StoredChallengeLeg {
  movieId: string;
  position: number;
  guessesUsed: number;
  solved: boolean;
  completedAt: string;
}

export interface StoredChallengeRun {
  slug: string;
  legs: StoredChallengeLeg[];
  currentLegIndex: number;
  status: ChallengeRunStatus;
  startedAt: string;
}

/** daily_pool runs include dateKey so each day gets a separate localStorage entry. */
export function challengeRunStorageKey(slug: string, dateKey?: string): string {
  if (dateKey) return `taglines:challenge-run:${slug}:${dateKey}`;
  return `taglines:challenge-run:${slug}`;
}

export function loadChallengeRun(slug: string, dateKey?: string): StoredChallengeRun | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(challengeRunStorageKey(slug, dateKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredChallengeRun> | null;
    if (!parsed || parsed.slug !== slug) return null;
    if (parsed.status !== "in_progress" && parsed.status !== "finished" && parsed.status !== "failed") {
      return null;
    }
    if (!Array.isArray(parsed.legs)) return null;
    if (typeof parsed.currentLegIndex !== "number") return null;
    if (typeof parsed.startedAt !== "string") return null;
    const legs = parsed.legs.filter(
      (l): l is StoredChallengeLeg =>
        typeof l.movieId === "string" &&
        typeof l.position === "number" &&
        typeof l.guessesUsed === "number" &&
        typeof l.solved === "boolean" &&
        typeof l.completedAt === "string"
    );
    return {
      slug,
      legs,
      currentLegIndex: parsed.currentLegIndex,
      status: parsed.status,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function saveChallengeRun(run: StoredChallengeRun, dateKey?: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(challengeRunStorageKey(run.slug, dateKey), JSON.stringify(run));
  } catch {
    // ignore
  }
}

export function initChallengeRun(slug: string, dateKey?: string): StoredChallengeRun {
  const run: StoredChallengeRun = {
    slug,
    legs: [],
    currentLegIndex: 0,
    status: "in_progress",
    startedAt: new Date().toISOString(),
  };
  saveChallengeRun(run, dateKey);
  return run;
}

export function getOrInitChallengeRun(slug: string, dateKey?: string): StoredChallengeRun {
  return loadChallengeRun(slug, dateKey) ?? initChallengeRun(slug, dateKey);
}

export function clearChallengeRun(slug: string, dateKey?: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(challengeRunStorageKey(slug, dateKey));
  } catch {
    // ignore
  }
}

/** Record a failed leg and mark the entire run failed (no advance to next leg). */
export function markChallengeRunFailed(
  current: StoredChallengeRun,
  movieId: string,
  position: number,
  guessesUsed: number,
  dateKey?: string
): StoredChallengeRun {
  const legEntry: StoredChallengeLeg = {
    movieId,
    position,
    guessesUsed,
    solved: false,
    completedAt: new Date().toISOString(),
  };

  const legsWithoutPosition = current.legs.filter((l) => l.position !== position);
  const nextLegs = [...legsWithoutPosition, legEntry].sort((a, b) => a.position - b.position);
  const failed: StoredChallengeRun = {
    ...current,
    legs: nextLegs,
    status: "failed",
  };
  saveChallengeRun(failed, dateKey);
  return failed;
}

export function restartChallengeRun(slug: string, dateKey?: string): StoredChallengeRun {
  clearChallengeRun(slug, dateKey);
  return initChallengeRun(slug, dateKey);
}

export interface PortalChallengeProgress {
  label: string;
  solvedCount: number;
  totalLegs: number;
  isFinished: boolean;
  isNotStarted: boolean;
}

export function getPortalChallengeProgress(
  slug: string,
  legCount: number,
  dateKey?: string
): PortalChallengeProgress {
  const run = loadChallengeRun(slug, dateKey);
  if (!run || run.status === "finished" || run.status === "failed") {
    if (run?.status === "failed") {
      return {
        label: "Failed",
        solvedCount: run.legs.filter((l) => l.solved).length,
        totalLegs: legCount,
        isFinished: false,
        isNotStarted: false,
      };
    }
    if (run?.status === "finished") {
      return {
        label: "Done",
        solvedCount: run.legs.filter((l) => l.solved).length,
        totalLegs: legCount,
        isFinished: true,
        isNotStarted: false,
      };
    }
    return {
      label: "Not started",
      solvedCount: 0,
      totalLegs: legCount,
      isFinished: false,
      isNotStarted: true,
    };
  }

  const solvedCount = run.legs.filter((l) => l.solved).length;
  if (run.legs.length === 0 && run.currentLegIndex === 0) {
    return {
      label: "Not started",
      solvedCount: 0,
      totalLegs: legCount,
      isFinished: false,
      isNotStarted: true,
    };
  }

  return {
    label: `${solvedCount} of ${legCount}`,
    solvedCount,
    totalLegs: legCount,
    isFinished: false,
    isNotStarted: false,
  };
}

export function totalGuessesForRun(run: StoredChallengeRun): number {
  return run.legs.reduce((sum, leg) => sum + leg.guessesUsed, 0);
}

/** Wall-clock elapsed from run start to completion (or now if still in progress). */
export function formatChallengeRunDuration(
  startedAt: string,
  endAt: string = new Date().toISOString()
): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(endAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return "Completed in 0s";
  }
  const totalSeconds = Math.floor((end - start) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours >= 1) {
    return `Completed in ${hours}h ${minutes}m`;
  }
  if (minutes >= 1) {
    return `Completed in ${minutes}m ${seconds}s`;
  }
  return `Completed in ${seconds}s`;
}
