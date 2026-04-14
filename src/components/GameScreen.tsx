"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Movie } from "@/types/movie";
import { HINT_LABELS } from "@/types/movie";
import { getAutocompleteTitles, getDailyMovie, getRandomPracticeMovie } from "@/actions/movies";
import { getTodayKey } from "@/data/movies";
import { SAMPLE_MOVIES } from "@/data/movies";
import { useGameState } from "@/hooks/useGameState";
import { getStoredStreak } from "@/lib/storage";
import { GuessInput } from "./GuessInput";
import { HintReveal } from "./HintReveal";
import { ResultModal } from "./ResultModal";

type Mode = "daily" | "practice";

const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function getLocalDailyMovie(): { movie: Movie; dateKey: string } {
  const dateKey = getTodayKey();
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
  const [mode, setMode] = useState<Mode>("practice");
  const [dailyPayload, setDailyPayload] = useState<{ movie: Movie; dateKey: string } | null>(null);
  const [dailyFailed, setDailyFailed] = useState(false);
  const [practiceMovie, setPracticeMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [resultDismissed, setResultDismissed] = useState(false);
  const dateKeyForDaily = getTodayKey();

  // Load daily: Supabase schedule only when configured; otherwise local sample fallback.
  useEffect(() => {
    let cancelled = false;
    if (!hasSupabase) {
      setDailyPayload(getLocalDailyMovie());
      setDailyFailed(false);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setDailyFailed(false);
    const load = (retry = false) => {
      getDailyMovie(dateKeyForDaily)
        .then((result) => {
          if (cancelled) return;
          if (result) {
            setDailyPayload(result);
            setDailyFailed(false);
          } else {
            setDailyPayload(null);
            setDailyFailed(true);
          }
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          if (!retry) setTimeout(() => load(true), 400);
          else {
            setDailyPayload(null);
            setDailyFailed(true);
            setLoading(false);
          }
        });
    };
    load();
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
      if (!hasSupabase) {
        const payload = dailyPayload ?? getLocalDailyMovie();
        return { movie: payload.movie, dateKey: payload.dateKey, isDaily: true };
      }
      if (dailyPayload) {
        return { movie: dailyPayload.movie, dateKey: dailyPayload.dateKey, isDaily: true };
      }
      return { movie: SAMPLE_MOVIES[0]!, dateKey: dateKeyForDaily, isDaily: true };
    }
    // Use deterministic placeholder when practice movie not loaded yet (avoids hydration mismatch from Math.random())
    const pm = practiceMovie ?? SAMPLE_MOVIES[0]!;
    return { movie: pm, dateKey: "practice", isDaily: false };
  }, [mode, dailyPayload, practiceMovie, dateKeyForDaily]);

  const { state, submitGuess, reset } = useGameState(movie, isDaily, dateKey);
  const [autocompleteTitles, setAutocompleteTitles] = useState<string[]>([]);

  useEffect(() => {
    getAutocompleteTitles().then(setAutocompleteTitles);
  }, []);

  useEffect(() => {
    setResultDismissed(false);
  }, [movie.title, dateKey]);

  const handleGuessSubmit = useCallback(
    (value: string) => {
      submitGuess(value);
    },
    [submitGuess]
  );

  const dismissResultAndReturnToPlay = useCallback(() => {
    setResultDismissed(false);
    if (mode === "practice") {
      getRandomPracticeMovie().then((m) => {
        setPracticeMovie(m ?? getLocalRandomMovie());
      });
    }
    reset();
  }, [mode, reset]);

  const isGameOver = state.status === "won" || state.status === "lost";
  const showResult = isGameOver && !resultDismissed;

  const practiceLoading = mode === "practice" && practiceMovie === null;
  const dailyUnavailable =
    mode === "daily" && hasSupabase && !loading && (dailyFailed || !dailyPayload);

  if ((loading && mode === "daily") || practiceLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center bg-background px-4 py-8">
        <div className="mb-10 w-full max-w-lg">
          <div className="h-9 w-32 rounded bg-white/10 animate-pulse" />
          <div className="mt-4 h-4 w-64 rounded bg-white/5 animate-pulse" />
        </div>
        <div className="w-full max-w-lg space-y-4">
          <div className="rounded-xl border border-white/10 bg-surface px-6 py-8">
            <div className="mb-2 h-3 w-20 rounded bg-white/10 animate-pulse" />
            <div className="h-5 w-full rounded bg-white/5 animate-pulse" />
            <div className="mt-2 h-4 w-full max-w-[80%] rounded bg-white/5 animate-pulse" />
          </div>
          <div className="h-14 rounded-xl bg-white/5 animate-pulse" />
          <div className="h-14 rounded-xl bg-gold/20 animate-pulse" />
        </div>
      </div>
    );
  }

  if (dailyUnavailable) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12 text-center text-foreground">
        <p className="max-w-md text-lg font-medium text-foreground">Today’s daily couldn’t be loaded.</p>
        <p className="mt-3 max-w-md text-sm text-muted">
          There is no playable movie scheduled for {dateKeyForDaily} in Supabase, or the request failed. Check
          daily_schedule and try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-8 rounded-xl bg-gold/90 px-6 py-3 font-medium text-background transition hover:bg-gold active:scale-[0.99]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-8 text-foreground">
      <header className="mb-10 w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              <span>Tag</span>
              <span className="text-gold">lines</span>
            </h1>
            {mode === "daily" && getStoredStreak() > 0 && (
              <p className="mt-1 text-sm text-gold/90">
                🔥 {getStoredStreak()} day streak
              </p>
            )}
          </div>
          <div className="flex rounded-lg border border-white/10 bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setMode("daily")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                mode === "daily"
                  ? "bg-white/15 text-foreground"
                  : "text-muted hover:text-foreground/80"
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setMode("practice")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                mode === "practice"
                  ? "bg-white/15 text-foreground"
                  : "text-muted hover:text-foreground/80"
              }`}
            >
              Practice
            </button>
          </div>
        </div>
        {mode === "daily" && (
          <p className="text-sm text-muted">
            One movie per day. Can you guess it from the tagline?
          </p>
        )}
        {mode === "practice" && (
          <p className="text-sm text-muted">
            Unlimited rounds with random movies from our collection.
          </p>
        )}
      </header>

      <main className="flex w-full max-w-lg flex-1 flex-col items-center">
        <div className="mb-6 w-full max-w-lg">
          <HintReveal movie={state.movie} hintLevel={0} />
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
              Hints
            </p>
            <div className="flex flex-wrap gap-2">
              {([1, 2, 3, 4] as const).map((level) => {
                const revealed = state.hintLevel >= level;
                const value =
                  level === 1
                    ? String(state.movie.year)
                    : level === 2
                      ? state.movie.genre
                      : level === 3
                        ? state.movie.castHint
                        : state.movie.plotHint;
                return (
                  <span
                    key={level}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      revealed
                        ? "border-gold/40 bg-gold/10 text-gold"
                        : "border-white/10 bg-surface text-muted"
                    }`}
                  >
                    {revealed ? `${HINT_LABELS[level]}: ${value}` : HINT_LABELS[level]}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {state.status === "playing" && (
          <div className="flex w-full max-w-md flex-col gap-4">
            <p className="text-center text-xs text-muted">
              Wrong guesses reveal more clues.
            </p>
            <GuessInput
              suggestions={autocompleteTitles}
              onSubmit={handleGuessSubmit}
              placeholder="Search movies..."
              aria-label="Guess the movie"
            />
            {state.didYouMean && (
              <p className="text-center text-sm text-gold/90">
                Did you mean <strong className="text-gold">{state.didYouMean}</strong>?
              </p>
            )}
            {autocompleteTitles.length === 0 && (
              <p className="text-center text-xs text-muted">
                Type any movie title and press Guess
              </p>
            )}
          </div>
        )}

        {state.guessHistory.length > 0 && state.status === "playing" && (
          <div className="mt-6 w-full max-w-md">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
              Guesses ({state.guessesUsed}/5)
            </p>
            <ul className="flex flex-wrap gap-2">
              {state.guessHistory.map((g, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-muted"
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
          onClose={dismissResultAndReturnToPlay}
          onPlayAgain={dismissResultAndReturnToPlay}
        />
      )}
    </div>
  );
}
