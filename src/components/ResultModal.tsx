"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { GameState } from "@/hooks/useGameState";
import { buildShareText, copyShareToClipboard } from "@/lib/share";
import { narratorResultLine } from "@/lib/narratorResult";
import {
  getPlayCount,
  getStoredBestStreak,
  getStoredStreak,
  getWinCount,
  maybeUpdateStoredBestStreak,
} from "@/lib/storage";
import { FONT_DM, FONT_PLAYFAIR } from "@/lib/fontStacks";
import { GameEndSequence } from "./GameEndSequence";

interface ResultModalProps {
  state: GameState;
  onClose: () => void;
  onPlayAgain: () => void;
  onPlayPractice?: () => void;
}

const DM = FONT_DM;
const PF = FONT_PLAYFAIR;

interface TmdbMovieMeta {
  movieImdbId: string | null;
  imdbRating: number | null;
  director: { name: string; imdbId: string | null } | null;
  cast: Array<{ name: string; imdbId: string | null }>;
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

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <circle cx="18" cy="5" r="2.25" fill="currentColor" />
      <circle cx="6" cy="12" r="2.25" fill="currentColor" />
      <circle cx="18" cy="19" r="2.25" fill="currentColor" />
      <path
        d="M8.59 13.51l6.83 3.98M15.41 6.51L8.58 10.49"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ResultModal({ state, onClose, onPlayAgain, onPlayPractice }: ResultModalProps) {
  const [copied, setCopied] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const [beat1Show, setBeat1Show] = useState(false);
  const [phaseCActive, setPhaseCActive] = useState(false);
  const [dismissEnabled, setDismissEnabled] = useState(false);
  const [tmdbMeta, setTmdbMeta] = useState<TmdbMovieMeta | null>(null);
  const [countdown, setCountdown] = useState(() => formatCountdownToLocalMidnight());

  const streak = getStoredStreak();
  const [bestStreak, setBestStreak] = useState(() =>
    typeof window !== "undefined" ? getStoredBestStreak() : 0
  );
  const played = getPlayCount();
  const wins = getWinCount();
  const winPct = played > 0 ? Math.round((100 * wins) / played) : 0;

  const lost = state.status === "lost";
  const movie = state.movie;
  const showPoster = Boolean(movie.posterUrl && !posterError);
  const narratorLine = useMemo(() => {
    if (state.status === "playing") return "";
    return narratorResultLine(state.status, state.guessesUsed, {
      isDaily: state.isDaily,
      dateKey: state.dateKey,
    });
  }, [state.status, state.guessesUsed, state.isDaily, state.dateKey]);

  const metaLine = `${movie.year} · ${movie.genre}`;
  const imdbRating = tmdbMeta?.imdbRating ?? null;
  const movieImdbUrl = tmdbMeta?.movieImdbId ? `https://www.imdb.com/title/${tmdbMeta.movieImdbId}` : null;

  useEffect(() => {
    // Intentional reset when a new result is shown (new sequence run).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync UI gates to new game identity
    setPhaseCActive(false);
    setDismissEnabled(false);
    setBeat1Show(false);
  }, [state.movie.title, state.status, state.guessesUsed, state.dateKey]);

  useEffect(() => {
    if (!phaseCActive) {
      const resetId = window.setTimeout(() => {
        setBeat1Show(false);
      }, 0);
      return () => window.clearTimeout(resetId);
    }
    const reduceMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const id = window.setTimeout(() => {
        setBeat1Show(true);
      }, 0);
      return () => window.clearTimeout(id);
    }
    let cancelled = false;
    const resetId = window.setTimeout(() => {
      if (!cancelled) setBeat1Show(false);
    }, 0);
    const beat1At = window.setTimeout(() => {
      if (!cancelled) setBeat1Show(true);
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(resetId);
      window.clearTimeout(beat1At);
    };
  }, [phaseCActive, state.movie.title, state.status, state.guessesUsed]);

  useLayoutEffect(() => {
    if (state.isDaily && state.status === "won") {
      maybeUpdateStoredBestStreak(getStoredStreak());
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync best streak from storage after result
    setBestStreak(getStoredBestStreak());
  }, [state.isDaily, state.status, state.movie.title, state.dateKey]);

  useEffect(() => {
    if (!state.isDaily) return;
    const tick = () => setCountdown(formatCountdownToLocalMidnight());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state.isDaily]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear before refetch
    setTmdbMeta(null);
    const title = encodeURIComponent(movie.title);
    const year = encodeURIComponent(String(movie.year));

    const load = async () => {
      try {
        const res = await fetch(`/api/tmdb-movie-meta?title=${title}&year=${year}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as
          | ({ ok: true } & TmdbMovieMeta)
          | { ok?: false };
        if (!cancelled && data.ok) {
          setTmdbMeta({
            movieImdbId: data.movieImdbId ?? null,
            imdbRating: typeof data.imdbRating === "number" ? data.imdbRating : null,
            director: data.director ?? null,
            cast: Array.isArray(data.cast) ? data.cast.slice(0, 3) : [],
          });
        }
      } catch {
        // Graceful fallback: keep compact tile without external data.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [movie.title, movie.year]);

  const shareText = useMemo(() => buildShareText(state), [state]);

  const handleShare = useCallback(async () => {
    const ok = await copyShareToClipboard(shareText);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }, [shareText]);

  const pillClass =
    "rounded-full border px-4 py-2 text-sm font-medium transition hover:border-muted hover:text-foreground/90 active:scale-[0.99]";
  const pillStyle = {
    fontFamily: DM,
    backgroundColor: "#1a1a1a",
    borderColor: "#333333",
    color: "#6b6860",
  } as const;

  const handleBackdropClick = useCallback(() => {
    if (!dismissEnabled) return;
    onClose();
  }, [dismissEnabled, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-0 items-center justify-center overflow-hidden bg-[#0d0d0d] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
      onClick={handleBackdropClick}
    >
      <div
        className="relative flex min-h-0 w-full max-w-[390px] flex-col items-stretch overflow-y-auto overscroll-contain py-6"
        style={{ maxHeight: "min(100dvh - 2rem, 100vh - 2rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="result-title" className="sr-only">
          Game result
        </h2>

        <GameEndSequence
          key={`${state.movie.title}-${state.status}-${state.guessesUsed}-${state.dateKey}`}
          narratorLine={narratorLine}
          posterUrl={movie.posterUrl ?? null}
          showPoster={showPoster}
          onPosterError={() => setPosterError(true)}
          onPhaseCEnter={() => setPhaseCActive(true)}
          onSequenceComplete={() => setDismissEnabled(true)}
        >
          <header className="mb-4 w-full px-1">
            <div className="flex items-center justify-start">
              <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
                <span>Tag</span>
                <span className="text-gold">lines</span>
              </h1>
            </div>
          </header>

          <div className="mt-2 w-full">
            {movieImdbUrl ? (
              <div className="relative rounded-md border border-[#1e1e1e] bg-[#111] px-3 py-3">
                <a
                  href={movieImdbUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0 z-0"
                  aria-label={`View ${movie.title} on IMDb`}
                />
                <div className="relative z-10 flex w-full flex-row items-start gap-3">
                  {showPoster ? (
                    <img
                      src={movie.posterUrl!}
                      alt=""
                      width={84}
                      height={124}
                      className="block shrink-0 object-cover"
                      style={{ width: 84, height: 124, borderRadius: 6 }}
                      onError={() => setPosterError(true)}
                    />
                  ) : (
                    <div
                      className="shrink-0 bg-[#161616]"
                      style={{ width: 84, height: 124, borderRadius: 6, border: "1px solid #222" }}
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1 text-left">
                    <p
                      className="font-bold leading-tight text-[#f0ede6]"
                      style={{ fontFamily: PF, fontSize: "1.12rem", lineHeight: 1.15 }}
                    >
                      {movie.title}
                    </p>
                    <p
                      className="mt-1 text-[#6b6860]"
                      style={{ fontFamily: DM, fontSize: "0.74rem", lineHeight: 1.3 }}
                    >
                      {imdbRating !== null ? `${metaLine} · ⭐ ${imdbRating.toFixed(1)}` : metaLine}
                    </p>
                    <p
                      className="mt-2.5 italic leading-snug text-[#d7d3c8]"
                      style={{ fontFamily: PF, fontSize: "1.03rem" }}
                    >
                      {movie.officialTagline}
                    </p>
                    {tmdbMeta?.director?.name && tmdbMeta.director.imdbId ? (
                      <p className="mt-1.5 text-[#6b6860]" style={{ fontFamily: DM, fontSize: "0.72rem" }}>
                        🎬{" "}
                        <a
                          href={`https://www.imdb.com/name/${tmdbMeta.director.imdbId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative z-20 underline"
                        >
                          {tmdbMeta.director.name}
                        </a>
                      </p>
                    ) : null}
                    {tmdbMeta?.cast?.length ? (
                      <p className="mt-1.5 text-[#6b6860]" style={{ fontFamily: DM, fontSize: "0.72rem", lineHeight: 1.35 }}>
                        {tmdbMeta.cast.map((actor, idx) => (
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
                            {idx < tmdbMeta.cast.length - 1 ? " · " : ""}
                          </span>
                        ))}
                      </p>
                    ) : null}
                    <a
                      href={movieImdbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-20 mt-1.5 inline-block text-[#6b6860] underline"
                      style={{ fontFamily: DM, fontSize: "0.72rem" }}
                    >
                      View on IMDb →
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex w-full flex-row items-start gap-3 rounded-md border border-[#1e1e1e] bg-[#111] px-3 py-3">
                {showPoster ? (
                  <img
                    src={movie.posterUrl!}
                    alt=""
                    width={84}
                    height={124}
                    className="block shrink-0 object-cover"
                    style={{ width: 84, height: 124, borderRadius: 6 }}
                    onError={() => setPosterError(true)}
                  />
                ) : (
                  <div
                    className="shrink-0 bg-[#161616]"
                    style={{ width: 84, height: 124, borderRadius: 6, border: "1px solid #222" }}
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1 text-left">
                  <p
                    className="font-bold leading-tight text-[#f0ede6]"
                    style={{ fontFamily: PF, fontSize: "1.12rem", lineHeight: 1.15 }}
                  >
                    {movie.title}
                  </p>
                  <p
                    className="mt-1 text-[#6b6860]"
                    style={{ fontFamily: DM, fontSize: "0.74rem", lineHeight: 1.3 }}
                  >
                    {metaLine}
                  </p>
                  <p
                    className="mt-2.5 italic leading-snug text-[#d7d3c8]"
                    style={{ fontFamily: PF, fontSize: "1.03rem" }}
                  >
                    {movie.officialTagline}
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 w-full">
            <div className="w-full border-t" style={{ borderColor: "#1e1e1e" }} />
          </div>

          <div className="mt-6 w-full">
            <div className="flex flex-col items-center text-center">
              <div
                className="motion-reduce:transition-none"
                style={{
                  transform: beat1Show ? "scale(1)" : "scale(0.92)",
                  opacity: beat1Show ? 1 : 0,
                  transition: "transform 280ms var(--ease-out), opacity 280ms var(--ease-out)",
                  transformOrigin: "center center",
                }}
              >
                <p
                  className="mb-1 motion-reduce:opacity-100"
                  style={{
                    fontFamily: DM,
                    fontSize: "0.7rem",
                    color: "#6B6860",
                  }}
                >
                  {lost ? "Not this time." : "solved in"}
                </p>
                <p
                  className="font-bold leading-none text-[#f0ede6] motion-reduce:opacity-100"
                  style={{
                    fontFamily: PF,
                    fontSize: "5rem",
                    color: "#F0EDE6",
                  }}
                  aria-label={lost ? "Not solved" : `Solved in ${state.guessesUsed} guesses`}
                >
                  {lost ? "X" : state.guessesUsed}
                </p>
              </div>
            </div>
          </div>

          {state.isDaily ? (
            <>
              <div className="mt-6 grid w-full grid-cols-4 border border-[#222]" style={{ borderColor: "#222" }}>
                {[
                  { n: played, l: "Played" },
                  { n: `${winPct}%`, l: "Win %" },
                  { n: streak, l: "Streak" },
                  { n: bestStreak, l: "Best" },
                ].map((cell, i) => (
                  <div
                    key={cell.l}
                    className="flex flex-col items-center justify-center py-3 text-center"
                    style={{
                      borderLeft: i > 0 ? "1px solid #222" : undefined,
                    }}
                  >
                    <span className="font-bold text-[#f0ede6]" style={{ fontFamily: DM, fontSize: "1.4rem" }}>
                      {cell.n}
                    </span>
                    <span
                      className="mt-1 uppercase tracking-[0.06em] text-[#6b6860]"
                      style={{ fontFamily: DM, fontSize: "0.65rem" }}
                    >
                      {cell.l}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex w-full justify-center">
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex w-full max-w-[320px] items-center justify-center gap-2 font-bold text-black transition active:scale-[0.99]"
                  style={{
                    fontFamily: DM,
                    height: 52,
                    backgroundColor: "#c9a96e",
                    borderRadius: 8,
                  }}
                >
                  <ShareIcon />
                  {copied ? "Copied" : "Share today's result"}
                </button>
              </div>
            </>
          ) : null}

          <div className="mt-4 flex w-full flex-col items-center gap-3">
            {state.isDaily ? (
              <button
                type="button"
                onClick={() => (onPlayPractice ? onPlayPractice() : onClose())}
                className="transition hover:opacity-90"
                style={{ fontFamily: DM, fontSize: 13, color: "#6B6860" }}
              >
                Need more Taglines? <span style={{ color: "#A8A49C" }}>Play practice mode</span>
              </button>
            ) : (
              <div className="flex w-full max-w-[320px] flex-row flex-wrap justify-center gap-2">
                <button type="button" onClick={onPlayAgain} className={pillClass} style={pillStyle}>
                  Play again
                </button>
                <button type="button" onClick={onClose} className={pillClass} style={pillStyle}>
                  Close
                </button>
              </div>
            )}
            {state.isDaily ? (
              <p className="text-center text-[#6b6860]" style={{ fontFamily: DM, fontSize: "0.75rem" }}>
                Next tagline in {countdown}
              </p>
            ) : null}
          </div>
        </GameEndSequence>
      </div>
    </div>
  );
}
