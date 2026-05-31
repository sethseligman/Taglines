"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { GameEndSequence } from "@/components/GameEndSequence";
import { ResultAppShell } from "@/components/ResultAppShell";
import { MainMenu } from "@/components/MainMenu";
import { FONT_DM, FONT_PLAYFAIR } from "@/lib/fontStacks";
import { narratorResultLine } from "@/lib/narratorResult";
import type { StoredChallengeRun } from "@/lib/challengeRunStorage";
import type { ChallengeType } from "@/types/challenges";

interface ChallengeRunFailedProps {
  challengeTitle: string;
  challengeType: ChallengeType;
  run: StoredChallengeRun;
  legCount: number;
  onTryAgain: () => void;
}

export function ChallengeRunFailed({
  challengeTitle,
  challengeType,
  run,
  legCount,
  onTryAgain,
}: ChallengeRunFailedProps) {
  const router = useRouter();

  const failedLeg = useMemo(() => {
    const unsolved = run.legs.filter((l) => !l.solved);
    if (unsolved.length === 0) return run.legs[run.legs.length - 1] ?? null;
    return unsolved.sort((a, b) => a.position - b.position)[0] ?? null;
  }, [run.legs]);

  const failedLegIndex = failedLeg?.position ?? run.currentLegIndex + 1;
  const guessesUsed = failedLeg?.guessesUsed ?? 5;
  const narratorLine = narratorResultLine("lost", guessesUsed);

  const headerMenu = (
    <MainMenu
      challengeMenu={{
        title: challengeTitle,
        legIndex: Math.max(0, failedLegIndex - 1),
        legCount,
        score: 0,
        onExit: () => router.push("/"),
      }}
    />
  );

  return (
    <ResultAppShell headerMenu={headerMenu} relaxedVisual>
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

          <div className="mt-10 flex flex-col items-center gap-3">
            {challengeType === "daily_pool" ? (
              <p className="text-sm text-muted" style={{ fontFamily: FONT_DM }}>
                Try again tomorrow
              </p>
            ) : (
              <button
                type="button"
                onClick={onTryAgain}
                className="inline-flex w-full max-w-xs cursor-pointer items-center justify-center rounded-xl border-0 px-6 py-3.5 text-sm font-medium transition hover:opacity-95"
                style={{ background: "var(--gold)", color: "#0D0D0D", fontFamily: FONT_DM }}
              >
                Try again from the start
              </button>
            )}
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
