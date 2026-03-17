"use client";

import { useCallback, useState } from "react";
import type { GameState } from "@/hooks/useGameState";
import { buildShareText, copyShareToClipboard } from "@/lib/share";
import { getStoredStreak } from "@/lib/storage";

interface ResultModalProps {
  state: GameState;
  onClose: () => void;
  onPlayAgain: () => void;
}

export function ResultModal({ state, onClose, onPlayAgain }: ResultModalProps) {
  const [copied, setCopied] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const streak = getStoredStreak();
  const isWon = state.status === "won";
  const movie = state.movie;
  const showPoster = movie.posterUrl && !posterError;

  const handleShare = useCallback(async () => {
    const text = buildShareText(state);
    const ok = await copyShareToClipboard(text);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }, [state]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="result-title" className="sr-only">
          Game result
        </h2>

        {/* Poster: stable aspect and max height to prevent layout jump */}
        <div className="relative w-full min-h-[200px] max-h-[320px] bg-zinc-900 aspect-[2/3] overflow-hidden">
          {showPoster ? (
            <>
              <img
                src={movie.posterUrl!}
                alt={movie.title}
                className="absolute inset-0 h-full w-full object-cover object-center"
                onError={() => setPosterError(true)}
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent"
                aria-hidden
              />
            </>
          ) : (
            <div
              className="absolute inset-0 bg-gradient-to-b from-amber-950/40 to-zinc-950"
              aria-hidden
            />
          )}
          <div className="absolute bottom-0 left-0 right-0 p-5 pt-16">
            <p
              className={`mb-1.5 text-xs font-semibold uppercase tracking-widest ${
                isWon ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {isWon ? "Correct" : "The answer was"}
            </p>
            <h3 className="text-xl font-bold leading-tight text-white md:text-2xl" title={movie.title}>
              {movie.title}
            </h3>
            <p className="mt-0.5 text-sm text-zinc-400">{movie.year}</p>
          </div>
        </div>

        {/* Tagline + stats */}
        <div className="border-t border-white/10 p-5">
          <p className="mb-5 text-center text-base italic leading-relaxed text-zinc-300">
            &ldquo;{movie.officialTagline}&rdquo;
          </p>
          <div className="mb-5 flex justify-center gap-5 text-sm text-zinc-500">
            <span>Guesses: {state.guessesUsed}/5</span>
            {state.isDaily && streak > 0 && (
              <span className="text-amber-400">🔥 {streak} day streak</span>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleShare}
              className="w-full rounded-xl border border-white/20 bg-white/10 py-3 font-medium text-white transition hover:bg-white/20 active:scale-[0.98]"
            >
              {copied ? "Copied to clipboard!" : "Share results"}
            </button>
            <button
              type="button"
              onClick={onPlayAgain}
              className="w-full rounded-xl bg-amber-500/90 py-3 font-medium text-zinc-900 transition hover:bg-amber-500 active:scale-[0.98]"
            >
              {state.isDaily ? "Play again tomorrow" : "Play again"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-sm text-zinc-500 transition hover:text-zinc-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
