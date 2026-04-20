/** Large hint card used by WrongGuessAnimation and HintExpandedOverlay (journey + expand). */
export const EXPANDED_HINT_CARD_WIDTH = 180;
export const EXPANDED_HINT_CARD_HEIGHT = 240;

/** Shift card north of vertical center (fraction of viewport height). Shared so all beats match. */
export const EXPANDED_HINT_CARD_NORTH_BIAS_VH = 0.12;

/**
 * Top-left of the large hint card when it is not scaled to a tile — same for ✕, flip, expand overlay,
 * and WrongGuess Beat 3 journey origin so nothing jumps between phases.
 */
export function getExpandedHintCardAnchor(): { top: number; left: number } {
  if (typeof window === "undefined") {
    return { top: 0, left: 0 };
  }
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const centeredTop = (vh - EXPANDED_HINT_CARD_HEIGHT) / 2;
  const shiftNorth = vh * EXPANDED_HINT_CARD_NORTH_BIAS_VH;
  return {
    top: Math.max(12, centeredTop - shiftNorth),
    left: (vw - EXPANDED_HINT_CARD_WIDTH) / 2,
  };
}
