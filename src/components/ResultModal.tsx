"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { GameState } from "@/hooks/useGameState";
import { buildShareText, copyShareToClipboard, getGuessCellKinds } from "@/lib/share";
import {
  getPlayCount,
  getStoredBestStreak,
  getStoredStreak,
  getWinCount,
  maybeUpdateStoredBestStreak,
} from "@/lib/storage";
import { MAX_GUESSES } from "@/types/movie";
import type { GuessCellKind } from "@/lib/share";

interface ResultModalProps {
  state: GameState;
  onClose: () => void;
  onPlayAgain: () => void;
}

const DM = '"DM Sans", ui-sans-serif, system-ui, sans-serif';
const PF = '"Playfair Display", Georgia, "Times New Roman", serif';

function narratorLine(state: GameState): string {
  if (state.status === "lost") return "Maybe next time.";
  if (state.guessesUsed === 1) return "Flawless.";
  if (state.guessesUsed === 2) return "Sharp.";
  if (state.guessesUsed === 3) return "Solid.";
  if (state.guessesUsed === 4) return "You got there.";
  return "Hard earned.";
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

function FilmCell({ kind, lost }: { kind: GuessCellKind; lost: boolean }) {
  if (lost) {
    return (
      <div
        className="flex flex-shrink-0 items-center justify-center"
        style={{
          width: 44,
          height: 58,
          borderRadius: 4,
          backgroundColor: "#3a1a1a",
          border: "1px solid #5a2a2a",
          color: "#f87171",
          fontFamily: DM,
          fontSize: "1.25rem",
          fontWeight: 600,
          lineHeight: 1,
        }}
        aria-hidden
      >
        ×
      </div>
    );
  }

  if (kind === "wrong") {
    return (
      <div
        className="flex flex-shrink-0 items-center justify-center"
        style={{
          width: 44,
          height: 58,
          borderRadius: 4,
          backgroundColor: "#3a1a1a",
          border: "1px solid #5a2a2a",
          color: "#f87171",
          fontFamily: DM,
          fontSize: "1.25rem",
          fontWeight: 600,
          lineHeight: 1,
        }}
        aria-hidden
      >
        ×
      </div>
    );
  }

  if (kind === "win") {
    return (
      <div
        className="flex flex-shrink-0 items-center justify-center"
        style={{
          width: 44,
          height: 58,
          borderRadius: 4,
          backgroundColor: "#1a3a1a",
          border: "1px solid #2a5a2a",
          color: "#4ade80",
          fontFamily: DM,
          fontSize: "1.1rem",
          fontWeight: 700,
          lineHeight: 1,
        }}
        aria-hidden
      >
        ✓
      </div>
    );
  }

  return (
    <div
      className="flex flex-shrink-0 items-center justify-center"
      style={{
        width: 44,
        height: 58,
        borderRadius: 4,
        backgroundColor: "#161616",
        border: "1px solid #222",
        color: "#6b6860",
        fontFamily: DM,
        fontSize: "0.5rem",
        lineHeight: 1,
      }}
      aria-hidden
    >
      ·
    </div>
  );
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

export function ResultModal({ state, onClose, onPlayAgain }: ResultModalProps) {
  const [copied, setCopied] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [countdown, setCountdown] = useState(() => formatCountdownToLocalMidnight());

  const streak = getStoredStreak();
  const [bestStreak, setBestStreak] = useState(() =>
    typeof window !== "undefined" ? getStoredBestStreak() : 0
  );
  const played = getPlayCount();
  const wins = getWinCount();
  const winPct = played > 0 ? Math.round((100 * wins) / played) : 0;

  const isWon = state.status === "won";
  const lost = state.status === "lost";
  const movie = state.movie;
  const showPoster = movie.posterUrl && !posterError;
  const cellKinds = useMemo(() => getGuessCellKinds(state), [state]);
  const narrator = useMemo(() => narratorLine(state), [state]);

  const hintsUsed = state.hintLevel;
  const guessesLine =
    state.guessesUsed === 1 ? "1 guess." : `${state.guessesUsed} guesses.`;
  const hintsLine =
    hintsUsed === 0
      ? "0 hints used."
      : hintsUsed === 1
        ? "1 hint used."
        : `${hintsUsed} hints used.`;

  const filmHeadline = isWon
    ? `YOUR FILM — SOLVED IN ${state.guessesUsed}`
    : `YOUR FILM — MISSED`;

  const metaLine = `${movie.year} · ${movie.genre}`;

  useEffect(() => {
    let cancelled = false;
    setRevealed(false);
    const t = window.setTimeout(() => {
      if (!cancelled) setRevealed(true);
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [state.movie.title, state.status]);

  useLayoutEffect(() => {
    if (state.isDaily && state.status === "won") {
      maybeUpdateStoredBestStreak(getStoredStreak());
    }
    setBestStreak(getStoredBestStreak());
  }, [state.isDaily, state.status, state.movie.title, state.dateKey]);

  useEffect(() => {
    if (!state.isDaily) return;
    const tick = () => setCountdown(formatCountdownToLocalMidnight());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state.isDaily]);

  const shareText = useMemo(() => buildShareText(state), [state]);

  const handleShare = useCallback(async () => {
    const ok = await copyShareToClipboard(shareText);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }, [shareText]);

  const phaseEase = "transition-all duration-500 ease-out motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:transform-none";

  const fadeInStagger = (delayMs: number) =>
    `${phaseEase} ${
      revealed ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
    }`;

  const fadeInStyle = (delayMs: number) =>
    revealed ? ({ transitionDelay: `${delayMs}ms` } as const) : undefined;

  const heroPhaseClass = `${phaseEase} flex flex-col items-center text-center ${
    revealed
      ? "pointer-events-none absolute inset-x-0 top-8 z-10 min-h-[min(50vh,420px)] justify-center opacity-0 scale-[0.92] -translate-y-3"
      : "relative min-h-[min(52vh,440px)] justify-center py-10 opacity-100 scale-100 translate-y-0"
  }`;

  const detailShellClass = `${phaseEase} w-full ${
    revealed
      ? "relative z-0 translate-y-0 opacity-100"
      : "pointer-events-none absolute inset-0 z-0 translate-y-3 opacity-0"
  }`;

  const pillClass =
    "rounded-full border px-4 py-2 text-sm font-medium transition hover:border-muted hover:text-foreground/90 active:scale-[0.99]";
  const pillStyle = {
    fontFamily: DM,
    backgroundColor: "#1a1a1a",
    borderColor: "#333333",
    color: "#6b6860",
  } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-0 items-center justify-center overflow-hidden bg-[#0d0d0d] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
      onClick={onClose}
    >
      <div
        className="relative flex min-h-0 w-full max-w-[390px] flex-col items-stretch overflow-y-auto overscroll-contain py-6"
        style={{ maxHeight: "min(100dvh - 2rem, 100vh - 2rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="result-title" className="sr-only">
          Game result
        </h2>

        {/* Phase A: hero poster + title + meta only */}
        <div className={heroPhaseClass} aria-hidden={revealed}>
          {showPoster ? (
            <img
              src={movie.posterUrl!}
              alt=""
              width={187}
              height={280}
              className="mx-auto block h-auto w-auto max-w-[85vw] object-contain object-center"
              style={{ maxHeight: 280 }}
              onError={() => setPosterError(true)}
            />
          ) : (
            <div
              className="mx-auto bg-[#161616]"
              style={{
                width: "min(85vw, 187px)",
                height: 280,
                maxHeight: 280,
                borderRadius: 6,
                border: "1px solid #222",
              }}
              aria-hidden
            />
          )}
          <p
            className="mt-6 max-w-[95%] font-bold leading-tight text-[#f0ede6]"
            style={{ fontFamily: PF, fontSize: "1.8rem" }}
          >
            {movie.title}
          </p>
          <p className="mt-2 text-[#6b6860]" style={{ fontFamily: DM, fontSize: "0.8rem" }}>
            {metaLine}
          </p>
        </div>

        {/* Phase B: compact movie row, then narrator, film, stats, share, secondary */}
        <div className={detailShellClass}>
          <div className={`mt-2 flex w-full flex-row items-start gap-3 ${fadeInStagger(0)}`} style={fadeInStyle(0)}>
            {showPoster ? (
              <img
                src={movie.posterUrl!}
                alt=""
                width={52}
                height={72}
                className="block shrink-0 object-cover"
                style={{ width: 52, height: 72, borderRadius: 4 }}
                onError={() => setPosterError(true)}
              />
            ) : (
              <div
                className="shrink-0 bg-[#161616]"
                style={{ width: 52, height: 72, borderRadius: 4, border: "1px solid #222" }}
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1 text-left">
              <p
                className="font-bold leading-tight text-[#f0ede6]"
                style={{ fontFamily: PF, fontSize: "1.05rem" }}
              >
                {movie.title}
              </p>
              <p
                className="mt-0.5 text-[#6b6860]"
                style={{ fontFamily: DM, fontSize: "0.75rem" }}
              >
                {metaLine}
              </p>
              <p
                className="mt-1.5 italic leading-snug text-[#6b6860]"
                style={{ fontFamily: PF, fontSize: "0.8rem" }}
              >
                {movie.officialTagline}
              </p>
            </div>
          </div>

          <div className={`mt-8 text-center ${fadeInStagger(60)}`} style={fadeInStyle(60)}>
            <p
              className="font-normal italic leading-none text-[#c9a96e]"
              style={{
                fontFamily: PF,
                fontSize: "3rem",
                marginBottom: "0.35rem",
              }}
              aria-live="polite"
            >
              {narrator}
            </p>
          </div>

          <div className={`mt-8 w-full ${fadeInStagger(120)}`} style={fadeInStyle(120)}>
            <p
              className="mb-2 text-center uppercase tracking-[0.08em] text-[#6b6860]"
              style={{ fontFamily: DM, fontSize: "0.65rem" }}
            >
              {filmHeadline}
            </p>
            <div className="flex flex-row items-center justify-center" style={{ gap: 8 }}>
              {cellKinds.map((kind, i) => (
                <FilmCell key={i} kind={kind} lost={lost} />
              ))}
            </div>
            <p
              className="mt-2 text-center text-[#6b6860]"
              style={{ fontFamily: DM, fontSize: "0.75rem" }}
            >
              {guessesLine} {hintsLine}
            </p>
          </div>

          <div
            className={`mt-6 grid w-full grid-cols-4 border border-[#222] ${fadeInStagger(180)}`}
            style={{ ...fadeInStyle(180), borderColor: "#222" }}
          >
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

          <div className={`mt-8 flex w-full justify-center ${fadeInStagger(240)}`} style={fadeInStyle(240)}>
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
              {copied ? "Copied" : state.isDaily ? "Share today's result" : "Share your result"}
            </button>
          </div>

          <div className={`mt-4 flex w-full flex-col items-center gap-3 ${fadeInStagger(300)}`} style={fadeInStyle(300)}>
            <div className="flex w-full max-w-[320px] flex-row flex-wrap justify-center gap-2">
              <button type="button" onClick={onPlayAgain} className={pillClass} style={pillStyle}>
                {state.isDaily ? "Play again tomorrow" : "Play again"}
              </button>
              <button
                type="button"
                onClick={state.isDaily ? onPlayAgain : onClose}
                className={pillClass}
                style={pillStyle}
              >
                {state.isDaily ? "Practice mode" : "Close"}
              </button>
            </div>
            {state.isDaily ? (
              <p className="text-center text-[#6b6860]" style={{ fontFamily: DM, fontSize: "0.75rem" }}>
                Next tagline in {countdown}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
