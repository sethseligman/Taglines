/**
 * Center-screen slam entrance — shared by WrongGuessFlash (✕) and GameEndSequence verdict.
 * @see src/components/WrongGuessFlash.tsx
 */
export const SLAM_ENTRANCE_MS = 100;
export const SLAM_ENTRANCE_EASING = "cubic-bezier(0.2, 0, 0.3, 1)";
export const SLAM_INITIAL_SCALE = 0.95;
export const SLAM_EASE_OUT = "var(--ease-out)";

/** WrongGuessFlash mark color — verdict uses as stroke/shadow accent. */
export const WRONG_GUESS_RED = "#C0392B";

/** Pre-slam beat before the ✕ strikes (verdict uses emptyBeatHold instead). */
export const SLAM_THINK_MS = 500;

/** Settle + rattle after slam lands. */
export const SLAM_HOLD_MS = 400;

/** wrongGuessRattle duration on hold (globals.css). */
export const SLAM_RATTLE_MS = 120;
export const SLAM_RATTLE_EASING = "ease-out";

/** One frame so idle (scale 0.95, opacity 0) paints before slam transition runs. */
export const SLAM_PRIME_MS = 50;

export const SLAM_RATTLE_ANIMATION = `wrongGuessRattle ${SLAM_RATTLE_MS}ms ${SLAM_RATTLE_EASING} 1`;

/** Red glow/stroke accent on verdict text during slam + hold (Playfair gold fill preserved). */
export const VERDICT_SLAM_TEXT_SHADOW = `0 0 28px rgba(192, 57, 43, 0.55), 0 0 10px rgba(192, 57, 43, 0.7), 0 1px 0 ${WRONG_GUESS_RED}`;
