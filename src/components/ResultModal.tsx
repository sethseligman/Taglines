"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameState } from "@/hooks/useGameState";
import { buildShareText, copyShareToClipboard, getGuessCellKinds } from "@/lib/share";
import { getStoredStreak } from "@/lib/storage";
import { MAX_GUESSES } from "@/types/movie";

interface ResultModalProps {
  state: GameState;
  onClose: () => void;
  onPlayAgain: () => void;
}

function narratorLine(state: GameState): string {
  if (state.status === "lost") return "Missed it.";
  if (state.guessesUsed === 1) return "Perfect.";
  if (state.guessesUsed <= 3) return "Nice.";
  return "Close.";
}

export function ResultModal({ state, onClose, onPlayAgain }: ResultModalProps) {
  const [copied, setCopied] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const streak = getStoredStreak();
  const isWon = state.status === "won";
  const movie = state.movie;
  const showPoster = movie.posterUrl && !posterError;
  const cellKinds = useMemo(() => getGuessCellKinds(state), [state]);

  const narrator = useMemo(() => narratorLine(state), [state]);

  useEffect(() => {
    let cancelled = false;
    setRevealed(false);
    let innerRaf = 0;
    const outerRaf = window.requestAnimationFrame(() => {
      innerRaf = window.requestAnimationFrame(() => {
        if (!cancelled) setRevealed(true);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(outerRaf);
      if (innerRaf) window.cancelAnimationFrame(innerRaf);
    };
  }, [state.movie.title, state.status]);

  const shareText = useMemo(() => buildShareText(state), [state]);

  const handleShare = useCallback(async () => {
    const ok = await copyShareToClipboard(shareText);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }, [shareText]);

  const performanceText =
    isWon
      ? `Solved in ${state.guessesUsed}`
      : `X / ${MAX_GUESSES}`;

  const fade = () =>
    `transition-all duration-500 ease-out motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 ${
      revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
    }`;

  const fadeStyle = (delayMs: number) =>
    revealed ? ({ transitionDelay: `${delayMs}ms` } as const) : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-0 items-start justify-center overflow-hidden bg-black/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
      onClick={onClose}
    >
      <div
        className="flex min-h-0 w-full max-w-md flex-col items-center overflow-y-auto overscroll-contain px-2 pt-2 text-center"
        style={{ maxHeight: "min(100dvh - 2rem, 100vh - 2rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="result-title" className="sr-only">
          Game result
        </h2>

        {/* 1. Narrator */}
        <p
          className={`font-semibold tracking-tight text-white ${fade()}`}
          style={{ ...fadeStyle(0), fontSize: "clamp(1.75rem, 6vw, 2.25rem)" }}
          aria-live="polite"
        >
          {narrator}
        </p>

        {/* 2. Guess grid — CSS cells (share/clipboard still uses unicode in buildShareText) */}
        <div
          className={`mt-5 flex flex-none flex-row items-center justify-center ${fade()}`}
          style={{ ...fadeStyle(80), gap: 8 }}
          aria-hidden
        >
          {cellKinds.map((kind, i) => (
            <div
              key={i}
              style={{
                width: 36,
                height: 36,
                borderRadius: 4,
                flexShrink: 0,
                backgroundColor:
                  kind === "wrong"
                    ? "#3f3f46"
                    : kind === "win"
                      ? "#22c55e"
                      : "#ffffff20",
              }}
            />
          ))}
        </div>

        {/* 3. Performance */}
        <p
          className={`mt-5 font-bold tracking-tight text-white ${fade()}`}
          style={{ ...fadeStyle(160), fontSize: "clamp(1.75rem, 7vw, 2.5rem)" }}
        >
          {performanceText}
        </p>

        {/* 4. Movie (secondary) */}
        <p
          className={`mt-4 max-w-[90%] text-base text-zinc-400 sm:text-lg ${fade()}`}
          style={fadeStyle(240)}
        >
          {movie.title}{" "}
          <span className="text-zinc-500">({movie.year})</span>
        </p>

        {/* Optional poster — small, secondary */}
        {showPoster ? (
          <div
            className={`mt-5 min-h-0 shrink-0 overflow-hidden rounded-md bg-zinc-900 ${fade()}`}
            style={{ ...fadeStyle(300), width: "clamp(120px, 42vw, 140px)", height: "clamp(180px, 63vw, 210px)" }}
            aria-hidden
          >
            <img
              src={movie.posterUrl!}
              alt=""
              width={140}
              height={210}
              className="block h-full w-full object-cover object-center"
              onError={() => setPosterError(true)}
            />
          </div>
        ) : null}

        {/* 5. Streak (daily only) */}
        {state.isDaily && streak > 0 ? (
          <p
            className={`mt-4 text-lg font-semibold text-amber-400 sm:text-xl ${fade()}`}
            style={fadeStyle(360)}
          >
            Day {streak}{" "}
            <span aria-hidden>🔥</span>
          </p>
        ) : null}

        {/* 6. Actions — subtle */}
        <div
          className={`mt-8 flex w-full max-w-xs flex-col items-center gap-3 pb-4 ${fade()}`}
          style={fadeStyle(440)}
        >
          <button
            type="button"
            onClick={handleShare}
            className="text-sm font-medium text-white underline decoration-white/30 underline-offset-4 transition hover:decoration-white/70"
          >
            {copied ? "Copied" : "Share"}
          </button>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-zinc-500">
            <button
              type="button"
              onClick={onPlayAgain}
              className="transition hover:text-zinc-300"
            >
              {state.isDaily ? "Play again tomorrow" : "Play again"}
            </button>
            <button type="button" onClick={onClose} className="transition hover:text-zinc-300">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
