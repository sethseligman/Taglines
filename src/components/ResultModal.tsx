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

  const handleShare = useCallback(async () => {
    const text = buildShareText(state);
    const ok = await copyShareToClipboard(text);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }, [state]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/95 p-8 shadow-2xl transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="result-title" className="sr-only">
          Game result
        </h2>
        {isWon ? (
          <>
            <p className="mb-1 text-center text-sm font-medium uppercase tracking-wider text-emerald-400">
              Correct
            </p>
            <p className="mb-6 text-center text-2xl font-semibold text-white">
              {state.movie.title} ({state.movie.year})
            </p>
          </>
        ) : (
          <>
            <p className="mb-1 text-center text-sm font-medium uppercase tracking-wider text-rose-400">
              Out of guesses
            </p>
            <p className="mb-2 text-center text-xl font-semibold text-white">
              {state.movie.title}
            </p>
            <p className="mb-6 text-center text-zinc-400">
              {state.movie.year} · {state.movie.genre}
            </p>
          </>
        )}

        <div className="mb-6 flex justify-center gap-6 text-sm text-zinc-400">
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
  );
}
