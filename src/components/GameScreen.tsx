"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Movie } from "@/types/movie";
import { getAutocompleteTitles, getDailyMovie, getRandomPracticeMovie } from "@/actions/movies";
import { getTodayKey } from "@/data/movies";
import { SAMPLE_MOVIES } from "@/data/movies";
import { useGameState } from "@/hooks/useGameState";
import { getStoredStreak } from "@/lib/storage";
import { GuessInput } from "./GuessInput";
import { HintReveal } from "./HintReveal";
import { ResultModal } from "./ResultModal";

type Mode = "daily" | "practice";

function getLocalDailyMovie(): { movie: Movie; dateKey: string } {
  const dateKey = getTodayKey();
  const date = new Date(
    parseInt(dateKey.slice(0, 4), 10),
    parseInt(dateKey.slice(5, 7), 10) - 1,
    parseInt(dateKey.slice(8, 10), 10)
  );
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash << 5) - hash + dateKey.charCodeAt(i);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % SAMPLE_MOVIES.length;
  return { movie: SAMPLE_MOVIES[index]!, dateKey };
}

function getLocalRandomMovie(): Movie {
  return SAMPLE_MOVIES[Math.floor(Math.random() * SAMPLE_MOVIES.length)]!;
}

export function GameScreen() {
  const [mode, setMode] = useState<Mode>("daily");
  const [dailyPayload, setDailyPayload] = useState<{ movie: Movie; dateKey: string } | null>(null);
  const [practiceMovie, setPracticeMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [showResultModal, setShowResultModal] = useState(false);
  const dateKeyForDaily = getTodayKey();

  // Load daily movie (from Supabase or fallback to local)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDailyMovie(dateKeyForDaily).then((result) => {
      if (cancelled) return;
      if (result) setDailyPayload(result);
      else setDailyPayload(getLocalDailyMovie());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dateKeyForDaily]);

  // Load initial practice movie
  useEffect(() => {
    let cancelled = false;
    getRandomPracticeMovie().then((m) => {
      if (cancelled) return;
      setPracticeMovie(m ?? getLocalRandomMovie());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { movie, dateKey, isDaily } = useMemo(() => {
    if (mode === "daily") {
      const fallback = getLocalDailyMovie();
      const payload = dailyPayload ?? fallback;
      return { movie: payload.movie, dateKey: payload.dateKey, isDaily: true };
    }
    const pm = practiceMovie ?? getLocalRandomMovie();
    return { movie: pm, dateKey: "practice", isDaily: false };
  }, [mode, dailyPayload, practiceMovie]);

  const { state, submitGuess, reset } = useGameState(movie, isDaily, dateKey);
  const [autocompleteTitles, setAutocompleteTitles] = useState<string[]>([]);

  useEffect(() => {
    getAutocompleteTitles().then(setAutocompleteTitles);
  }, []);

  const handleGuessSubmit = useCallback(
    (value: string) => {
      submitGuess(value);
    },
    [submitGuess]
  );

  useEffect(() => {
    if (state.status === "won" || state.status === "lost")
      setShowResultModal(true);
  }, [state.status]);

  const handlePlayAgain = useCallback(() => {
    setShowResultModal(false);
    if (mode === "practice") {
      getRandomPracticeMovie().then((m) => {
        setPracticeMovie(m ?? getLocalRandomMovie());
      });
    }
    reset();
  }, [mode, reset]);

  const showResult =
    (state.status === "won" || state.status === "lost") && showResultModal;

  if (loading && mode === "daily") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 text-zinc-400">
        <p>Loading today&apos;s movie...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-950 px-4 py-8 text-zinc-100">
      <header className="mb-10 w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Taglines
            </h1>
            {mode === "daily" && getStoredStreak() > 0 && (
              <p className="mt-1 text-sm text-amber-400/90">
                🔥 {getStoredStreak()} day streak
              </p>
            )}
          </div>
          <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setMode("daily")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                mode === "daily"
                  ? "bg-white/15 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setMode("practice")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                mode === "practice"
                  ? "bg-white/15 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Practice
            </button>
          </div>
        </div>
        {mode === "daily" && (
          <p className="text-sm text-zinc-500">
            One movie per day. Can you guess it from the tagline?
          </p>
        )}
        {mode === "practice" && (
          <p className="text-sm text-zinc-500">
            Unlimited rounds with random movies from our collection.
          </p>
        )}
      </header>

      <main className="flex w-full max-w-lg flex-1 flex-col items-center">
        <div className="mb-8 flex w-full flex-col gap-4">
          {[0, 1, 2, 3, 4].map((level) => {
            const show = state.hintLevel >= level;
            if (!show) return null;
            return (
              <HintReveal
                key={level}
                movie={state.movie}
                hintLevel={level as 0 | 1 | 2 | 3 | 4}
                className={level === state.hintLevel ? "ring-1 ring-amber-400/30" : ""}
              />
            );
          })}
        </div>

        {state.status === "playing" && (
          <div className="flex w-full max-w-md flex-col gap-4">
            <GuessInput
              suggestions={autocompleteTitles}
              onSubmit={handleGuessSubmit}
              placeholder="Search movies..."
              aria-label="Guess the movie"
            />
            {state.didYouMean && (
              <p className="text-center text-sm text-amber-400/90">
                Did you mean <strong className="text-amber-300">{state.didYouMean}</strong>?
              </p>
            )}
          </div>
        )}

        {state.guessHistory.length > 0 && state.status === "playing" && (
          <div className="mt-6 w-full max-w-md">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Guesses ({state.guessesUsed}/5)
            </p>
            <ul className="flex flex-wrap gap-2">
              {state.guessHistory.map((g, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-zinc-400"
                >
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      {showResult && (
        <ResultModal
          state={state}
          onClose={() => setShowResultModal(false)}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}
