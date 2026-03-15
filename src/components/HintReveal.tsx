"use client";

import type { Movie } from "@/types/movie";
import type { HintLevel } from "@/types/movie";

interface HintRevealProps {
  movie: Movie;
  hintLevel: HintLevel;
  className?: string;
}

function getHintContent(movie: Movie, level: HintLevel): string {
  switch (level) {
    case 0:
      return movie.officialTagline;
    case 1:
      return movie.genre;
    case 2:
      return movie.castHint;
    case 3:
      return movie.plotHint;
    case 4:
      return String(movie.year);
    default:
      return movie.officialTagline;
  }
}

const LABELS: Record<HintLevel, string> = {
  0: "Tagline",
  1: "Genre",
  2: "Cast",
  3: "Plot",
  4: "Year",
};

export function HintReveal({ movie, hintLevel, className = "" }: HintRevealProps) {
  const label = LABELS[hintLevel];
  const content = getHintContent(movie, hintLevel);

  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/5 px-6 py-5 backdrop-blur-sm transition-all duration-300 ${className}`}
      style={{ animation: "fadeIn 0.4s ease-out" }}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-amber-400/90">
        {label}
      </p>
      <p className="text-lg leading-relaxed text-zinc-100 md:text-xl">
        {content}
      </p>
    </div>
  );
}
