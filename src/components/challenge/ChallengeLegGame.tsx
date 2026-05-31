"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Movie } from "@/types/movie";
import { MAX_GUESSES } from "@/types/movie";
import { useGameState } from "@/hooks/useGameState";
import { useHintCarousel } from "@/hooks/useHintCarousel";
import { useAutoFitFontSize } from "@/hooks/useAutoFitFontSize";
import { GuessInput } from "@/components/GuessInput";
import { HintReveal } from "@/components/HintReveal";
import { WrongGuessFlash } from "@/components/WrongGuessFlash";
import { BorderCircuit } from "@/components/game/BorderCircuit";
import { GameHintCarousel } from "@/components/game/GameHintCarousel";
import { WrongGuessHistoryStrip } from "@/components/game/WrongGuessHistoryStrip";

export interface LegCompletePayload {
  solved: boolean;
  guessesUsed: number;
}

interface ChallengeLegGameProps {
  movie: Movie;
  legSessionKey: string;
  backgroundUrl?: string | null;
  onLegComplete: (result: LegCompletePayload) => void;
  onLayoutBreathingChange?: (relaxed: boolean) => void;
  relaxedVisual?: boolean;
}

export function ChallengeLegGame({
  movie,
  legSessionKey,
  backgroundUrl,
  onLegComplete,
  onLayoutBreathingChange,
  relaxedVisual: relaxedVisualProp,
}: ChallengeLegGameProps) {
  const { state, submitGuess } = useGameState(movie, false, legSessionKey);
  const [duplicateSignal, setDuplicateSignal] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [borderPressureWrongGuesses, setBorderPressureWrongGuesses] = useState(0);
  const legCompleteFiredRef = useRef(false);
  const lossFlashFinishedRef = useRef(false);
  const idleGameRef = useRef({ status: state.status, guessesUsed: state.guessesUsed });
  const taglineContainerRef = useRef<HTMLDivElement>(null);
  const taglineTextRef = useRef<HTMLParagraphElement>(null);

  idleGameRef.current = { status: state.status, guessesUsed: state.guessesUsed };

  const hintCarousel = useHintCarousel({
    movie: state.movie,
    hintLevel: state.hintLevel,
    guessesUsed: state.guessesUsed,
    status: state.status,
    sessionResetKey: legSessionKey,
    isDesktop,
  });

  const TAGLINE_3LINE_HEIGHT_MOBILE_PX = 170;
  const TAGLINE_3LINE_HEIGHT_DESKTOP_PX = 220;
  const taglineThreeLineHeightPx = isDesktop ? TAGLINE_3LINE_HEIGHT_DESKTOP_PX : TAGLINE_3LINE_HEIGHT_MOBILE_PX;

  const taglineFontSize = useAutoFitFontSize(taglineTextRef, taglineContainerRef, {
    min: isDesktop ? 28 : 24,
    max: isDesktop ? 56 : 44,
    fitMaxHeight: taglineThreeLineHeightPx,
    deps: [state.movie.officialTagline, isDesktop],
  });

  const {
    wrongGuessFlash,
    handleWrongGuessFlashComplete: hintWrongGuessFlashComplete,
    cinematicFocusActive,
    displayedHintLevel,
    carouselIndex,
    carouselTransitionMs,
    carouselTransitionEasing,
    hintRevealPhase,
    slideOutHintText,
    sprocketsRunning,
    goToPrevHint,
    goToNextHint,
    handleHintPointerDown,
    handleHintPointerMove,
    handleHintPointerUp,
    handleHintPointerCancel,
  } = hintCarousel;

  const handleWrongGuessFlashComplete = useCallback(() => {
    const { guessesUsed, status } = idleGameRef.current;
    if (status === "playing") {
      setBorderPressureWrongGuesses(guessesUsed);
    } else if (status === "lost" && guessesUsed >= MAX_GUESSES) {
      lossFlashFinishedRef.current = true;
      setBorderPressureWrongGuesses(0);
    }
    hintWrongGuessFlashComplete();
  }, [hintWrongGuessFlashComplete]);

  const handleWrongGuessSlam = useCallback(() => {
    const { guessesUsed, status } = idleGameRef.current;
    if (status !== "lost" || guessesUsed < MAX_GUESSES) return;
    setBorderPressureWrongGuesses(5);
  }, []);

  useEffect(() => {
    if (state.status === "won") {
      setBorderPressureWrongGuesses(0);
    }
  }, [state.status]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    legCompleteFiredRef.current = false;
    lossFlashFinishedRef.current = false;
    setBorderPressureWrongGuesses(0);
  }, [legSessionKey]);

  useEffect(() => {
    if (state.status !== "playing") {
      if (wrongGuessFlash) return;
      const awaitingLossFlash =
        state.status === "lost" &&
        state.guessesUsed >= MAX_GUESSES &&
        !lossFlashFinishedRef.current;
      if (awaitingLossFlash) return;
      if (legCompleteFiredRef.current) return;
      legCompleteFiredRef.current = true;
      onLegComplete({
        solved: state.status === "won",
        guessesUsed: state.guessesUsed,
      });
      return;
    }
    legCompleteFiredRef.current = false;
  }, [state.status, state.guessesUsed, onLegComplete, wrongGuessFlash]);

  useEffect(() => {
    if (state.submitMessage === "Already guessed") {
      setDuplicateSignal((n) => n + 1);
    }
  }, [state.submitMessage]);

  const handleGuessSubmit = useCallback(
    (value: string) => {
      submitGuess(value);
    },
    [submitGuess]
  );

  const relaxedVisual = relaxedVisualProp ?? isDesktop;

  const awaitingLossFlash =
    state.status === "lost" &&
    state.guessesUsed >= MAX_GUESSES &&
    !lossFlashFinishedRef.current;

  if (state.status !== "playing" && !wrongGuessFlash && !awaitingLossFlash) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted">Saving leg…</p>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {wrongGuessFlash ? (
        <WrongGuessFlash onComplete={handleWrongGuessFlashComplete} onSlam={handleWrongGuessSlam} />
      ) : null}

      {borderPressureWrongGuesses > 0 && (state.status === "playing" || wrongGuessFlash) ? (
        <BorderCircuit wrongGuesses={borderPressureWrongGuesses} />
      ) : null}

      {cinematicFocusActive ? (
        <div
          className="pointer-events-none fixed inset-0 z-20"
          style={{ background: "rgba(0,0,0,0.3)" }}
          aria-hidden
        />
      ) : null}

      <div className="relative mx-auto w-full max-w-lg overflow-hidden">
        {backgroundUrl ? (
          <div
            className="pointer-events-none absolute inset-0 z-0"
            aria-hidden
            style={{
              backgroundImage: `url("${backgroundUrl}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: 0.18,
            }}
          />
        ) : null}

        <div className="relative z-10">
          <section className="relative z-30 mx-auto w-full max-w-lg px-1">
            <div
              className={`relative ${relaxedVisual ? "pb-3 pt-0 md:pb-6 md:pt-2" : "pb-2 pt-0 md:pb-4 md:pt-1"}`}
            >
              <div
                ref={taglineContainerRef}
                className="relative z-10 w-full"
                style={{
                  minHeight: taglineThreeLineHeightPx,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <HintReveal
                  movie={state.movie}
                  hintLevel={0}
                  textRef={taglineTextRef}
                  taglineFontSizePx={taglineFontSize}
                  className="w-full [&_p]:!italic [&_p]:!leading-[1.12] md:[&_p]:!leading-[1.1] [&>div:last-child]:!mt-5 md:[&>div:last-child]:!mt-10"
                />
              </div>
            </div>
          </section>

          <div className="mx-auto mt-4 flex w-full max-w-lg flex-col items-center md:mt-8">
            <div className="motion-safe:animate-[fadeIn_0.35s_ease-out_80ms_both] motion-reduce:animate-none flex w-full flex-col items-center">
              <div
                className={`relative flex w-full max-w-md shrink-0 flex-col ${
                  relaxedVisual ? "mb-6 gap-4 md:mb-11 md:gap-6" : "mb-4 gap-3 md:mb-6"
                }`}
              >
                <GuessInput
                  submitInline
                  remainingGuesses={MAX_GUESSES - state.guessesUsed}
                  onSubmit={handleGuessSubmit}
                  onLayoutBreathingChange={onLayoutBreathingChange}
                  placeholder="Name the film..."
                  aria-label="Guess the movie"
                  disabled={wrongGuessFlash}
                  duplicateSignal={duplicateSignal}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-col items-center">
        <div className="motion-safe:animate-[fadeIn_0.35s_ease-out_80ms_both] motion-reduce:animate-none flex w-full flex-col items-center">
          <hr
            className={`w-full max-w-md shrink-0 border-0 border-t border-solid border-[#1a1a1a] ${
              relaxedVisual ? "my-4 md:my-9" : "my-4 md:my-6"
            }`}
          />

          <GameHintCarousel
            movie={state.movie}
            displayedHintLevel={displayedHintLevel}
            carouselIndex={carouselIndex}
            carouselTransitionMs={carouselTransitionMs}
            carouselTransitionEasing={carouselTransitionEasing}
            hintRevealPhase={hintRevealPhase}
            slideOutHintText={slideOutHintText}
            sprocketsRunning={sprocketsRunning}
            isDesktop={isDesktop}
            relaxedVisual={relaxedVisual}
            onPrevHint={goToPrevHint}
            onNextHint={goToNextHint}
            onPointerDown={handleHintPointerDown}
            onPointerMove={handleHintPointerMove}
            onPointerUp={handleHintPointerUp}
            onPointerCancel={handleHintPointerCancel}
          />

          <WrongGuessHistoryStrip
            guessHistory={state.guessHistory}
            relaxedVisual={relaxedVisual}
          />
        </div>
      </div>
    </div>
  );
}
