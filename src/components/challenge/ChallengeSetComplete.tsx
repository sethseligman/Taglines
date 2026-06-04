"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ResultAppShell } from "@/components/ResultAppShell";
import { FONT_DM, FONT_PLAYFAIR } from "@/lib/fontStacks";
import type { StoredChallengeRun } from "@/lib/challengeRunStorage";
import { formatChallengeRunDuration, totalGuessesForRun } from "@/lib/challengeRunStorage";

function verdictForTotal(totalGuesses: number, legCount: number): string {
  if (totalGuesses === legCount) {
    return "Five films. Five answers. The archaeologist would approve.";
  }
  if (totalGuesses <= legCount + 3) {
    return "A strong run through the set — the hat stays on.";
  }
  if (totalGuesses <= legCount * 2) {
    return "You made it through the set. The whip saw plenty of use.";
  }
  return "Every leg finished. Not every guess was pretty — but the set is done.";
}

interface ChallengeSetCompleteProps {
  challengeTitle: string;
  run: StoredChallengeRun;
  legCount: number;
}

export function ChallengeSetComplete({
  challengeTitle,
  run,
  legCount,
}: ChallengeSetCompleteProps) {
  const total = totalGuessesForRun(run);
  const perfect = total === legCount;
  const solvedCount = run.legs.filter((l) => l.solved).length;
  const narratorLine = verdictForTotal(total, legCount);
  const lastLeg = run.legs[run.legs.length - 1];
  const completedAt = lastLeg?.completedAt ?? new Date().toISOString();
  const durationLabel = formatChallengeRunDuration(run.startedAt, completedAt);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  return (
    <ResultAppShell>
      <div className="mx-auto w-full max-w-md text-center">
        <p
          className="text-xs uppercase tracking-[0.2em]"
          style={{ color: "var(--muted)", fontFamily: FONT_DM }}
        >
          {challengeTitle}
        </p>
        <p
          className="mt-6 text-xl leading-snug md:text-2xl"
          style={{ fontFamily: FONT_PLAYFAIR, fontStyle: "italic", color: "var(--gold)" }}
        >
          {narratorLine}
        </p>

        <p
          className="mt-8 uppercase tracking-[0.15em]"
          style={{ color: "var(--muted)", fontFamily: FONT_DM, fontSize: "0.68rem" }}
        >
          total guesses
        </p>
        <p
          className="leading-none text-gold"
          style={{ fontFamily: FONT_PLAYFAIR, fontSize: "5rem", marginTop: "0.2rem" }}
        >
          {total}
        </p>

        <p className="mt-3 text-sm text-muted" style={{ fontFamily: FONT_DM }}>
          {solvedCount} of {legCount} films solved
        </p>

        <p className="mt-2 text-sm text-muted" style={{ fontFamily: FONT_DM }}>
          {durationLabel}
        </p>

        {perfect ? (
          <p
            className="mt-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold"
            style={{ fontFamily: FONT_DM }}
          >
            Perfect run — one guess per film.
          </p>
        ) : null}

        <p className="mt-6 text-xs text-muted/80" style={{ fontFamily: FONT_DM }}>
          Leaderboard coming soon
        </p>

        <div className="mt-10 flex flex-col items-center gap-3">
          <Link
            href="/"
            className="inline-flex w-full max-w-xs items-center justify-center rounded-xl px-6 py-3.5 text-sm font-medium no-underline transition hover:opacity-95"
            style={{ background: "var(--gold)", color: "#0D0D0D", fontFamily: FONT_DM }}
          >
            Back to portal
          </Link>
          <Link
            href="/challenges"
            className="text-sm text-muted no-underline transition hover:text-foreground/80"
            style={{ fontFamily: FONT_DM }}
          >
            Play another challenge
          </Link>
        </div>
      </div>
    </ResultAppShell>
  );
}
