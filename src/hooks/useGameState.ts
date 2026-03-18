"use client";

import { useCallback, useEffect, useState } from "react";
import type { Movie } from "@/types/movie";
import { MAX_GUESSES } from "@/types/movie";
import { getDidYouMean, isGuessCorrect } from "@/lib/answerNormalize";
import {
  appendStoredResult,
  getLastPlayedDate,
  getStoredStreak,
  setLastPlayedDate,
  setStoredStreak,
} from "@/lib/storage";

export type GameStatus = "playing" | "won" | "lost";

/** Hint levels 1–4 (Year, Genre, Cast, Plot) that the player can reveal manually. 0 = tagline, always visible. */
export type RevealableHintLevel = 1 | 2 | 3 | 4;

export interface GameState {
  movie: Movie;
  /** Which hints (Year, Genre, Cast, Plot) the player has chosen to reveal. Tagline (0) is always visible. */
  revealedHintLevels: RevealableHintLevel[];
  guessesUsed: number;
  status: GameStatus;
  guessHistory: string[];
  isDaily: boolean;
  dateKey: string;
  /** When last guess was wrong but very close; show "Did you mean X?" */
  didYouMean: string | null;
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
  revealHint: (level: RevealableHintLevel) => void;
} {
  const [state, setState] = useState<GameState>(() => ({
    movie,
    revealedHintLevels: [],
    guessesUsed: 0,
    status: "playing",
    guessHistory: [],
    isDaily,
    dateKey,
    didYouMean: null,
  }));

  // Reset internal state when movie/dateKey changes (e.g. new day or practice pick)
  useEffect(() => {
    setState({
      movie,
      revealedHintLevels: [],
      guessesUsed: 0,
      status: "playing",
      guessHistory: [],
      isDaily,
      dateKey,
      didYouMean: null,
    });
  }, [movie.title, dateKey, isDaily]);

  const submitGuess = useCallback(
    (rawGuess: string) => {
      const guess = rawGuess.trim();
      if (!guess) return;

      setState((prev) => {
        if (prev.status !== "playing") return prev;
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
        };
        }
        const didYouMean = getDidYouMean(
          guess,
          prev.movie.acceptedAnswers,
          prev.movie.title
        );
        const newHistory = [...prev.guessHistory, guess];
        const newGuessesUsed = prev.guessesUsed + 1;
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
          guessesUsed: newGuessesUsed,
          status: isLost ? ("lost" as GameStatus) : "playing",
          guessHistory: newHistory,
          didYouMean: didYouMean ?? null,
        };
      });
    },
    []
  );

  const reset = useCallback(() => {
    setState({
      movie,
      revealedHintLevels: [],
      guessesUsed: 0,
      status: "playing",
      guessHistory: [],
      isDaily,
      dateKey,
      didYouMean: null,
    });
  }, [movie, isDaily, dateKey]);

  const revealHint = useCallback((level: RevealableHintLevel) => {
    setState((prev) => {
      if (prev.status !== "playing" || prev.revealedHintLevels.includes(level)) return prev;
      return {
        ...prev,
        revealedHintLevels: [...prev.revealedHintLevels, level].sort((a, b) => a - b),
      };
    });
  }, []);

  return { state, submitGuess, reset, revealHint };
}
