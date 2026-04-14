"use client";

import type { Movie } from "@/types/movie";
import type { HintLevel } from "@/types/movie";

interface HintRevealProps {
  movie: Movie;
  hintLevel: HintLevel;
  className?: string;
}

// Hint order: tagline → year → genre → cast → plot
function getHintContent(movie: Movie, level: HintLevel): string {
  switch (level) {
    case 0:
      return movie.officialTagline;
    case 1:
      return String(movie.year);
    case 2:
      return movie.genre;
    case 3:
      return movie.castHint;
    case 4:
      return movie.plotHint;
    default:
      return movie.officialTagline;
  }
}

const LABELS: Record<HintLevel, string> = {
  0: "Tagline",
  1: "Year",
  2: "Genre",
  3: "Cast",
  4: "Plot",
};

export function HintReveal({ movie, hintLevel, className = "" }: HintRevealProps) {
  const label = LABELS[hintLevel];
  const content = getHintContent(movie, hintLevel);

  return (
    <div
      className={`rounded-xl border border-white/10 bg-surface px-6 py-5 backdrop-blur-sm transition-all duration-300 ${className}`}
      style={{ animation: "fadeIn 0.4s ease-out" }}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-gold/90">
        {label}
      </p>
      <p
        className={`text-lg leading-relaxed text-foreground md:text-xl ${
          hintLevel === 0 ? "font-tagline-display" : ""
        }`}
      >
        {content}
      </p>
    </div>
  );
}
