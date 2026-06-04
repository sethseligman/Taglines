"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import type { PublishedChallengeLeg } from "@/actions/challenges";
import { ChallengeRevealCards } from "@/components/challenge/ChallengeRevealCards";
import { GameEndSequence } from "@/components/GameEndSequence";
import { ResultAppShell } from "@/components/ResultAppShell";
import { FONT_DM } from "@/lib/fontStacks";
import { challengeFailedNarratorLine } from "@/lib/challengeNarratorLines";
import { narratorResultLine } from "@/lib/narratorResult";
import type { StoredChallengeRun } from "@/lib/challengeRunStorage";
import type { ChallengeType } from "@/types/challenges";

interface ChallengeRunFailedProps {
  challengeTitle: string;
  challengeType: ChallengeType;
  run: StoredChallengeRun;
  legCount: number;
  onTryAgain: () => void;
  legs: PublishedChallengeLeg[];
  challengeArtConfig: Record<string, unknown> | null;
}

export function ChallengeRunFailed({
  challengeTitle,
  challengeType,
  run,
  legCount,
  onTryAgain,
  legs,
  challengeArtConfig,
}: ChallengeRunFailedProps) {
  const failedLeg = useMemo(() => {
    const unsolved = run.legs.filter((l) => !l.solved);
    if (unsolved.length === 0) return run.legs[run.legs.length - 1] ?? null;
    return unsolved.sort((a, b) => a.position - b.position)[0] ?? null;
  }, [run.legs]);

  const failedLegIndex = failedLeg?.position ?? run.currentLegIndex + 1;
  const guessesUsed = failedLeg?.guessesUsed ?? 5;
  const correctLegs = run.legs.filter((l) => l.solved).length;
  const narratorLine =
    challengeType === "daily_pool"
      ? challengeFailedNarratorLine(correctLegs)
      : narratorResultLine("lost", guessesUsed);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  return (
    <ResultAppShell>
      <GameEndSequence
        resultStatus="lost"
        narratorLine={narratorLine}
        posterUrl={null}
        showPoster={false}
      >
        <div className="mx-auto w-full max-w-md text-center">
          <p
            className="text-xs uppercase tracking-[0.2em]"
            style={{ color: "var(--muted)", fontFamily: FONT_DM }}
          >
            {challengeTitle}
          </p>

          <p className="mt-6 text-sm text-muted" style={{ fontFamily: FONT_DM }}>
            Failed on leg {failedLegIndex} of {legCount}
          </p>

          <p
            className="mt-2 text-[#f0ede6]"
            style={{ fontFamily: FONT_DM, fontSize: "1rem" }}
          >
            {guessesUsed} wrong {guessesUsed === 1 ? "guess" : "guesses"} — challenge over
          </p>

          {challengeType === "daily_pool" ? (
            <div className="mt-8 px-2">
              <ChallengeRevealCards legs={legs} run={run} challengeArtConfig={challengeArtConfig} />
            </div>
          ) : null}

          <div className="mt-10 flex flex-col items-center gap-3">
            {challengeType === "daily_pool" ? (
              <p className="text-sm text-muted" style={{ fontFamily: FONT_DM }}>
                Try again tomorrow
              </p>
            ) : challengeType === "completion" || challengeType === "one_off" ? (
              <button
                type="button"
                onClick={onTryAgain}
                className="inline-flex w-full max-w-xs cursor-pointer items-center justify-center rounded-xl border-0 px-6 py-3.5 text-sm font-medium transition hover:opacity-95"
                style={{ background: "var(--gold)", color: "#0D0D0D", fontFamily: FONT_DM }}
              >
                Try again from the start
              </button>
            ) : null}
            <Link
              href="/"
              className="text-sm text-muted no-underline transition hover:text-foreground/80"
              style={{ fontFamily: FONT_DM }}
            >
              Back to portal
            </Link>
          </div>
        </div>
      </GameEndSequence>
    </ResultAppShell>
  );
}
