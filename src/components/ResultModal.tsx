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
  const streak = getStoredStreak();
  const isWon = state.status === "won";
  const movie = state.movie;

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
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="result-title" className="sr-only">
          Game result
        </h2>

        {/* Poster + gradient overlay */}
        <div className="relative aspect-[2/3] w-full bg-zinc-900">
          {movie.posterUrl ? (
            <>
              <img
                src={movie.posterUrl}
                alt=""
                className="h-full w-full object-cover"
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
          {/* Result badge overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6 pt-20">
            <p
              className={`mb-2 text-xs font-semibold uppercase tracking-widest ${
                isWon ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {isWon ? "Correct" : "The answer was"}
            </p>
            <h3 className="text-2xl font-bold text-white md:text-3xl">
              {movie.title}
            </h3>
            <p className="mt-1 text-zinc-400">{movie.year}</p>
          </div>
        </div>

        {/* Tagline + stats */}
        <div className="border-t border-white/10 p-6">
          <p className="mb-6 text-center text-lg italic leading-relaxed text-zinc-300">
            &ldquo;{movie.officialTagline}&rdquo;
          </p>
          <div className="mb-6 flex justify-center gap-6 text-sm text-zinc-500">
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
