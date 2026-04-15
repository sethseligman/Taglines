"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Movie } from "@/types/movie";
import { MAX_GUESSES } from "@/types/movie";
import type { HintLevel } from "@/types/movie";
import { getDidYouMean, isGuessCorrect, normalizeForComparison } from "@/lib/answerNormalize";
import {
  appendStoredResult,
  getLastPlayedDate,
  getStoredStreak,
  setLastPlayedDate,
  setStoredStreak,
} from "@/lib/storage";

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  movie: Movie;
  hintLevel: HintLevel;
  guessesUsed: number;
  status: GameStatus;
  guessHistory: string[];
  isDaily: boolean;
  dateKey: string;
  /** When last guess was wrong but very close; show "Did you mean X?" */
  didYouMean: string | null;
  /** Transient inline submission feedback (e.g., duplicate guess). */
  submitMessage: string | null;
}

function isCorrectGuess(guess: string, movie: Movie): boolean {
  return isGuessCorrect(guess, movie.acceptedAnswers, movie.title);
}

export function useGameState(
  movie: Movie,
  isDaily: boolean,
  dateKey: string
): {
  state: GameState;
  submitGuess: (guess: string) => void;
  reset: () => void;
} {
  const [state, setState] = useState<GameState>(() => ({
    movie,
    hintLevel: 0,
    guessesUsed: 0,
    status: "playing",
    guessHistory: [],
    isDaily,
    dateKey,
    didYouMean: null,
    submitMessage: null,
  }));
  const submitMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset internal state when movie/dateKey changes (e.g. new day or practice pick)
  useEffect(() => {
    setState({
      movie,
      hintLevel: 0,
      guessesUsed: 0,
      status: "playing",
      guessHistory: [],
      isDaily,
      dateKey,
      didYouMean: null,
      submitMessage: null,
    });
  }, [movie.title, dateKey, isDaily]);

  useEffect(() => {
    return () => {
      if (submitMessageTimeoutRef.current) {
        clearTimeout(submitMessageTimeoutRef.current);
      }
    };
  }, []);

  const submitGuess = useCallback(
    (rawGuess: string) => {
      const guess = rawGuess.trim();
      if (!guess) return;

      let duplicated = false;
      setState((prev) => {
        if (prev.status !== "playing") return prev;
        if (
          prev.guessHistory.some(
            (existingGuess) =>
              normalizeForComparison(existingGuess) === normalizeForComparison(guess)
          )
        ) {
          duplicated = true;
          return { ...prev, submitMessage: "Already guessed" };
        }
        if (isCorrectGuess(guess, prev.movie)) {
          const newGuessesUsed = prev.guessesUsed + 1;
          if (prev.isDaily && getLastPlayedDate() !== prev.dateKey) {
            const streak = getStoredStreak();
            setStoredStreak(streak + 1);
            setLastPlayedDate(prev.dateKey);
            appendStoredResult({
              date: prev.dateKey,
              won: true,
              guessesUsed: newGuessesUsed,
              maxGuesses: MAX_GUESSES,
            });
          }
        return {
          ...prev,
          guessesUsed: newGuessesUsed,
          status: "won" as GameStatus,
          guessHistory: [...prev.guessHistory, guess],
          didYouMean: null,
          submitMessage: null,
        };
        }
        const didYouMean = getDidYouMean(
          guess,
          prev.movie.acceptedAnswers,
          prev.movie.title
        );
        const newHistory = [...prev.guessHistory, guess];
        const newGuessesUsed = prev.guessesUsed + 1;
        const nextHintLevel = Math.min(
          prev.hintLevel + 1,
          4
        ) as HintLevel;
        const isLost = newGuessesUsed >= MAX_GUESSES;
        if (isLost && prev.isDaily && getLastPlayedDate() !== prev.dateKey) {
          setStoredStreak(0);
          setLastPlayedDate(prev.dateKey);
          appendStoredResult({
            date: prev.dateKey,
            won: false,
            guessesUsed: newGuessesUsed,
            maxGuesses: MAX_GUESSES,
          });
        }
        return {
          ...prev,
          hintLevel: nextHintLevel,
          guessesUsed: newGuessesUsed,
          status: isLost ? ("lost" as GameStatus) : "playing",
          guessHistory: newHistory,
          didYouMean: didYouMean ?? null,
          submitMessage: null,
        };
      });
      if (duplicated) {
        if (submitMessageTimeoutRef.current) {
          clearTimeout(submitMessageTimeoutRef.current);
        }
        submitMessageTimeoutRef.current = setTimeout(() => {
          setState((prev) =>
            prev.submitMessage === "Already guessed" ? { ...prev, submitMessage: null } : prev
          );
          submitMessageTimeoutRef.current = null;
        }, 2000);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState({
      movie,
      hintLevel: 0,
      guessesUsed: 0,
      status: "playing",
      guessHistory: [],
      isDaily,
      dateKey,
      didYouMean: null,
      submitMessage: null,
    });
  }, [movie, isDaily, dateKey]);

  return { state, submitGuess, reset };
}
