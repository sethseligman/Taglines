"use client";

import type { Movie } from "@/types/movie";
import type { HintLevel } from "@/types/movie";
import { getHintBodyForLevel } from "@/lib/hintContent";

interface HintRevealProps {
  movie: Movie;
  hintLevel: HintLevel;
  className?: string;
}

export function HintReveal({ movie, hintLevel, className = "" }: HintRevealProps) {
  const content = getHintBodyForLevel(movie, hintLevel);
  const isStandaloneYearHint = hintLevel === 1 && /^\d{4}$/.test(content);

  if (hintLevel === 0) {
    return (
      <div className={`text-center ${className}`}>
        <p
          className="font-tagline-display text-foreground"
          style={{
            fontSize: "clamp(1.25rem, 4.5vw, 1.65rem)",
            lineHeight: 1.45,
            textShadow: "0 0 40px rgba(201,169,110,0.12), 0 0 80px rgba(201,169,110,0.05)",
          }}
        >
          {content}
        </p>
        <div
          className="mx-auto mt-6"
          style={{
            width: 24,
            height: 1,
            backgroundColor: "rgba(201, 169, 110, 0.4)",
          }}
          aria-hidden
        />
      </div>
    );
  }

  if (isStandaloneYearHint) {
    return (
      <div className={`film-fade-in text-center ${className}`}>
        <p
          className="font-tagline-display"
          style={{
            fontSize: "clamp(1.7rem, 8vw, 2.5rem)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "rgba(201,169,110,0.92)",
            textShadow: "0 0 24px rgba(201,169,110,0.28), 0 1px 8px rgba(0,0,0,0.45)",
            animation: "fadeIn 0.38s ease-out both",
          }}
        >
          {content}
        </p>
      </div>
    );
  }

  return (
    <div className={`film-fade-in text-center ${className}`}>
      <p
        className="text-base leading-relaxed md:text-lg"
        style={{
          fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
          color: "#c4bfb3",
        }}
      >
        {content}
      </p>
    </div>
  );
}
