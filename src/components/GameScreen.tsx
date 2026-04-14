"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HintLevel } from "@/types/movie";
import type { Movie } from "@/types/movie";
import { getAutocompleteTitles, getDailyMovie, getRandomPracticeMovie } from "@/actions/movies";
import { getTodayKey } from "@/data/movies";
import { SAMPLE_MOVIES } from "@/data/movies";
import { useGameState } from "@/hooks/useGameState";
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

  const stageRef = useRef<HTMLDivElement>(null);
  const prevGuessLenRef = useRef(0);
  const [showFloatingYear, setShowFloatingYear] = useState(false);
  const yearFloatTriggeredRef = useRef(false);
  const yearFloatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** UI-only: which revealed clue (0 .. hintLevel-1) is shown. */
  const [currentClueIndex, setCurrentClueIndex] = useState(0);
  const prevHintLevelForCluesRef = useRef(0);

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
    setCurrentClueIndex(0);
    prevHintLevelForCluesRef.current = 0;
  }, [movie.title, dateKey]);

  useEffect(() => {
    const h = state.hintLevel;
    if (h === 0) {
      setCurrentClueIndex(0);
    } else if (h > prevHintLevelForCluesRef.current) {
      setCurrentClueIndex(h - 1);
    } else {
      setCurrentClueIndex((i) => Math.min(i, h - 1));
    }
    prevHintLevelForCluesRef.current = h;
  }, [state.hintLevel]);

  useEffect(() => {
    prevGuessLenRef.current = 0;
  }, [movie.title, dateKey]);

  useEffect(() => {
    yearFloatTriggeredRef.current = false;
    setShowFloatingYear(false);
    if (yearFloatTimeoutRef.current) {
      clearTimeout(yearFloatTimeoutRef.current);
      yearFloatTimeoutRef.current = null;
    }
  }, [movie.title, dateKey]);

  useEffect(() => {
    if (state.guessesUsed !== 2 || yearFloatTriggeredRef.current) return;
    yearFloatTriggeredRef.current = true;
    setShowFloatingYear(true);
    yearFloatTimeoutRef.current = setTimeout(() => {
      setShowFloatingYear(false);
      yearFloatTimeoutRef.current = null;
    }, 7000);
  }, [state.guessesUsed]);

  useEffect(() => {
    const len = state.guessHistory.length;
    if (len > prevGuessLenRef.current && stageRef.current) {
      stageRef.current.classList.add("flickering");
      window.setTimeout(() => {
        stageRef.current?.classList.remove("flickering");
      }, 400);
    }
    prevGuessLenRef.current = len;
  }, [state.guessHistory.length]);

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
    <div className="relative min-h-screen w-full overflow-hidden bg-[#080808] text-foreground">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 200px 500px at 50% -5%, rgba(201,169,110,0.04) 0%, transparent 70%)",
        }}
      />

      <div ref={stageRef} className="relative flex min-h-screen w-full flex-col">
        <div className="relative z-10 flex min-h-screen flex-1 flex-col">
        <header className="w-full shrink-0 px-5 pt-6 pb-2 md:px-8">
          <div className="mx-auto flex w-full max-w-lg items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
              <span>Tag</span>
              <span className="text-gold">lines</span>
            </h1>
            <div className="flex rounded-lg border border-white/10 bg-[#0f0f0f] p-0.5">
              <button
                type="button"
                onClick={() => setMode("daily")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition md:px-4 md:py-2 md:text-sm ${
                  mode === "daily"
                    ? "bg-white/10 text-foreground"
                    : "text-muted hover:text-foreground/80"
                }`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setMode("practice")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition md:px-4 md:py-2 md:text-sm ${
                  mode === "practice"
                    ? "bg-white/10 text-foreground"
                    : "text-muted hover:text-foreground/80"
                }`}
              >
                Practice
              </button>
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center px-5 pb-12 pt-4 md:px-8">
          <div className="flex w-full max-w-lg flex-1 flex-col items-center">
            <section className="relative flex w-full flex-col items-center px-1 py-12 md:py-16">
              {showFloatingYear && (
                <div
                  className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
                  aria-hidden
                >
                  {/* Nudge up so more of the glyph sits in padding / beside lines (still behind z-10 copy). */}
                  <div className="-translate-y-2 md:-translate-y-3">
                    <span
                      className="game-floating-year select-none"
                      style={{
                        animation: "yearDrift 7s ease-in-out forwards",
                      }}
                    >
                      {state.movie.year}
                    </span>
                  </div>
                </div>
              )}
              <div className="relative z-10 w-full">
                <HintReveal
                  movie={state.movie}
                  hintLevel={0}
                  className="w-full [&_p]:!text-[1.75rem] [&_p]:!italic [&_p]:!leading-[1.5]"
                />
              </div>
            </section>

            {state.status === "playing" && (
              <>
                <div className="mb-8 flex w-full max-w-md shrink-0 items-center justify-center gap-2">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 28,
                        height: 3,
                        borderRadius: 2,
                        background:
                          i < state.guessesUsed ? "#3D1A0A" : i === state.guessesUsed ? "#C9A96E" : "#1a1a1a",
                        boxShadow:
                          i < state.guessesUsed
                            ? "0 0 6px rgba(180,60,10,0.5)"
                            : i === state.guessesUsed
                              ? "0 0 8px rgba(201,169,110,0.6)"
                              : "none",
                        transition: "all 0.3s ease",
                      }}
                    />
                  ))}
                  <span
                    style={{
                      fontFamily: '"DM Sans", sans-serif',
                      fontSize: "0.6rem",
                      color: "#3a3a3a",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginLeft: 6,
                    }}
                  >
                    {5 - state.guessesUsed} left
                  </span>
                </div>

                <div className="flex w-full max-w-md shrink-0 flex-col gap-3">
                  <GuessInput
                    submitInline
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

                <hr className="my-8 w-full max-w-md shrink-0 border-0 border-t border-solid border-[#1a1a1a]" />

                <section className="flex w-full max-w-md shrink-0 flex-col items-center gap-3">
                  <div className="flex items-center justify-center gap-3">
                    {[0, 1, 2, 3].map((i) => {
                      const revealed = i < state.hintLevel;
                      const active = revealed && i === currentClueIndex;
                      const dim = revealed && !active;
                      return (
                        <button
                          key={i}
                          type="button"
                          aria-label={`Show clue ${i + 1}`}
                          aria-current={active ? "true" : undefined}
                          disabled={!revealed}
                          onClick={() => revealed && setCurrentClueIndex(i)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all disabled:cursor-default"
                        >
                          <span
                            className="rounded-full transition-all"
                            style={{
                              width: active ? 10 : 8,
                              height: active ? 10 : 8,
                              backgroundColor: active
                                ? "rgba(201, 169, 110, 0.95)"
                                : dim
                                  ? "rgba(255, 255, 255, 0.22)"
                                  : "#141414",
                              boxShadow: active ? "0 0 10px rgba(201,169,110,0.45)" : "none",
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <div
                    className="flex w-full justify-center px-1"
                    style={{
                      minHeight: 80,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {state.hintLevel >= 1 ? (
                      <HintReveal
                        key={`clue-${currentClueIndex}-${state.hintLevel}`}
                        className="[&_p]:!text-[0.95rem] md:[&_p]:!text-[0.95rem]"
                        movie={state.movie}
                        hintLevel={(currentClueIndex + 1) as HintLevel}
                      />
                    ) : null}
                  </div>
                </section>
              </>
            )}

            {state.guessHistory.length > 0 && state.status === "playing" && (
              <div className="mt-8 flex w-full max-w-md flex-col gap-3">
                {state.guessHistory.map((g, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5"
                    style={{
                      opacity: 0.45,
                      transform: i % 2 === 0 ? "rotate(-0.4deg)" : "rotate(0.3deg)",
                      alignSelf: i % 2 === 0 ? "flex-start" : "flex-end",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div
                        style={{
                          width: 4,
                          height: 3,
                          borderRadius: 0.5,
                          background: "#0D0D0D",
                          border: "1px solid #2a2a2a",
                        }}
                      />
                      <div
                        style={{
                          width: 4,
                          height: 3,
                          borderRadius: 0.5,
                          background: "#0D0D0D",
                          border: "1px solid #2a2a2a",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontFamily: '"DM Sans", sans-serif',
                        fontSize: "0.65rem",
                        color: "#3a3a3a",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        borderLeft: "1px solid #1e1e1e",
                        borderRight: "1px solid #1e1e1e",
                        padding: "2px 8px",
                        background: "#0f0f0f",
                      }}
                    >
                      {g}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div
                        style={{
                          width: 4,
                          height: 3,
                          borderRadius: 0.5,
                          background: "#0D0D0D",
                          border: "1px solid #2a2a2a",
                        }}
                      />
                      <div
                        style={{
                          width: 4,
                          height: 3,
                          borderRadius: 0.5,
                          background: "#0D0D0D",
                          border: "1px solid #2a2a2a",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {showResult && (
          <ResultModal
            state={state}
            onClose={dismissResultAndReturnToPlay}
            onPlayAgain={dismissResultAndReturnToPlay}
          />
        )}
        </div>
      </div>
    </div>
  );
}
