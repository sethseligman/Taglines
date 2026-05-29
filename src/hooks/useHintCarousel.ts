"use client";

import {
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Movie } from "@/types/movie";
import type { HintLevel } from "@/types/movie";
import type { GameStatus } from "@/hooks/useGameState";
import { getHintBodyForLevel } from "@/lib/hintContent";
import {
  CAROUSEL_EASING_DEFAULT,
  CAROUSEL_EASING_SETTLE,
  CAROUSEL_MANUAL_MS,
  EASE_OUT,
  WRONG_GUESS_BLANK_MS,
  WRONG_GUESS_FADE_IN_MS,
  WRONG_GUESS_SLIDE_OUT_MS,
} from "@/lib/hintCarouselConstants";

export function useHintCarousel({
  movie,
  hintLevel,
  guessesUsed,
  status,
  sessionResetKey,
  isDesktop,
}: {
  movie: Movie;
  hintLevel: HintLevel;
  guessesUsed: number;
  status: GameStatus;
  sessionResetKey: string;
  isDesktop: boolean;
}) {
  const holdHintUntilFlashCompleteRef = useRef(false);
  const [wrongGuessFlash, setWrongGuessFlash] = useState(false);
  const [displayedHintLevel, setDisplayedHintLevel] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselTransitionMs, setCarouselTransitionMs] = useState(500);
  const [carouselTransitionEasing, setCarouselTransitionEasing] = useState(CAROUSEL_EASING_DEFAULT);
  const [stripMotionMode, setStripMotionMode] = useState<"idle" | "engaging" | "paused">("idle");
  const [hintRevealPhase, setHintRevealPhase] = useState<"normal" | "slideOut" | "blank" | "fadingIn">("normal");
  const [cinematicFocusActive, setCinematicFocusActive] = useState(false);
  const [slideOutHintText, setSlideOutHintText] = useState("");
  const skipCarouselSyncAfterFlashRef = useRef(false);
  const wrongGuessCompleteRef = useRef({ hintLevel: 0, carouselIndex: 0 });
  const carouselAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const carouselSlideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintRevealGateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintRevealFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDisplayedHintLevelRef = useRef(0);
  const prevSyncedHintLevelRef = useRef(0);
  const previousCarouselIndexRef = useRef(0);
  const hintSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const hintSwipePointerIdRef = useRef<number | null>(null);
  const hintSwipeLockedRef = useRef(false);
  const [carouselDirection, setCarouselDirection] = useState(1);
  const prevGuessesUsedRef = useRef(0);
  const guessFlashBaselineReadyRef = useRef(false);
  const gameStatusRef = useRef(status);
  gameStatusRef.current = status;

  const resetCarouselState = useCallback(() => {
    setWrongGuessFlash(false);
    setDisplayedHintLevel(0);
    setCarouselIndex(0);
    holdHintUntilFlashCompleteRef.current = false;
    if (carouselAdvanceTimeoutRef.current) {
      clearTimeout(carouselAdvanceTimeoutRef.current);
      carouselAdvanceTimeoutRef.current = null;
    }
    if (carouselSlideTimeoutRef.current) {
      clearTimeout(carouselSlideTimeoutRef.current);
      carouselSlideTimeoutRef.current = null;
    }
    if (hintRevealGateTimeoutRef.current) {
      clearTimeout(hintRevealGateTimeoutRef.current);
      hintRevealGateTimeoutRef.current = null;
    }
    if (hintRevealFadeTimeoutRef.current) {
      clearTimeout(hintRevealFadeTimeoutRef.current);
      hintRevealFadeTimeoutRef.current = null;
    }
    skipCarouselSyncAfterFlashRef.current = false;
    setCarouselDirection(1);
    setCarouselTransitionMs(500);
    setCarouselTransitionEasing(CAROUSEL_EASING_DEFAULT);
    setStripMotionMode("idle");
    setHintRevealPhase("normal");
    setCinematicFocusActive(false);
    setSlideOutHintText("");
    prevDisplayedHintLevelRef.current = 0;
    prevSyncedHintLevelRef.current = 0;
    previousCarouselIndexRef.current = 0;
    prevGuessesUsedRef.current = 0;
    guessFlashBaselineReadyRef.current = false;
  }, []);

  useEffect(() => {
    resetCarouselState();
  }, [sessionResetKey, resetCarouselState]);

  useLayoutEffect(() => {
    guessFlashBaselineReadyRef.current = false;
  }, [sessionResetKey]);

  useEffect(() => {
    if (wrongGuessFlash || holdHintUntilFlashCompleteRef.current) return;
    setDisplayedHintLevel(hintLevel);
    if (!skipCarouselSyncAfterFlashRef.current) {
      if (hintLevel !== prevSyncedHintLevelRef.current) {
        const targetIndex = Math.max(0, hintLevel - 1);
        if (targetIndex > carouselIndex) {
          if (carouselAdvanceTimeoutRef.current) {
            clearTimeout(carouselAdvanceTimeoutRef.current);
            carouselAdvanceTimeoutRef.current = null;
          }
          let nextIndex = carouselIndex + 1;
          const runStep = () => {
            const isFinalStep = nextIndex === targetIndex;
            setCarouselDirection(1);
            setCarouselTransitionEasing(isFinalStep ? CAROUSEL_EASING_SETTLE : CAROUSEL_EASING_DEFAULT);
            setCarouselTransitionMs(isFinalStep ? 500 : 120);
            setCarouselIndex(nextIndex);
            if (isFinalStep) {
              carouselAdvanceTimeoutRef.current = null;
              return;
            }
            nextIndex += 1;
            carouselAdvanceTimeoutRef.current = setTimeout(runStep, 120);
          };
          runStep();
        } else if (targetIndex !== carouselIndex) {
          setCarouselDirection(1);
          setCarouselTransitionEasing(CAROUSEL_EASING_SETTLE);
          setCarouselTransitionMs(500);
          setCarouselIndex(targetIndex);
        }
      }
    }
    prevSyncedHintLevelRef.current = hintLevel;
  }, [hintLevel, wrongGuessFlash, carouselIndex]);

  useLayoutEffect(() => {
    const used = guessesUsed;
    if (!guessFlashBaselineReadyRef.current) {
      guessFlashBaselineReadyRef.current = true;
      if (used <= prevGuessesUsedRef.current) {
        prevGuessesUsedRef.current = used;
        return;
      }
    } else if (used <= prevGuessesUsedRef.current) {
      return;
    }
    if (used > prevGuessesUsedRef.current && gameStatusRef.current !== "won") {
      holdHintUntilFlashCompleteRef.current = true;
      setWrongGuessFlash(true);
    }
    prevGuessesUsedRef.current = used;
  }, [guessesUsed]);

  wrongGuessCompleteRef.current = { hintLevel, carouselIndex };

  const handleWrongGuessFlashComplete = useCallback(() => {
    if (carouselAdvanceTimeoutRef.current) {
      clearTimeout(carouselAdvanceTimeoutRef.current);
      carouselAdvanceTimeoutRef.current = null;
    }
    setWrongGuessFlash(false);
    skipCarouselSyncAfterFlashRef.current = true;
    setStripMotionMode("engaging");
    setHintRevealPhase("normal");
    setCinematicFocusActive(true);
    const { hintLevel: hl, carouselIndex: startIndex } = wrongGuessCompleteRef.current;
    const firstHintReveal = hl <= 1 || startIndex < 0;
    if (firstHintReveal) {
      setHintRevealPhase("blank");
    }
    setDisplayedHintLevel(hl);
    carouselAdvanceTimeoutRef.current = setTimeout(() => {
      const targetIndex = Math.max(0, hl - 1);
      const finishWithFadeIn = () => {
        setHintRevealPhase("fadingIn");
        if (hintRevealFadeTimeoutRef.current) clearTimeout(hintRevealFadeTimeoutRef.current);
        hintRevealFadeTimeoutRef.current = setTimeout(() => {
          setHintRevealPhase("normal");
          setStripMotionMode("paused");
          setCinematicFocusActive(false);
          setSlideOutHintText("");
          hintRevealFadeTimeoutRef.current = null;
        }, WRONG_GUESS_FADE_IN_MS);
      };

      const hasExistingHint = startIndex >= 0 && hl > 1;
      if (!hasExistingHint || targetIndex <= startIndex) {
        setHintRevealPhase("blank");
        setCarouselTransitionMs(0);
        setCarouselIndex(targetIndex);
        if (hintRevealGateTimeoutRef.current) clearTimeout(hintRevealGateTimeoutRef.current);
        hintRevealGateTimeoutRef.current = setTimeout(() => {
          hintRevealGateTimeoutRef.current = null;
          finishWithFadeIn();
        }, WRONG_GUESS_BLANK_MS);
      } else {
        setSlideOutHintText(getHintBodyForLevel(movie, (hl - 1) as HintLevel));
        setHintRevealPhase("slideOut");
        if (hintRevealGateTimeoutRef.current) clearTimeout(hintRevealGateTimeoutRef.current);
        hintRevealGateTimeoutRef.current = setTimeout(() => {
          hintRevealGateTimeoutRef.current = null;
          setHintRevealPhase("blank");
          setCarouselTransitionMs(0);
          setCarouselIndex(targetIndex);
          if (hintRevealFadeTimeoutRef.current) clearTimeout(hintRevealFadeTimeoutRef.current);
          hintRevealFadeTimeoutRef.current = setTimeout(() => {
            hintRevealFadeTimeoutRef.current = null;
            finishWithFadeIn();
          }, WRONG_GUESS_BLANK_MS);
        }, WRONG_GUESS_SLIDE_OUT_MS);
      }
      skipCarouselSyncAfterFlashRef.current = false;
      carouselAdvanceTimeoutRef.current = null;
    }, 400);
    holdHintUntilFlashCompleteRef.current = false;
  }, [movie]);

  const handleHintPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    hintSwipePointerIdRef.current = e.pointerId;
    hintSwipeStartRef.current = { x: e.clientX, y: e.clientY };
    hintSwipeLockedRef.current = false;
  }, []);

  const handleHintPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (hintSwipePointerIdRef.current !== e.pointerId) return;
    if (!hintSwipeStartRef.current || hintSwipeLockedRef.current) return;
    const dx = e.clientX - hintSwipeStartRef.current.x;
    const dy = e.clientY - hintSwipeStartRef.current.y;
    if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      e.preventDefault();
    }
  }, []);

  const handleHintPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (hintSwipePointerIdRef.current !== e.pointerId) return;
      if (!hintSwipeStartRef.current || hintSwipeLockedRef.current) return;
      const dx = e.clientX - hintSwipeStartRef.current.x;
      const dy = e.clientY - hintSwipeStartRef.current.y;
      hintSwipeStartRef.current = null;
      hintSwipePointerIdRef.current = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      hintSwipeLockedRef.current = true;
      if (dx < 0 && carouselIndex < displayedHintLevel - 1) {
        setCarouselDirection(1);
        setCarouselTransitionEasing(CAROUSEL_EASING_DEFAULT);
        setCarouselTransitionMs(CAROUSEL_MANUAL_MS);
        setCarouselIndex((c) => c + 1);
      } else if (dx > 0 && carouselIndex > 0) {
        setCarouselDirection(-1);
        setCarouselTransitionEasing(CAROUSEL_EASING_DEFAULT);
        setCarouselTransitionMs(CAROUSEL_MANUAL_MS);
        setCarouselIndex((c) => c - 1);
      }
    },
    [carouselIndex, displayedHintLevel]
  );

  const goToPrevHint = useCallback(() => {
    setCarouselDirection(-1);
    setCarouselTransitionEasing(CAROUSEL_EASING_DEFAULT);
    setCarouselTransitionMs(CAROUSEL_MANUAL_MS);
    setCarouselIndex((c) => c - 1);
  }, []);

  const goToNextHint = useCallback(() => {
    setCarouselDirection(1);
    setCarouselTransitionEasing(CAROUSEL_EASING_DEFAULT);
    setCarouselTransitionMs(CAROUSEL_MANUAL_MS);
    setCarouselIndex((c) => c + 1);
  }, []);

  const handleHintPointerCancel = useCallback(() => {
    hintSwipeStartRef.current = null;
    hintSwipePointerIdRef.current = null;
    hintSwipeLockedRef.current = false;
  }, []);

  const sprocketsRunning =
    cinematicFocusActive ||
    stripMotionMode === "engaging" ||
    hintRevealPhase === "slideOut" ||
    hintRevealPhase === "blank" ||
    hintRevealPhase === "fadingIn";

  return {
    wrongGuessFlash,
    displayedHintLevel,
    carouselIndex,
    carouselTransitionMs,
    carouselTransitionEasing,
    hintRevealPhase,
    slideOutHintText,
    sprocketsRunning,
    cinematicFocusActive,
    handleWrongGuessFlashComplete,
    handleHintPointerDown,
    handleHintPointerMove,
    handleHintPointerUp,
    goToPrevHint,
    goToNextHint,
    handleHintPointerCancel,
    isDesktop,
  };
}
