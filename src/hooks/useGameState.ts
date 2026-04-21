"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Movie } from "@/types/movie";
import { MAX_GUESSES } from "@/types/movie";
import type { HintLevel } from "@/types/movie";
import { getDidYouMean, isGuessCorrect, normalizeForComparison } from "@/lib/answerNormalize";
import {
  appendStoredResult,
  getDailyCompletionResult,
  getLastPlayedDate,
  setDailyCompletionResult,
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

const DAILY_PROGRESS_KEY = "taglines-daily-progress";

interface DailyProgressState {
  dateKey: string;
  guessesUsed: number;
  guessHistory: string[];
  hintLevel: HintLevel;
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
  const getInitialState = useCallback((): GameState => {
    const baseState: GameState = {
      movie,
      hintLevel: 0,
      guessesUsed: 0,
      status: "playing",
      guessHistory: [],
      isDaily,
      dateKey,
      didYouMean: null,
      submitMessage: null,
    };
    if (!isDaily || typeof window === "undefined") return baseState;
    try {
      const raw = localStorage.getItem(DAILY_PROGRESS_KEY);
      if (!raw) return baseState;
      const parsed = JSON.parse(raw) as Partial<DailyProgressState> | null;
      if (!parsed) return baseState;
      if (parsed.dateKey !== dateKey) return baseState;
      if (getDailyCompletionResult(dateKey)) return baseState;
      const guessesUsed = typeof parsed.guessesUsed === "number" ? parsed.guessesUsed : 0;
      const hintLevel = typeof parsed.hintLevel === "number" ? parsed.hintLevel : 0;
      const guessHistory = Array.isArray(parsed.guessHistory)
        ? parsed.guessHistory.filter((g): g is string => typeof g === "string")
        : [];
      if (guessesUsed < 0 || guessesUsed >= MAX_GUESSES) return baseState;
      if (hintLevel < 0 || hintLevel > 4) return baseState;
      return {
        ...baseState,
        guessesUsed,
        hintLevel: hintLevel as HintLevel,
        guessHistory,
      };
    } catch {
      return baseState;
    }
  }, [movie, isDaily, dateKey]);

  const [state, setState] = useState<GameState>(() => getInitialState());
  const submitMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset internal state when movie/dateKey changes (e.g. new day or practice pick)
  useEffect(() => {
    setState(getInitialState());
  }, [getInitialState]);

  useEffect(() => {
    if (!state.isDaily || typeof window === "undefined") return;
    if (state.status === "won" || state.status === "lost") {
      localStorage.removeItem(DAILY_PROGRESS_KEY);
      return;
    }
    if (state.guessesUsed < 1) return;
    const progress: DailyProgressState = {
      dateKey: state.dateKey,
      guessesUsed: state.guessesUsed,
      guessHistory: state.guessHistory,
      hintLevel: state.hintLevel,
    };
    localStorage.setItem(DAILY_PROGRESS_KEY, JSON.stringify(progress));
  }, [
    state.isDaily,
    state.status,
    state.guessesUsed,
    state.guessHistory,
    state.hintLevel,
    state.dateKey,
  ]);

  useEffect(() => {
    if (!isDaily || typeof window === "undefined") return;
    const stored = localStorage.getItem(DAILY_PROGRESS_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Partial<DailyProgressState> | null;
      if (!parsed || parsed.dateKey !== dateKey) {
        localStorage.removeItem(DAILY_PROGRESS_KEY);
      }
    } catch {
      localStorage.removeItem(DAILY_PROGRESS_KEY);
    }
  }, [isDaily, dateKey]);

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
      if (!guess) {
        setState((prev) => {
          if (prev.status !== "playing") return prev;
          const newGuessesUsed = prev.guessesUsed + 1;
          const nextHintLevel = Math.min(prev.hintLevel + 1, 4) as HintLevel;
          const isLost = newGuessesUsed >= MAX_GUESSES;
          if (isLost && prev.isDaily) {
            setDailyCompletionResult({
              status: "lost",
              guessesUsed: newGuessesUsed,
              dateKey: prev.dateKey,
              movieTitle: prev.movie.title,
              movieYear: prev.movie.year,
              movieGenre: prev.movie.genre,
              posterUrl: prev.movie.posterUrl ?? null,
            });
          }
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
            guessHistory: [...prev.guessHistory, ""],
            didYouMean: null,
            submitMessage: null,
          };
        });
        return;
      }

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
          if (prev.isDaily) {
            setDailyCompletionResult({
              status: "won",
              guessesUsed: newGuessesUsed,
              dateKey: prev.dateKey,
              movieTitle: prev.movie.title,
              movieYear: prev.movie.year,
              movieGenre: prev.movie.genre,
              posterUrl: prev.movie.posterUrl ?? null,
            });
          }
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
        if (isLost && prev.isDaily) {
          setDailyCompletionResult({
            status: "lost",
            guessesUsed: newGuessesUsed,
            dateKey: prev.dateKey,
            movieTitle: prev.movie.title,
            movieYear: prev.movie.year,
            movieGenre: prev.movie.genre,
            posterUrl: prev.movie.posterUrl ?? null,
          });
        }
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
    if (isDaily && typeof window !== "undefined") {
      localStorage.removeItem(DAILY_PROGRESS_KEY);
    }
  }, [movie, isDaily, dateKey]);

  return { state, submitGuess, reset };
}
