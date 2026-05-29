"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Movie } from "@/types/movie";
import { MAX_GUESSES } from "@/types/movie";
import { useGameState } from "@/hooks/useGameState";
import { useHintCarousel } from "@/hooks/useHintCarousel";
import { useAutoFitFontSize } from "@/hooks/useAutoFitFontSize";
import { GuessInput } from "@/components/GuessInput";
import { HintReveal } from "@/components/HintReveal";
import { WrongGuessFlash } from "@/components/WrongGuessFlash";
import { GameHintCarousel } from "@/components/game/GameHintCarousel";
import { WrongGuessHistoryStrip } from "@/components/game/WrongGuessHistoryStrip";

export interface LegCompletePayload {
  solved: boolean;
  guessesUsed: number;
}

interface ChallengeLegGameProps {
  movie: Movie;
  legSessionKey: string;
  onLegComplete: (result: LegCompletePayload) => void;
  onLayoutBreathingChange?: (relaxed: boolean) => void;
  relaxedVisual?: boolean;
}

export function ChallengeLegGame({
  movie,
  legSessionKey,
  onLegComplete,
  onLayoutBreathingChange,
  relaxedVisual: relaxedVisualProp,
}: ChallengeLegGameProps) {
  const { state, submitGuess } = useGameState(movie, false, legSessionKey);
  const [duplicateSignal, setDuplicateSignal] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const legCompleteFiredRef = useRef(false);
  const taglineContainerRef = useRef<HTMLDivElement>(null);
  const taglineTextRef = useRef<HTMLParagraphElement>(null);

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
    deps: [state.movie.officialTagline, isDesktop],
  });

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    legCompleteFiredRef.current = false;
  }, [legSessionKey]);

  useEffect(() => {
    if (state.status !== "playing") {
      if (legCompleteFiredRef.current) return;
      legCompleteFiredRef.current = true;
      onLegComplete({
        solved: state.status === "won",
        guessesUsed: state.guessesUsed,
      });
      return;
    }
    legCompleteFiredRef.current = false;
  }, [state.status, state.guessesUsed, onLegComplete]);

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

  if (state.status !== "playing") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted">Saving leg…</p>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {hintCarousel.wrongGuessFlash ? (
        <WrongGuessFlash onComplete={hintCarousel.handleWrongGuessFlashComplete} />
      ) : null}

      {hintCarousel.cinematicFocusActive ? (
        <div
          className="pointer-events-none fixed inset-0 z-20"
          style={{ background: "rgba(0,0,0,0.3)" }}
          aria-hidden
        />
      ) : null}

      <section className="relative z-30 mx-auto w-full max-w-lg px-1">
        <div
          className={`relative ${relaxedVisual ? "pb-3 pt-0 md:pb-6 md:pt-2" : "pb-2 pt-0 md:pb-4 md:pt-1"}`}
        >
          <div
            ref={taglineContainerRef}
            className="relative z-10 w-full"
            style={{
              height: taglineThreeLineHeightPx,
              overflow: "hidden",
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
              disabled={hintCarousel.wrongGuessFlash}
              duplicateSignal={duplicateSignal}
            />
          </div>

          <hr
            className={`w-full max-w-md shrink-0 border-0 border-t border-solid border-[#1a1a1a] ${
              relaxedVisual ? "my-4 md:my-9" : "my-4 md:my-6"
            }`}
          />

          <GameHintCarousel
            movie={state.movie}
            displayedHintLevel={hintCarousel.displayedHintLevel}
            carouselIndex={hintCarousel.carouselIndex}
            carouselTransitionMs={hintCarousel.carouselTransitionMs}
            carouselTransitionEasing={hintCarousel.carouselTransitionEasing}
            hintRevealPhase={hintCarousel.hintRevealPhase}
            slideOutHintText={hintCarousel.slideOutHintText}
            sprocketsRunning={hintCarousel.sprocketsRunning}
            isDesktop={hintCarousel.isDesktop}
            relaxedVisual={relaxedVisual}
            onPrevHint={hintCarousel.goToPrevHint}
            onNextHint={hintCarousel.goToNextHint}
            onPointerDown={hintCarousel.handleHintPointerDown}
            onPointerMove={hintCarousel.handleHintPointerMove}
            onPointerUp={hintCarousel.handleHintPointerUp}
            onPointerCancel={hintCarousel.handleHintPointerCancel}
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
