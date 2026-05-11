"use client";

import {
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { HintLevel } from "@/types/movie";
import type { Movie } from "@/types/movie";
import { MAX_GUESSES } from "@/types/movie";
import { getDailyMovie, getRandomPracticeMovie } from "@/actions/movies";
import { getTodayKey } from "@/data/movies";
import { SAMPLE_MOVIES } from "@/data/movies";
import { useGameState } from "@/hooks/useGameState";
import { FONT_DM, FONT_PLAYFAIR } from "@/lib/fontStacks";
import { getHintBodyForLevel } from "@/lib/hintContent";
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
import { WrongGuessFlash } from "./WrongGuessFlash";

const CAROUSEL_MANUAL_MS = 320;
const CAROUSEL_EASING_DEFAULT = "cubic-bezier(0.25, 0, 0.15, 1)";
const CAROUSEL_EASING_SETTLE = "cubic-bezier(0.2, 0, 0, 1)";
const WRONG_GUESS_SLIDE_OUT_MS = 450;
const WRONG_GUESS_BLANK_MS = 1000;
const WRONG_GUESS_FADE_IN_MS = 1200;

type Mode = "daily" | "practice";
type IntroPhase = "lightsDown" | "taglineReveal" | "ready";
const KEY_SPLASHED = "taglines-splashed";
const SPLASH_DISMISSED_EVENT = "taglines:splash-dismissed";

interface TmdbMovieMeta {
  movieImdbId: string | null;
  imdbRating: number | null;
  director: { name: string; imdbId: string | null } | null;
  cast: Array<{ name: string; imdbId: string | null }>;
}

function useAutoFitFontSize(
  textRef: RefObject<HTMLElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  options: { min: number; max: number; deps?: ReadonlyArray<unknown> }
): number {
  const { min, max, deps = [] } = options;
  const [fontSize, setFontSize] = useState(max);

  useLayoutEffect(() => {
    const textEl = textRef.current;
    const containerEl = containerRef.current;
    if (!textEl || !containerEl) return;

    let rafId: number | null = null;

    const fit = () => {
      const t = textRef.current;
      const c = containerRef.current;
      if (!t || !c) return;

      let size = max;
      t.style.fontSize = `${size}px`;

      while (size > min && t.scrollHeight > c.clientHeight) {
        size -= 1;
        t.style.fontSize = `${size}px`;
      }
      console.log(
        `[AutoFit] textLen=${t.textContent?.length ?? 0}, containerH=${c.clientHeight}, finalSize=${size}`
      );

      setFontSize(size);
    };

    const scheduleFit = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fit);
    };

    scheduleFit();

    const ro = new ResizeObserver(() => scheduleFit());
    ro.observe(containerEl);

    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [min, max, ...deps]);

  return fontSize;
}

function AutoFitHintText({
  text,
  isDesktop,
}: {
  text: string;
  isDesktop: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  const fontSize = useAutoFitFontSize(textRef, containerRef, {
    min: isDesktop ? 15 : 13,
    max: isDesktop ? 22 : 18,
    deps: [text, isDesktop],
  });

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 116,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <p
        ref={textRef}
        style={{
          margin: 0,
          color: "#C9B87A",
          fontFamily: FONT_PLAYFAIR,
          fontStyle: "italic",
          fontSize: `${fontSize}px`,
          lineHeight: 1.6,
          textAlign: "center",
          width: "100%",
          maxWidth: "100%",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
        }}
      >
        {text}
      </p>
    </div>
  );
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
  const [dailyCompletionJustAchieved, setDailyCompletionJustAchieved] = useState(false);
  const [splashDismissed, setSplashDismissed] = useState(false);
  const dateKeyForDaily = getTodayKey();

  const stageRef = useRef<HTMLDivElement>(null);
  const prevGuessLenRef = useRef(0);
  /** When false, the next layout pass only seeds prevGuessLen (restored or new game), no ✕ flash. */
  const guessLengthBaselineReadyRef = useRef(false);
  const holdHintUntilFlashCompleteRef = useRef(false);
  const [wrongGuessFlash, setWrongGuessFlash] = useState(false);
  const [displayedHintLevel, setDisplayedHintLevel] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [exitingCarouselIndex, setExitingCarouselIndex] = useState<number | null>(null);
  const [carouselTransitionMs, setCarouselTransitionMs] = useState(500);
  const [carouselTransitionEasing, setCarouselTransitionEasing] = useState(CAROUSEL_EASING_DEFAULT);
  const [introSliding, setIntroSliding] = useState(false);
  const [duplicateSignal, setDuplicateSignal] = useState(0);
  const skipCarouselSyncAfterFlashRef = useRef(false);
  const wrongGuessCompleteRef = useRef({ hintLevel: 0, carouselIndex: 0 });
  const carouselAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const carouselSlideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introSlideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stripIdleResumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintRevealGateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintRevealFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDisplayedHintLevelRef = useRef(0);
  const prevSyncedHintLevelRef = useRef(0);
  const previousCarouselIndexRef = useRef(0);
  const hintSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const hintSwipePointerIdRef = useRef<number | null>(null);
  const hintSwipeLockedRef = useRef(false);
  const exitingDirectionRef = useRef(1);
  const [carouselDirection, setCarouselDirection] = useState(1);
  const [stripMotionMode, setStripMotionMode] = useState<"idle" | "engaging" | "paused">("idle");
  const [hintRevealPhase, setHintRevealPhase] = useState<"normal" | "slideOut" | "blank" | "fadingIn">("normal");
  const [cinematicFocusActive, setCinematicFocusActive] = useState(false);
  const [slideOutHintText, setSlideOutHintText] = useState("");
  const taglineContainerRef = useRef<HTMLDivElement>(null);
  const taglineTextRef = useRef<HTMLParagraphElement>(null);

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

  /** Only changes for a new play session — not when the daily film object loads (title) for the same date. */
  const hintSessionResetKey = mode === "daily" ? `daily:${dateKey}` : `practice:${movie.title}`;

  const { state, submitGuess, reset } = useGameState(movie, isDaily, dateKey);

  /** Guess/hints UI hidden briefly on new session; tagline stays in normal layout (`hintSessionResetKey`), playing-only. */
  const introShownForKeyRef = useRef<string | null>(null);
  const introPhaseStartedAtRef = useRef(0);
  const [introPhase, setIntroPhase] = useState<IntroPhase>("lightsDown");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(KEY_SPLASHED)) {
        setSplashDismissed(true);
        return;
      }
    } catch {
      // If storage is unavailable, defer until splash emits dismissal event.
    }
    const onDismiss = () => setSplashDismissed(true);
    window.addEventListener(SPLASH_DISMISSED_EVENT, onDismiss);
    return () => window.removeEventListener(SPLASH_DISMISSED_EVENT, onDismiss);
  }, []);

  useLayoutEffect(() => {
    const gameplayUiReady =
      !((mode === "daily" && loading) || (mode === "practice" && practiceMovie === null));

    if (!gameplayUiReady || !splashDismissed) {
      return;
    }

    if (state.status !== "playing") {
      setIntroPhase("ready");
      return;
    }
    if (introShownForKeyRef.current === hintSessionResetKey) return;

    introShownForKeyRef.current = hintSessionResetKey;

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIntroPhase("ready");
      return;
    }

    introPhaseStartedAtRef.current = Date.now();
    setIntroPhase("lightsDown");
  }, [hintSessionResetKey, state.status, mode, loading, practiceMovie, splashDismissed]);

  /** Intro sequence: lights down -> tagline reveal -> ready (input fades in). */
  useEffect(() => {
    if (introPhase !== "lightsDown") return;
    introPhaseStartedAtRef.current = Date.now();
    const id = window.setTimeout(() => setIntroPhase("taglineReveal"), 800);
    return () => clearTimeout(id);
  }, [introPhase]);

  useEffect(() => {
    if (introPhase !== "taglineReveal") return;
    introPhaseStartedAtRef.current = Date.now();
    const id = window.setTimeout(() => setIntroPhase("ready"), 2800);
    return () => clearTimeout(id);
  }, [introPhase]);

  useEffect(() => {
    if (introPhase === "ready" || state.status !== "playing") return;
    const skipIntro = () => {
      // Ignore the opening tap/click that started the session.
      if (Date.now() - introPhaseStartedAtRef.current < 250) return;
      setIntroPhase("ready");
    };
    window.addEventListener("pointerdown", skipIntro, { passive: true });
    window.addEventListener("keydown", skipIntro);
    return () => {
      window.removeEventListener("pointerdown", skipIntro);
      window.removeEventListener("keydown", skipIntro);
    };
  }, [introPhase, state.status]);

  const gameStatusRef = useRef(state.status);
  gameStatusRef.current = state.status;
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
    if (mode !== "daily") {
      setDailyCompletion(null);
      setDailyCompletionJustAchieved(false);
      return;
    }
    setDailyCompletion(getDailyCompletionResult(dateKey));
    setDailyCompletionJustAchieved(false);
  }, [mode, dateKey]);

  useEffect(() => {
    if (mode !== "daily") return;
    const isOver = state.status === "won" || state.status === "lost";
    if (!isOver) return;
    if (state.status === "lost") {
      const timeoutId = window.setTimeout(() => {
        setDailyCompletion(getDailyCompletionResult(dateKey));
        setDailyCompletionJustAchieved(true);
      }, 1300);
      return () => window.clearTimeout(timeoutId);
    }
    setDailyCompletion(getDailyCompletionResult(dateKey));
    setDailyCompletionJustAchieved(true);
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
    if (introSlideTimeoutRef.current) {
      clearTimeout(introSlideTimeoutRef.current);
      introSlideTimeoutRef.current = null;
    }
    if (stripIdleResumeTimeoutRef.current) {
      clearTimeout(stripIdleResumeTimeoutRef.current);
      stripIdleResumeTimeoutRef.current = null;
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
    setExitingCarouselIndex(null);
    exitingDirectionRef.current = 1;
    setCarouselDirection(1);
    setCarouselTransitionMs(500);
    setCarouselTransitionEasing(CAROUSEL_EASING_DEFAULT);
    setIntroSliding(false);
    setStripMotionMode("idle");
    setHintRevealPhase("normal");
    setCinematicFocusActive(false);
    setSlideOutHintText("");
    prevDisplayedHintLevelRef.current = 0;
    prevSyncedHintLevelRef.current = 0;
    previousCarouselIndexRef.current = 0;
    setDailyCompletionJustAchieved(false);
  }, [hintSessionResetKey]);

  useLayoutEffect(() => {
    guessLengthBaselineReadyRef.current = false;
  }, [hintSessionResetKey]);

  useEffect(() => {
    if (wrongGuessFlash || holdHintUntilFlashCompleteRef.current) return;
    setDisplayedHintLevel(state.hintLevel);
    if (!skipCarouselSyncAfterFlashRef.current) {
      if (state.hintLevel !== prevSyncedHintLevelRef.current) {
        const targetIndex = Math.max(0, state.hintLevel - 1);
        if (targetIndex > carouselIndex) {
          if (carouselAdvanceTimeoutRef.current) {
            clearTimeout(carouselAdvanceTimeoutRef.current);
            carouselAdvanceTimeoutRef.current = null;
          }
          let nextIndex = carouselIndex + 1;
          const runStep = () => {
            const isFinalStep = nextIndex === targetIndex;
            exitingDirectionRef.current = 1;
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
          // New hint unlocks should always advance like film moving forward.
          exitingDirectionRef.current = 1;
          setCarouselDirection(1);
          setCarouselTransitionEasing(CAROUSEL_EASING_SETTLE);
          setCarouselTransitionMs(500);
          setCarouselIndex(targetIndex);
        }
      }
    }
    prevSyncedHintLevelRef.current = state.hintLevel;
  }, [state.hintLevel, wrongGuessFlash, carouselIndex]);

  useEffect(() => {
    if (state.submitMessage === "Already guessed") {
      setDuplicateSignal((n) => n + 1);
    }
  }, [state.submitMessage]);

  useEffect(() => {
    const prev = prevDisplayedHintLevelRef.current;
    if (prev === 0 && displayedHintLevel > 0) {
      setIntroSliding(true);
      if (introSlideTimeoutRef.current) {
        clearTimeout(introSlideTimeoutRef.current);
      }
      introSlideTimeoutRef.current = setTimeout(() => {
        setIntroSliding(false);
        introSlideTimeoutRef.current = null;
      }, 500);
    }
    prevDisplayedHintLevelRef.current = displayedHintLevel;
  }, [displayedHintLevel]);

  useEffect(() => {
    if (carouselIndex === previousCarouselIndexRef.current) return;
    setExitingCarouselIndex(previousCarouselIndexRef.current);
    if (carouselSlideTimeoutRef.current) {
      clearTimeout(carouselSlideTimeoutRef.current);
    }
    carouselSlideTimeoutRef.current = setTimeout(() => {
      setExitingCarouselIndex(null);
      carouselSlideTimeoutRef.current = null;
    }, carouselTransitionMs);
    previousCarouselIndexRef.current = carouselIndex;
  }, [carouselIndex, carouselTransitionMs, carouselTransitionEasing]);

  useEffect(() => {
    setPlayLayoutRelaxed(true);
  }, [movie.title, dateKey]);

  useEffect(() => {
    if (state.status !== "playing") setPlayLayoutRelaxed(true);
  }, [state.status]);

  useLayoutEffect(() => {
    const len = state.guessHistory.length;
    if (!guessLengthBaselineReadyRef.current) {
      guessLengthBaselineReadyRef.current = true;
      prevGuessLenRef.current = len;
      return;
    }
    if (len > prevGuessLenRef.current) {
      const wrongGuessLanded = gameStatusRef.current !== "won";
      const shouldFlash = wrongGuessLanded;
      if (shouldFlash) {
        holdHintUntilFlashCompleteRef.current = true;
        setWrongGuessFlash(true);
      }
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
      setPracticeMovie(null);
      getRandomPracticeMovie().then((m) => {
        setPracticeMovie(m ?? getLocalRandomMovie());
      });
    }
    reset();
  }, [mode, reset]);
  const handleDailyResultPlayPractice = useCallback(() => {
    dismissResultAndReturnToPlay();
    setMode("practice");
  }, [dismissResultAndReturnToPlay]);

  wrongGuessCompleteRef.current = { hintLevel: state.hintLevel, carouselIndex };
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
    const { hintLevel, carouselIndex: startIndex } = wrongGuessCompleteRef.current;
    const firstHintReveal = hintLevel <= 1 || startIndex < 0;
    if (firstHintReveal) {
      // Prevent first-hint text flash: gate starts blank immediately.
      setHintRevealPhase("blank");
    }
    setDisplayedHintLevel(hintLevel);
    carouselAdvanceTimeoutRef.current = setTimeout(() => {
      const targetIndex = Math.max(0, hintLevel - 1);
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

      const hasExistingHint = startIndex >= 0 && hintLevel > 1;
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
        setSlideOutHintText(getHintBodyForLevel(state.movie, (hintLevel - 1) as HintLevel));
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
  }, [state.movie]);

  const handleHintPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    hintSwipePointerIdRef.current = e.pointerId;
    hintSwipeStartRef.current = { x: e.clientX, y: e.clientY };
    hintSwipeLockedRef.current = false;
  }, []);

  const handleHintPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (hintSwipePointerIdRef.current !== e.pointerId) return;
      if (!hintSwipeStartRef.current || hintSwipeLockedRef.current) return;
      const dx = e.clientX - hintSwipeStartRef.current.x;
      const dy = e.clientY - hintSwipeStartRef.current.y;

      // Only capture deliberate horizontal swipes; let vertical scroll pass through.
      if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        e.preventDefault();
      }
    },
    []
  );

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
        exitingDirectionRef.current = 1;
        setCarouselDirection(1);
        setCarouselTransitionEasing(CAROUSEL_EASING_DEFAULT);
        setCarouselTransitionMs(CAROUSEL_MANUAL_MS);
        setCarouselIndex((c) => c + 1);
      } else if (dx > 0 && carouselIndex > 0) {
        exitingDirectionRef.current = -1;
        setCarouselDirection(-1);
        setCarouselTransitionEasing(CAROUSEL_EASING_DEFAULT);
        setCarouselTransitionMs(CAROUSEL_MANUAL_MS);
        setCarouselIndex((c) => c - 1);
      }
    },
    [carouselIndex, displayedHintLevel]
  );

  const isGameOver = state.status === "won" || state.status === "lost";
  const showResult = isGameOver && !resultDismissed && !wrongGuessFlash;
  const gameLocked =
    (mode === "daily" && !dailyCompletion && state.status === "playing") ||
    (state.status === "playing" && state.guessesUsed > 0);

  useEffect(() => {
    if (!state.isDaily) return;
    if (!(state.status === "won" || state.status === "lost")) return;
    console.log("[GameScreen] daily game ended", {
      status: state.status,
      resultDismissed,
      showResult,
      isGameOver,
      guessesUsed: state.guessesUsed,
      dateKey: state.dateKey,
    });
  }, [state.isDaily, state.status, resultDismissed, showResult, isGameOver, state.guessesUsed, state.dateKey]);

  const practiceLoading = mode === "practice" && practiceMovie === null;
  const dailyUnavailable =
    mode === "daily" && hasSupabase && !loading && (dailyFailed || !dailyPayload);

  const relaxedVisual = isDesktop || playLayoutRelaxed;
  const isDesktopViewport = isDesktop;

  // Tagline is constrained to 3 lines max. This wrapper height provides the measurement box
  // for useAutoFitFontSize (mobile: 44*1.45*3 ≈ 192px, desktop: 56*1.45*3 ≈ 244px).
  const TAGLINE_3LINE_HEIGHT_MOBILE_PX = 192;
  const TAGLINE_3LINE_HEIGHT_DESKTOP_PX = 244;
  const taglineThreeLineHeightPx = isDesktopViewport ? TAGLINE_3LINE_HEIGHT_DESKTOP_PX : TAGLINE_3LINE_HEIGHT_MOBILE_PX;

  const taglineFontSize = useAutoFitFontSize(taglineTextRef, taglineContainerRef, {
    min: isDesktopViewport ? 28 : 24,
    max: isDesktopViewport ? 56 : 44,
    deps: [state.movie.officialTagline, introPhase, isDesktopViewport],
  });
  const motionPad = !isDesktop ? "transition-[padding] duration-300 ease-out" : "";
  const motionMargin = !isDesktop ? "transition-[margin] duration-300 ease-out" : "";
  const motionGap = !isDesktop ? "transition-[gap] duration-300 ease-out" : "";
  const sprocketsRunning =
    cinematicFocusActive ||
    stripMotionMode === "engaging" ||
    hintRevealPhase === "slideOut" ||
    hintRevealPhase === "blank" ||
    hintRevealPhase === "fadingIn";
  const dpModeToggle = (
    <div
      className="flex items-center justify-center gap-0.5"
      style={{
        fontFamily: FONT_DM,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "1px",
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (!gameLocked) setMode("daily");
        }}
        className="cursor-pointer border-0 bg-transparent p-0 leading-none"
        style={{
          color: mode === "daily" ? "#C9A96E" : "#2E2E2E",
          opacity: gameLocked && mode !== "daily" ? 0.4 : 1,
          fontFamily: FONT_DM,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "1px",
        }}
        aria-pressed={mode === "daily"}
        aria-label="Daily"
      >
        D
      </button>
      <span
        className="select-none"
        style={{
          color: "#2E2E2E",
          fontFamily: FONT_DM,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "1px",
        }}
        aria-hidden
      >
        ·
      </span>
      <button
        type="button"
        onClick={() => {
          if (!gameLocked) setMode("practice");
        }}
        className="cursor-pointer border-0 bg-transparent p-0 leading-none"
        style={{
          color: mode === "practice" ? "#C9A96E" : "#2E2E2E",
          opacity: gameLocked && mode !== "practice" ? 0.4 : 1,
          fontFamily: FONT_DM,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "1px",
        }}
        aria-pressed={mode === "practice"}
        aria-label="Practice"
      >
        P
      </button>
    </div>
  );

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

  if (mode === "daily" && dailyCompletion && !showResult) {
    const completionImdbUrl = completionTmdbMeta?.movieImdbId
      ? `https://www.imdb.com/title/${completionTmdbMeta.movieImdbId}`
      : null;
    const completionGuesses = dailyCompletion.guessesUsed;
    const completionHintsUsed = Math.max(completionGuesses - 1, 0);
    const completionSolveSummary = `Solved in ${completionGuesses} ${
      completionGuesses === 1 ? "guess" : "guesses"
    }${completionHintsUsed > 0 ? ` · ${completionHintsUsed} hints used` : ""}`;
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
          <header
            className={`w-full shrink-0 px-5 md:px-8 ${motionPad} ${
              relaxedVisual ? "pb-10 pt-6 md:pb-3 md:pt-5" : "pb-9 pt-5"
            }`}
          >
            <div className="mx-auto flex w-full max-w-lg items-center justify-between">
              <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
                <span>Tag</span>
                <span className="text-gold">lines</span>
              </h1>
              {!dailyCompletionJustAchieved ? dpModeToggle : null}
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
                {narratorResultLine(dailyCompletion.status, dailyCompletion.guessesUsed, {
                  isDaily: true,
                  dateKey: dailyCompletion.dateKey,
                })}
              </p>
              {dailyCompletion.status === "won" ? (
                <>
                  <p
                    className="mt-6 uppercase text-[#6b6860]"
                    style={{ fontFamily: '"DM Sans", sans-serif', fontSize: "0.68rem", letterSpacing: "0.15em" }}
                  >
                    solved in
                  </p>
                  <p
                    className="leading-none text-[#c9a96e]"
                    style={{ fontFamily: FONT_PLAYFAIR, fontSize: "5rem", marginTop: "0.2rem" }}
                  >
                    {dailyCompletion.guessesUsed}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-[#f0ede6]" style={{ fontFamily: '"DM Sans", sans-serif', fontSize: "1rem" }}>
                  {completionSolveSummary}
                </p>
              )}
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
              <div className="mt-3 w-full text-center">
                <button
                  type="button"
                  onClick={() => setMode("practice")}
                  className="transition hover:opacity-90"
                  style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "#6B6860" }}
                >
                  Need more Taglines? <span style={{ color: "#A8A49C" }}>Play practice mode</span>
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
          <main
            className={
              isDesktop
                ? `flex flex-1 flex-col justify-start px-5 pb-12 md:px-8 ${motionPad} ${relaxedVisual ? "pt-5 md:pt-7" : "pt-2"} ${introPhase !== "ready" ? "overflow-hidden" : ""}`
                : `flex min-h-0 flex-1 flex-col justify-start overflow-y-auto overscroll-contain px-5 pb-12 md:px-8 ${motionPad} ${relaxedVisual ? "pt-5 md:pt-7" : "pt-2"} ${introPhase !== "ready" ? "overflow-hidden" : ""}`
            }
          >
            <header
              className={`w-full shrink-0 ${motionPad} ${
                relaxedVisual ? "pb-10 pt-6 md:pb-3 md:pt-5" : "pb-9 pt-5"
              }`}
            >
              <div className="mx-auto flex w-full max-w-lg items-center justify-between">
                <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
                  <span>Tag</span>
                  <span className="text-gold">lines</span>
                </h1>
                {dpModeToggle}
              </div>
            </header>
            <section
              className="relative z-30 mx-auto w-full max-w-lg px-1"
              style={
                introPhase === "lightsDown"
                  ? { opacity: 0 }
                  : introPhase === "taglineReveal"
                    ? { animation: "taglineCinematicReveal 600ms ease-out both" }
                    : undefined
              }
            >
              <div
                className={`relative ${motionPad} ${
                  relaxedVisual ? "pb-3 pt-0 md:pb-6 md:pt-2" : "pb-2 pt-0 md:pb-4 md:pt-1"
                }`}
              >
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 z-0"
                  style={{
                    width: "min(86vw, 620px)",
                    height: "min(48vw, 300px)",
                    transform: "translate(-50%, -50%)",
                    background:
                      "radial-gradient(ellipse 60% 46% at 50% 50%, rgba(201,169,110,0.24) 0%, rgba(201,169,110,0.11) 32%, rgba(201,169,110,0.04) 55%, transparent 76%)",
                    filter: "blur(10px)",
                    animation: introPhase === "taglineReveal"
                      ? "taglineCinematicReveal 700ms ease-out 180ms both"
                      : undefined,
                  }}
                  aria-hidden
                />
                <div
                  ref={taglineContainerRef}
                  className="relative z-10 w-full"
                  style={{ height: taglineThreeLineHeightPx, overflow: "hidden" }}
                >
                  <HintReveal
                    movie={state.movie}
                    hintLevel={0}
                    textRef={taglineTextRef}
                    taglineFontSizePx={taglineFontSize}
                    className={`w-full !py-5 md:!py-12 [&_p]:!italic ${motionMargin} [&_p]:!leading-[1.12] md:[&_p]:!leading-[1.1] [&>div:last-child]:!mt-5 md:[&>div:last-child]:!mt-10`}
                  />
                </div>
              </div>
            </section>
            <div className="mx-auto mt-4 flex w-full max-w-lg flex-col items-center md:mt-8">
            {state.status === "playing" && introPhase === "ready" && (
              <div className="motion-safe:animate-[fadeIn_0.8s_ease-out_200ms_both] motion-reduce:animate-none flex w-full flex-col items-center">
                <div
                  className={`relative flex w-full max-w-md shrink-0 flex-col ${motionGap} ${motionMargin} ${
                    relaxedVisual ? "mb-6 gap-4 md:mb-11 md:gap-6" : "mb-4 gap-3 md:mb-6"
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
                    placeholder="Name the film..."
                    aria-label="Guess the movie"
                    disabled={Boolean(wrongGuessFlash)}
                    duplicateSignal={duplicateSignal}
                  />
                </div>

                <hr
                  className={`w-full max-w-md shrink-0 border-0 border-t border-solid border-[#1a1a1a] ${motionMargin} ${
                    relaxedVisual ? "my-4 md:my-9" : "my-4 md:my-6"
                  }`}
                />

                <section
                  className={`flex w-full max-w-md shrink-0 flex-col items-stretch scroll-mt-6 ${motionGap} ${
                    relaxedVisual ? "gap-3 md:gap-6" : "gap-2 md:gap-3"
                  }`}
                >
                  <div className="w-full">
                    {displayedHintLevel >= 1 ? (
                      <div className="flex w-full flex-col" style={{ gap: 12 }}>
                        <p
                          style={{
                            margin: 0,
                            color: "#6B6860",
                            fontFamily: '"DM Sans", sans-serif',
                            fontSize: isDesktop ? 12 : 11,
                            lineHeight: 1.35,
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            textAlign: "center",
                          }}
                        >
                          Hint {carouselIndex + 1}
                        </p>
                        <div
                          className="relative w-full"
                          style={{ padding: "0 22px", touchAction: "pan-y" }}
                          onPointerDown={handleHintPointerDown}
                          onPointerMove={handleHintPointerMove}
                          onPointerUp={handleHintPointerUp}
                          onPointerCancel={() => {
                            hintSwipeStartRef.current = null;
                            hintSwipePointerIdRef.current = null;
                            hintSwipeLockedRef.current = false;
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              exitingDirectionRef.current = -1;
                              setCarouselDirection(-1);
                              setCarouselTransitionEasing(CAROUSEL_EASING_DEFAULT);
                              setCarouselTransitionMs(CAROUSEL_MANUAL_MS);
                              setCarouselIndex((c) => c - 1);
                            }}
                            aria-label="Previous hint"
                            className="flex shrink-0 items-center justify-center"
                            style={{
                              position: "absolute",
                              left: -18,
                              top: "50%",
                              transform: "translateY(-50%)",
                              width: 28,
                              height: 28,
                              borderRadius: 9999,
                              border: "1px solid #2A2A2A",
                              background: "transparent",
                              padding: 0,
                              cursor: "pointer",
                              visibility: carouselIndex === 0 ? "hidden" : "visible",
                              zIndex: 5,
                            }}
                          >
                            <svg
                              width="9"
                              height="14"
                              viewBox="0 0 9 14"
                              fill="none"
                              aria-hidden
                            >
                              <path
                                d="M7.5 1L1.5 7l6 6"
                                stroke="#6B6860"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              exitingDirectionRef.current = 1;
                              setCarouselDirection(1);
                              setCarouselTransitionEasing(CAROUSEL_EASING_DEFAULT);
                              setCarouselTransitionMs(CAROUSEL_MANUAL_MS);
                              setCarouselIndex((c) => c + 1);
                            }}
                            aria-label="Next hint"
                            className="flex shrink-0 items-center justify-center"
                            style={{
                              position: "absolute",
                              right: -18,
                              top: "50%",
                              transform: "translateY(-50%)",
                              width: 28,
                              height: 28,
                              borderRadius: 9999,
                              border: "1px solid #2A2A2A",
                              background: "transparent",
                              padding: 0,
                              cursor: "pointer",
                              visibility: carouselIndex === displayedHintLevel - 1 ? "hidden" : "visible",
                              zIndex: 5,
                            }}
                          >
                            <svg
                              width="9"
                              height="14"
                              viewBox="0 0 9 14"
                              fill="none"
                              aria-hidden
                            >
                              <path
                                d="M1.5 1L7.5 7l-6 6"
                                stroke="#6B6860"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <div className="w-full">
                            <div
                              style={{
                                position: "relative",
                                width: "100%",
                                height: 10,
                                background:
                                  "repeating-linear-gradient(90deg, #0D0D0D 0px, #0D0D0D 12px, #1A1A1A 12px, #1A1A1A 22px)",
                                backgroundSize: "22px 10px",
                                animation:
                                  sprocketsRunning
                                    ? "perforationRoll 260ms steps(22, end) infinite"
                                    : undefined,
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: "DM Sans",
                                  fontSize: 7,
                                  letterSpacing: "0.2em",
                                  color: "#8B6914",
                                  position: "absolute",
                                  top: "50%",
                                  left: 12,
                                  transform: "translateY(-50%)",
                                  pointerEvents: "none",
                                  userSelect: "none",
                                }}
                              >
                                A · KU 22 9611 1802 · 35MM
                              </span>
                            </div>
                            <div className="relative w-full overflow-hidden" style={{ height: 180, minHeight: 180 }}>
                              <div
                                style={{
                                  position: "relative",
                                  width: "100%",
                                  height: 180,
                                  minHeight: 180,
                                  background: "#141410",
                                  borderTop: "3px solid #2A2410",
                                  borderBottom: "3px solid #2A2410",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    width: "100%",
                                    transform: `translateX(-${carouselIndex * 100}%)`,
                                    transition: `transform ${carouselTransitionMs}ms ${carouselTransitionEasing}`,
                                  }}
                                >
                                  {Array.from({ length: displayedHintLevel }, (_, i) => (
                                    <div
                                      key={`hint-strip-${i}`}
                                      style={{
                                        flex: "0 0 100%",
                                        padding: "32px 28px",
                                        height: 180,
                                        minHeight: 180,
                                        overflow: "hidden",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          opacity:
                                            i === carouselIndex &&
                                            (hintRevealPhase === "slideOut" ||
                                              hintRevealPhase === "blank" ||
                                              hintRevealPhase === "fadingIn")
                                              ? 0
                                              : 1,
                                          animation:
                                            i === carouselIndex && hintRevealPhase === "fadingIn"
                                              ? `hintTextSettleFade ${WRONG_GUESS_FADE_IN_MS}ms ease-out both`
                                              : undefined,
                                        }}
                                      >
                                        <AutoFitHintText
                                          text={getHintBodyForLevel(state.movie, (i + 1) as HintLevel)}
                                          isDesktop={isDesktop}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div
                                  style={{
                                    position: "absolute",
                                    inset: 0,
                                    background: "#141410",
                                    opacity: hintRevealPhase === "blank" ? 1 : hintRevealPhase === "fadingIn" ? 0 : 0,
                                    transition:
                                      hintRevealPhase === "fadingIn"
                                        ? `opacity ${WRONG_GUESS_FADE_IN_MS}ms ease-out`
                                        : undefined,
                                    pointerEvents: "none",
                                  }}
                                  aria-hidden
                                />
                                {hintRevealPhase === "slideOut" ? (
                                  <div
                                    style={{
                                      position: "absolute",
                                      inset: 0,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      padding: "32px 28px",
                                      pointerEvents: "none",
                                      animation: `hintSlideOutLeft ${WRONG_GUESS_SLIDE_OUT_MS}ms ease-in both`,
                                    }}
                                    aria-hidden
                                  >
                                    <p
                                      style={{
                                        margin: 0,
                                        color: "#C9B87A",
                                        fontFamily: FONT_PLAYFAIR,
                                        fontStyle: "italic",
                                        fontSize: isDesktop ? 18 : 16,
                                        lineHeight: 1.6,
                                        textAlign: "center",
                                      }}
                                    >
                                      {slideOutHintText}
                                    </p>
                                  </div>
                                ) : null}
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    bottom: 0,
                                    left: 0,
                                    width: 2,
                                    background: "#000000",
                                    pointerEvents: "none",
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    bottom: 0,
                                    right: 0,
                                    width: 2,
                                    background: "#000000",
                                    pointerEvents: "none",
                                  }}
                                />
                              </div>
                            </div>
                            <div
                              style={{
                                width: "100%",
                                height: 10,
                                background:
                                  "repeating-linear-gradient(90deg, #0D0D0D 0px, #0D0D0D 12px, #1A1A1A 12px, #1A1A1A 22px)",
                                backgroundSize: "22px 10px",
                                animation:
                                  sprocketsRunning
                                    ? "perforationRoll 260ms steps(22, end) infinite"
                                    : undefined,
                              }}
                            />
                          </div>
                        </div>
                        {displayedHintLevel > 1 ? (
                          <div
                            className="flex w-full items-center justify-center"
                            style={{ gap: 8 }}
                            aria-hidden
                          >
                            {Array.from({ length: displayedHintLevel }, (_, i) => (
                              <div
                                key={i}
                                style={{
                                  width: 6,
                                  height: 4,
                                  borderRadius: 1,
                                  background: i === carouselIndex ? "#C9A96E" : "#2E2410",
                                }}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              {state.guessHistory.length > 0 ? (
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
            ) : null}
              </div>
            )}
            </div>
        </main>

        {cinematicFocusActive && state.status === "playing" ? (
          <div
            className="pointer-events-none fixed inset-0 z-20"
            style={{
              background: "rgba(0,0,0,0.3)",
            }}
            aria-hidden
          />
        ) : null}

        {showResult && (
          <ResultModal
            state={state}
            onClose={dismissResultAndReturnToPlay}
            onPlayAgain={dismissResultAndReturnToPlay}
            onPlayPractice={handleDailyResultPlayPractice}
          />
        )}
        <style jsx global>{`
          @keyframes hintFadeUp {
            0% {
              opacity: 0;
              transform: translateY(8px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes taglineCinematicReveal {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
          @keyframes hintFrameSlideIn {
            0% {
              transform: translateX(100%);
            }
            100% {
              transform: translateX(0);
            }
          }
          @keyframes hintFrameSlideOut {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-100%);
            }
          }
          @keyframes hintFrameSlideInFromLeft {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(0);
            }
          }
          @keyframes hintFrameSlideOutToRight {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(100%);
            }
          }
          @keyframes perforationRoll {
            0% {
              background-position: 0 0;
            }
            100% {
              background-position: -44px 0;
            }
          }
          @keyframes hintTextSettleFade {
            0% {
              opacity: 0;
            }
            100% {
              opacity: 1;
            }
          }
          @keyframes hintSlideOutLeft {
            0% {
              transform: translateX(0);
              opacity: 1;
            }
            100% {
              transform: translateX(-100%);
              opacity: 0;
            }
          }
        `}</style>
        {wrongGuessFlash ? <WrongGuessFlash onComplete={handleWrongGuessFlashComplete} /> : null}
        </div>
      </div>
    </div>
  );
}
