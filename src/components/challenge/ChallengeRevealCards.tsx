"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublishedChallengeLeg } from "@/actions/challenges";
import { FONT_PLAYFAIR } from "@/lib/fontStacks";
import type { StoredChallengeRun } from "@/lib/challengeRunStorage";

type CardData = {
  position: number;
  posterUrl: string | null;
  solved: boolean;
};

const backfaceHidden: React.CSSProperties = {
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
};

const FLIP_INITIAL_MS = 2800;
const FLIP_STAGGER_MS = 600;

function parseChallengeBackgroundUrl(
  artConfig: Record<string, unknown> | null
): string | null {
  if (!artConfig || typeof artConfig.backgroundUrl !== "string") return null;
  const url = artConfig.backgroundUrl.trim();
  return url || null;
}

function buildCardData(legs: PublishedChallengeLeg[], run: StoredChallengeRun): CardData[] {
  return [...legs]
    .sort((a, b) => a.position - b.position)
    .map((leg) => {
      const runLeg = run.legs.find((r) => r.position === leg.position);
      return {
        position: leg.position,
        posterUrl: leg.movie.posterUrl ?? null,
        solved: runLeg?.solved ?? false,
      };
    });
}

export interface ChallengeRevealCardsProps {
  legs: PublishedChallengeLeg[];
  run: StoredChallengeRun;
  challengeArtConfig: Record<string, unknown> | null;
}

export function ChallengeRevealCards({
  legs,
  run,
  challengeArtConfig,
}: ChallengeRevealCardsProps) {
  const cardData = useMemo(() => buildCardData(legs, run), [legs, run]);
  const backgroundUrl = parseChallengeBackgroundUrl(challengeArtConfig);
  const [flipped, setFlipped] = useState<boolean[]>(() => cardData.map(() => false));

  useEffect(() => {
    setFlipped(cardData.map(() => false));
    const timers = cardData.map((_, i) =>
      window.setTimeout(() => {
        setFlipped((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, FLIP_INITIAL_MS + i * FLIP_STAGGER_MS)
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [cardData]);

  if (cardData.length === 0) return null;

  return (
    <div className="flex w-full flex-wrap justify-center gap-2 md:flex-nowrap">
      {cardData.map((card, i) => (
        <div
          key={card.position}
          className="relative aspect-[2/3] w-[30%] md:max-w-[18%] md:flex-1"
          style={{ perspective: "1000px" }}
        >
          <div
            className="relative h-full w-full"
            style={{
              transformStyle: "preserve-3d",
              transition: "transform 400ms ease-in-out",
              transform: flipped[i] ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            <div
              className="card-back absolute inset-0 overflow-hidden rounded-sm"
              style={backfaceHidden}
            >
              {backgroundUrl ? (
                <img src={backgroundUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#0D0D0D]">
                  <span
                    style={{
                      fontFamily: FONT_PLAYFAIR,
                      fontStyle: "italic",
                      fontSize: "1.5rem",
                      color: "rgba(201,169,110,0.6)",
                    }}
                  >
                    T
                  </span>
                </div>
              )}
            </div>

            <div
              className="card-front absolute inset-0 overflow-hidden rounded-sm bg-[#0D0D0D]"
              style={{
                ...backfaceHidden,
                transform: "rotateY(180deg)",
              }}
            >
              {card.posterUrl ? (
                <img src={card.posterUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl">🎞️</div>
              )}
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.35)" }}
                aria-hidden
              >
                <span
                  style={{
                    fontSize: "2rem",
                    lineHeight: 1,
                    color: card.solved ? "#22c55e" : "#ef4444",
                  }}
                >
                  {card.solved ? "✓" : "✕"}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
