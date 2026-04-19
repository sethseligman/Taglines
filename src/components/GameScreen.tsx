"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { HintLevel } from "@/types/movie";
import type { Movie } from "@/types/movie";
import { MAX_GUESSES } from "@/types/movie";
import { getDailyMovie, getRandomPracticeMovie } from "@/actions/movies";
import { getTodayKey } from "@/data/movies";
import { SAMPLE_MOVIES } from "@/data/movies";
import { useGameState } from "@/hooks/useGameState";
import { FONT_PLAYFAIR } from "@/lib/fontStacks";
import { narratorResultLine } from "@/lib/narratorResult";
import { buildShareText, copyShareToClipboard } from "@/lib/share";
import {
  type DailyCompletionResult,
  getDailyCompletionResult,
  getPlayCount,
  getStoredBestStreak,
  getStoredStreak,
  getWinCount,
} from "@/lib/storage";
import { GuessInput } from "./GuessInput";
import { HintReveal } from "./HintReveal";
import { ResultModal } from "./ResultModal";

type Mode = "daily" | "practice";

interface TmdbMovieMeta {
  movieImdbId: string | null;
  imdbRating: number | null;
  director: { name: string; imdbId: string | null } | null;
  cast: Array<{ name: string; imdbId: string | null }>;
}

const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const idleMessages = [
  "No idea? No one's watching. Just hit Guess.",
  "Take the hint. We won't tell anyone.",
  "Stuck? Submit empty. It'll be our secret.",
  "The hints are right there. It's okay.",
  "Even Ebert needed a second opinion sometimes.",
  "An empty guess never hurt anyone. Except your ego.",
  "Hit Guess. The movie isn't going to guess itself.",
  "You can always blame the tagline.",
  "No shame in the hint game.",
  "Submit empty. The algorithm won't judge you.",
];

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

function formatCountdownToLocalMidnight(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const ms = Math.max(0, next.getTime() - now.getTime());
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function GameScreen() {
  const [mode, setMode] = useState<Mode>("daily");
  const [dailyPayload, setDailyPayload] = useState<{ movie: Movie; dateKey: string } | null>(null);
  const [dailyFailed, setDailyFailed] = useState(false);
  const [practiceMovie, setPracticeMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [dailyCompletion, setDailyCompletion] = useState<DailyCompletionResult | null>(null);
  const [countdown, setCountdown] = useState(() => formatCountdownToLocalMidnight());
  const [copied, setCopied] = useState(false);
  const [completionPosterError, setCompletionPosterError] = useState(false);
  const [completionTmdbMeta, setCompletionTmdbMeta] = useState<TmdbMovieMeta | null>(null);
  const dateKeyForDaily = getTodayKey();

  const stageRef = useRef<HTMLDivElement>(null);
  const prevGuessLenRef = useRef(0);
  const [showFloatingYear, setShowFloatingYear] = useState(false);
  const yearFloatTriggeredRef = useRef(false);
  const yearFloatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** UI-only: which revealed clue (0 .. hintLevel-1) is shown. */
  const [currentClueIndex, setCurrentClueIndex] = useState(0);
  const prevHintLevelForCluesRef = useRef(0);

  /** Fixed header + tagline: height for scroll spacer; visualViewport offset for iOS keyboard. */
  const topChromeRef = useRef<HTMLDivElement>(null);
  const [topChromeHeight, setTopChromeHeight] = useState(0);
  const [visualViewportOffset, setVisualViewportOffset] = useState(0);
  /** More vertical rhythm when guess field is idle; compacts when the field is focused (keyboard). */
  const [playLayoutRelaxed, setPlayLayoutRelaxed] = useState(true);
  /** Tailwind `md` — desktop uses classic static layout; mobile keeps keyboard-optimized chrome. */
  const [isDesktop, setIsDesktop] = useState(false);

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
  const [idleTooltipVisible, setIdleTooltipVisible] = useState(false);
  const [idleTooltipMessage, setIdleTooltipMessage] = useState("");
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleGameRef = useRef({ status: state.status, guessesUsed: state.guessesUsed });
  idleGameRef.current = { status: state.status, guessesUsed: state.guessesUsed };
  const played = getPlayCount();
  const wins = getWinCount();
  const streak = getStoredStreak();
  const bestStreak = getStoredBestStreak();
  const winPct = played > 0 ? Math.round((100 * wins) / played) : 0;

  const completionShareText = useMemo(() => {
    if (!dailyCompletion) return "";
    return buildShareText({
      movie,
      hintLevel: Math.min(Math.max(dailyCompletion.guessesUsed - 1, 0), 4) as HintLevel,
      guessesUsed: dailyCompletion.guessesUsed,
      status: dailyCompletion.status,
      guessHistory: Array.from({ length: dailyCompletion.guessesUsed }, () => ""),
      isDaily: true,
      dateKey: dailyCompletion.dateKey,
      didYouMean: null,
      submitMessage: null,
    });
  }, [dailyCompletion, movie]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport || isDesktop) return;
    const vv = window.visualViewport;
    const sync = () => {
      setVisualViewportOffset(vv.offsetTop);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [isDesktop]);

  useEffect(() => {
    if (!dailyCompletion?.movieTitle || !dailyCompletion.movieYear) {
      setCompletionTmdbMeta(null);
      return;
    }
    let cancelled = false;
    setCompletionTmdbMeta(null);
    const title = encodeURIComponent(dailyCompletion.movieTitle);
    const year = encodeURIComponent(String(dailyCompletion.movieYear));
    const load = async () => {
      try {
        const res = await fetch(`/api/tmdb-movie-meta?title=${title}&year=${year}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as ({ ok: true } & TmdbMovieMeta) | { ok?: false };
        if (!cancelled && data.ok) {
          setCompletionTmdbMeta({
            movieImdbId: data.movieImdbId ?? null,
            imdbRating: typeof data.imdbRating === "number" ? data.imdbRating : null,
            director: data.director ?? null,
            cast: Array.isArray(data.cast) ? data.cast.slice(0, 3) : [],
          });
        }
      } catch {
        // Graceful fallback: keep base completion tile.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [dailyCompletion?.movieTitle, dailyCompletion?.movieYear]);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (isDesktop) {
      setVisualViewportOffset(0);
      return;
    }
    const el = topChromeRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setTopChromeHeight(el.getBoundingClientRect().height);
    });
    ro.observe(el);
    setTopChromeHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [movie.title, mode, dailyCompletion, showFloatingYear, state.status, isDesktop]);

  useEffect(() => {
    if (mode !== "daily") {
      setDailyCompletion(null);
      return;
    }
    setDailyCompletion(getDailyCompletionResult(dateKey));
  }, [mode, dateKey]);

  useEffect(() => {
    if (mode !== "daily") return;
    const isOver = state.status === "won" || state.status === "lost";
    if (!isOver) return;
    setDailyCompletion(getDailyCompletionResult(dateKey));
  }, [mode, state.status, state.guessesUsed, dateKey]);

  useEffect(() => {
    if (!dailyCompletion || mode !== "daily") return;
    const tick = () => setCountdown(formatCountdownToLocalMidnight());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [dailyCompletion, mode]);

  useEffect(() => {
    setCompletionPosterError(false);
  }, [dailyCompletion?.dateKey]);

  useEffect(() => {
    setResultDismissed(false);
    setCurrentClueIndex(0);
    prevHintLevelForCluesRef.current = 0;
  }, [movie.title, dateKey]);

  useEffect(() => {
    setPlayLayoutRelaxed(true);
  }, [movie.title, dateKey]);

  useEffect(() => {
    if (state.status !== "playing") setPlayLayoutRelaxed(true);
  }, [state.status]);

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

  const clearIdleTooltipTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const armIdleTooltipTimer = useCallback(() => {
    clearIdleTooltipTimer();
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      const { status, guessesUsed } = idleGameRef.current;
      if (status !== "playing" || guessesUsed < 1) return;
      setIdleTooltipMessage(idleMessages[Math.floor(Math.random() * idleMessages.length)] ?? "");
      setIdleTooltipVisible(true);
    }, 20000);
  }, [clearIdleTooltipTimer]);

  const handleGuessInputActivity = useCallback(() => {
    setIdleTooltipVisible(false);
    armIdleTooltipTimer();
  }, [armIdleTooltipTimer]);

  useEffect(() => {
    if (state.status !== "playing" || state.guessesUsed < 1) {
      setIdleTooltipVisible(false);
      clearIdleTooltipTimer();
      return;
    }
    armIdleTooltipTimer();
    return () => clearIdleTooltipTimer();
  }, [state.status, state.guessesUsed, armIdleTooltipTimer, clearIdleTooltipTimer]);

  const handleShareCompletion = useCallback(async () => {
    if (!completionShareText) return;
    const ok = await copyShareToClipboard(completionShareText);
    setCopied(ok);
    if (ok) {
      setTimeout(() => setCopied(false), 2000);
    }
  }, [completionShareText]);

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

  const relaxedVisual = isDesktop || playLayoutRelaxed;
  const motionPad = !isDesktop ? "transition-[padding] duration-300 ease-out" : "";
  const motionMargin = !isDesktop ? "transition-[margin] duration-300 ease-out" : "";
  const motionGap = !isDesktop ? "transition-[gap] duration-300 ease-out" : "";

  const topChromeStyle: CSSProperties = isDesktop
    ? {
        position: "relative",
        zIndex: 30,
        background: "#080808",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }
    : {
        position: "fixed",
        left: 0,
        right: 0,
        top: 0,
        zIndex: 30,
        background: "#080808",
        paddingTop: "env(safe-area-inset-top, 0px)",
        transform: `translate3d(0, ${visualViewportOffset}px, 0)`,
        willChange: "transform",
      };

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

  if (mode === "daily" && dailyCompletion) {
    const completionImdbUrl = completionTmdbMeta?.movieImdbId
      ? `https://www.imdb.com/title/${completionTmdbMeta.movieImdbId}`
      : null;
    const completionMetaLine =
      completionTmdbMeta?.imdbRating !== null && completionTmdbMeta?.imdbRating !== undefined
        ? `${dailyCompletion.movieYear} · ${dailyCompletion.movieGenre} · ⭐ ${completionTmdbMeta.imdbRating.toFixed(1)}`
        : `${dailyCompletion.movieYear} · ${dailyCompletion.movieGenre}`;
    return (
      <div className="relative min-h-screen w-full overflow-hidden bg-[#080808] text-foreground">
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse 200px 500px at 50% -5%, rgba(201,169,110,0.04) 0%, transparent 70%)",
          }}
        />
        <div className="relative z-10 flex min-h-screen flex-col">
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
                  className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-foreground transition md:px-4 md:py-2 md:text-sm"
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setMode("practice")}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground/80 md:px-4 md:py-2 md:text-sm"
                >
                  Practice
                </button>
              </div>
            </div>
          </header>
          <main className="flex flex-1 flex-col items-center justify-start px-5 py-4 md:px-8">
            <div className="w-full max-w-md text-center">
              <div className="mx-auto mt-2 w-full">
                {completionImdbUrl ? (
                  <div className="relative rounded-md border border-[#1e1e1e] bg-[#111] px-3 py-3">
                    <a
                      href={completionImdbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 z-0"
                      aria-label={`View ${dailyCompletion.movieTitle} on IMDb`}
                    />
                    <div className="relative z-10 flex w-full flex-row items-start gap-3 text-left">
                      {dailyCompletion.posterUrl && !completionPosterError ? (
                        <img
                          src={dailyCompletion.posterUrl}
                          alt=""
                          width={84}
                          height={124}
                          className="block shrink-0 object-cover"
                          style={{ width: 84, height: 124, borderRadius: 6 }}
                          onError={() => setCompletionPosterError(true)}
                        />
                      ) : (
                        <div
                          className="shrink-0 bg-[#161616]"
                          style={{ width: 84, height: 124, borderRadius: 6, border: "1px solid #222" }}
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-bold leading-tight text-[#f0ede6]"
                          style={{ fontFamily: FONT_PLAYFAIR, fontSize: "1.12rem", lineHeight: 1.15 }}
                        >
                          {dailyCompletion.movieTitle}
                        </p>
                        <p
                          className="mt-1 text-[#6b6860]"
                          style={{ fontFamily: '"DM Sans", sans-serif', fontSize: "0.74rem", lineHeight: 1.3 }}
                        >
                          {completionMetaLine}
                        </p>
                        <p
                          className="mt-2.5 italic leading-snug text-[#d7d3c8]"
                          style={{ fontFamily: FONT_PLAYFAIR, fontSize: "1.03rem" }}
                        >
                          {movie.officialTagline}
                        </p>
                        {completionTmdbMeta?.director?.name && completionTmdbMeta.director.imdbId ? (
                          <p className="mt-1.5 text-[#6b6860]" style={{ fontFamily: '"DM Sans", sans-serif', fontSize: "0.72rem" }}>
                            🎬{" "}
                            <a
                              href={`https://www.imdb.com/name/${completionTmdbMeta.director.imdbId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative z-20 underline"
                            >
                              {completionTmdbMeta.director.name}
                            </a>
                          </p>
                        ) : null}
                        {completionTmdbMeta?.cast?.length ? (
                          <p className="mt-1.5 text-[#6b6860]" style={{ fontFamily: '"DM Sans", sans-serif', fontSize: "0.72rem", lineHeight: 1.35 }}>
                            {completionTmdbMeta.cast.map((actor, idx) => (
                              <span key={`${actor.name}-${idx}`}>
                                {actor.imdbId ? (
                                  <a
                                    href={`https://www.imdb.com/name/${actor.imdbId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="relative z-20 underline"
                                  >
                                    {actor.name}
                                  </a>
                                ) : (
                                  actor.name
                                )}
                                {idx < completionTmdbMeta.cast.length - 1 ? " · " : ""}
                              </span>
                            ))}
                          </p>
                        ) : null}
                        <a
                          href={completionImdbUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative z-20 mt-1.5 inline-block text-[#6b6860] underline"
                          style={{ fontFamily: '"DM Sans", sans-serif', fontSize: "0.72rem" }}
                        >
                          View on IMDb →
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex w-full flex-row items-start gap-3 rounded-md border border-[#1e1e1e] bg-[#111] px-3 py-3 text-left">
                    {dailyCompletion.posterUrl && !completionPosterError ? (
                      <img
                        src={dailyCompletion.posterUrl}
                        alt=""
                        width={84}
                        height={124}
                        className="block shrink-0 object-cover"
                        style={{ width: 84, height: 124, borderRadius: 6 }}
                        onError={() => setCompletionPosterError(true)}
                      />
                    ) : (
                      <div
                        className="shrink-0 bg-[#161616]"
                        style={{ width: 84, height: 124, borderRadius: 6, border: "1px solid #222" }}
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className="font-bold leading-tight text-[#f0ede6]"
                        style={{ fontFamily: FONT_PLAYFAIR, fontSize: "1.12rem", lineHeight: 1.15 }}
                      >
                        {dailyCompletion.movieTitle}
                      </p>
                      <p
                        className="mt-1 text-[#6b6860]"
                        style={{ fontFamily: '"DM Sans", sans-serif', fontSize: "0.74rem", lineHeight: 1.3 }}
                      >
                        {dailyCompletion.movieYear} · {dailyCompletion.movieGenre}
                      </p>
                      <p
                        className="mt-2.5 italic leading-snug text-[#d7d3c8]"
                        style={{ fontFamily: FONT_PLAYFAIR, fontSize: "1.03rem" }}
                      >
                        {movie.officialTagline}
                      </p>
                    </div>
                  </div>
                )}
                <div className="mt-4 w-full border-t" style={{ borderColor: "#1e1e1e" }} />
              </div>
              <p
                className="mt-8 font-normal italic leading-none text-[#c9a96e]"
                style={{ fontFamily: FONT_PLAYFAIR, fontSize: "2.75rem" }}
              >
                {narratorResultLine(dailyCompletion.status, dailyCompletion.guessesUsed)}
              </p>
              <p className="mt-3 text-[#f0ede6]" style={{ fontFamily: '"DM Sans", sans-serif', fontSize: "1rem" }}>
                You've already played today
              </p>
              <p className="mt-2 text-[#6b6860]" style={{ fontFamily: '"DM Sans", sans-serif', fontSize: "0.78rem" }}>
                Next tagline in {countdown}
              </p>

              <div className="mt-8 grid w-full grid-cols-4 border border-[#222]">
                {[
                  { n: played, l: "Played" },
                  { n: `${winPct}%`, l: "Win %" },
                  { n: streak, l: "Streak" },
                  { n: bestStreak, l: "Best" },
                ].map((cell, i) => (
                  <div
                    key={cell.l}
                    className="flex flex-col items-center justify-center py-3 text-center"
                    style={{ borderLeft: i > 0 ? "1px solid #222" : undefined }}
                  >
                    <span
                      className="font-bold text-[#f0ede6]"
                      style={{ fontFamily: '"DM Sans", sans-serif', fontSize: "1.35rem" }}
                    >
                      {cell.n}
                    </span>
                    <span
                      className="mt-1 uppercase tracking-[0.06em] text-[#6b6860]"
                      style={{ fontFamily: '"DM Sans", sans-serif', fontSize: "0.65rem" }}
                    >
                      {cell.l}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={handleShareCompletion}
                  className="w-full rounded-lg bg-[#c9a96e] py-3 font-bold text-black transition hover:bg-[#d4b377] active:scale-[0.99]"
                  style={{ fontFamily: '"DM Sans", sans-serif' }}
                >
                  {copied ? "Copied" : "Share today's result"}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative min-h-screen w-full bg-[#080808] text-foreground ${isDesktop ? "overflow-x-hidden" : "overflow-hidden"}`}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 200px 500px at 50% -5%, rgba(201,169,110,0.04) 0%, transparent 70%)",
        }}
      />

      <div
        ref={stageRef}
        className={
          isDesktop
            ? "relative flex min-h-screen w-full flex-col"
            : "relative flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden"
        }
      >
        <div
          className={
            isDesktop
              ? "relative z-10 flex flex-1 flex-col"
              : "relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden"
          }
        >
          <div ref={topChromeRef} className="shrink-0" style={topChromeStyle}>
            <header
              className={`w-full shrink-0 px-5 md:px-8 ${motionPad} ${
                relaxedVisual ? "pb-3 pt-4 md:pb-3 md:pt-5" : "pb-2 pt-3"
              }`}
            >
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
            <section className="relative mx-auto w-full max-w-lg px-1">
              <div
                className={`relative ${motionPad} ${
                  relaxedVisual ? "pb-5 pt-2 md:pb-6 md:pt-2" : "pb-2 pt-0.5 md:pb-4 md:pt-1"
                }`}
              >
                {showFloatingYear && (
                  <div
                    className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
                    aria-hidden
                  >
                    <div className="-translate-y-2 md:-translate-y-3">
                      <span
                        className="game-floating-year select-none"
                        style={{
                          display: "inline-block",
                          fontFamily: FONT_PLAYFAIR,
                          fontStyle: "italic",
                          fontWeight: 700,
                          letterSpacing: "-0.05em",
                          lineHeight: 0.88,
                          whiteSpace: "nowrap",
                          color: "rgba(201, 169, 110, 0.3)",
                          textShadow:
                            "0 0 100px rgba(201, 169, 110, 0.45), 0 0 36px rgba(201, 169, 110, 0.28), 0 2px 16px rgba(0, 0, 0, 0.65)",
                          fontSize: "clamp(4.75rem, min(62vw, 10rem), 10rem)",
                          animation: "yearDrift 7s ease-in-out forwards",
                        }}
                      >
                        {state.movie.year}
                      </span>
                    </div>
                  </div>
                )}
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 z-0"
                  style={{
                    width: "min(86vw, 620px)",
                    height: "min(48vw, 300px)",
                    transform: "translate(-50%, -50%)",
                    background:
                      "radial-gradient(ellipse 60% 46% at 50% 50%, rgba(201,169,110,0.24) 0%, rgba(201,169,110,0.11) 32%, rgba(201,169,110,0.04) 55%, transparent 76%)",
                    filter: "blur(10px)",
                  }}
                  aria-hidden
                />
                <div className="relative z-10 w-full">
                  <HintReveal
                    movie={state.movie}
                    hintLevel={0}
                    className={`w-full [&_p]:!italic ${motionMargin} ${
                      relaxedVisual
                        ? "[&_p]:!text-[1.45rem] [&_p]:!leading-[1.45] md:[&_p]:!text-[1.85rem] md:[&_p]:!leading-[1.52] [&>div:last-child]:!mt-5 md:[&>div:last-child]:!mt-8"
                        : "[&_p]:!text-[1.38rem] [&_p]:!leading-[1.38] md:[&_p]:!text-[1.75rem] md:[&_p]:!leading-[1.5] [&>div:last-child]:!mt-3 md:[&>div:last-child]:!mt-6"
                    }`}
                  />
                </div>
              </div>
            </section>
          </div>

          {!isDesktop && (
            <div className="shrink-0" style={{ height: Math.max(topChromeHeight, 1) }} aria-hidden />
          )}

          <main
            className={
              isDesktop
                ? `flex flex-1 flex-col justify-center px-5 pb-12 md:px-8 ${motionPad} ${relaxedVisual ? "pt-5 md:pt-7" : "pt-2"}`
                : `flex min-h-0 flex-1 flex-col justify-center overflow-y-auto overscroll-contain px-5 pb-12 md:px-8 ${motionPad} ${relaxedVisual ? "pt-5 md:pt-7" : "pt-2"}`
            }
          >
            <div className="mx-auto flex w-full max-w-lg flex-col items-center">
            {state.status === "playing" && (
              <>
                <div
                  className={`relative flex w-full max-w-md shrink-0 flex-col ${motionGap} ${motionMargin} ${
                    relaxedVisual ? "mb-12 gap-5 md:mb-14 md:gap-6" : "mb-8 gap-3"
                  }`}
                >
                  {idleTooltipVisible && state.status === "playing" && (
                    <p
                      className="pointer-events-none absolute left-0 right-0 z-20 text-center italic"
                      style={{
                        bottom: "100%",
                        marginBottom: 6,
                        fontSize: "0.75rem",
                        color: "#6B6860",
                        animation: "fadeIn 0.35s ease-out",
                      }}
                    >
                      {idleTooltipMessage}
                    </p>
                  )}
                  <GuessInput
                    submitInline
                    remainingGuesses={MAX_GUESSES - state.guessesUsed}
                    onSubmit={handleGuessSubmit}
                    onInputValueChange={handleGuessInputActivity}
                    onLayoutBreathingChange={isDesktop ? undefined : setPlayLayoutRelaxed}
                    placeholder="Name a film..."
                    aria-label="Guess the movie"
                  />
                  {state.submitMessage && (
                    <p className="text-center text-sm text-gold/90">{state.submitMessage}</p>
                  )}
                  {state.didYouMean && (
                    <p className="text-center text-sm text-gold/90">
                      Did you mean <strong className="text-gold">{state.didYouMean}</strong>?
                    </p>
                  )}
                </div>

                <hr
                  className={`w-full max-w-md shrink-0 border-0 border-t border-solid border-[#1a1a1a] ${motionMargin} ${
                    relaxedVisual ? "my-10 md:my-12" : "my-8"
                  }`}
                />

                <section
                  className={`flex w-full max-w-md shrink-0 flex-col items-center ${motionGap} ${
                    relaxedVisual ? "gap-5 md:gap-6" : "gap-3"
                  }`}
                >
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
                          onPointerDown={(e) => {
                            if (!revealed) return;
                            // Avoid moving focus from the guess field so the mobile keyboard stays up.
                            e.preventDefault();
                            // Some environments still omit `click` after preventDefault; set clue here too.
                            setCurrentClueIndex(i);
                          }}
                          onClick={() => {
                            if (!revealed) return;
                            setCurrentClueIndex(i);
                            if (!isDesktop) {
                              requestAnimationFrame(() => {
                                document.getElementById("guess-input")?.focus({ preventScroll: true });
                              });
                            }
                          }}
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
                        className="[&_p]:!text-[1.12rem] [&_p]:!leading-[1.62] md:[&_p]:!text-[1.16rem] md:[&_p]:!leading-[1.64]"
                        movie={state.movie}
                        hintLevel={(currentClueIndex + 1) as HintLevel}
                      />
                    ) : null}
                  </div>
                </section>
              </>
            )}

            {state.guessHistory.length > 0 && state.status === "playing" && (
              <div
                className={`${motionMargin} ${relaxedVisual ? "mt-12 md:mt-14" : "mt-8"}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  alignItems: "flex-start",
                  padding: "0 1.5rem",
                  width: "100%",
                }}
              >
                {state.guessHistory.map((g, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5"
                    style={{
                      opacity: 0.75,
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
                      {g === "" ? "\u00a0" : g}
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
