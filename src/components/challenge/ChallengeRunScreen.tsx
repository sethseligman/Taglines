"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DbChallenge } from "@/types/challenges";
import type { PublishedChallengeLeg } from "@/actions/challenges";
import {
  getOrInitChallengeRun,
  loadChallengeRun,
  markChallengeRunFailed,
  restartChallengeRun,
  saveChallengeRun,
  type StoredChallengeRun,
} from "@/lib/challengeRunStorage";
import { ChallengeProgressTracker } from "@/components/challenge/ChallengeProgressTracker";
import { ChallengeLegGame, type LegCompletePayload } from "@/components/challenge/ChallengeLegGame";
import { BetweenLegsOverlay } from "@/components/challenge/BetweenLegsOverlay";
import { ChallengeSetComplete } from "@/components/challenge/ChallengeSetComplete";
import { ChallengeRunFailed } from "@/components/challenge/ChallengeRunFailed";
import { GamePlayHeader } from "@/components/game/GamePlayHeader";
import { MainMenu } from "@/components/MainMenu";
import { FONT_PLAYFAIR } from "@/lib/fontStacks";
import { getTodayDateKey } from "@/lib/generateChallengeDailyLegs";

type RunPhase = "playing" | "between" | "complete" | "failed";

interface ChallengeRunScreenProps {
  challenge: DbChallenge;
  legs: PublishedChallengeLeg[];
}

export function ChallengeRunScreen({ challenge, legs }: ChallengeRunScreenProps) {
  const router = useRouter();
  const [run, setRun] = useState<StoredChallengeRun | null>(null);
  const [phase, setPhase] = useState<RunPhase>("playing");
  const [betweenPosterUrl, setBetweenPosterUrl] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [playLayoutRelaxed, setPlayLayoutRelaxed] = useState(true);
  const pendingLegRef = useRef<LegCompletePayload | null>(null);

  const sortedLegs = useMemo(
    () => [...legs].sort((a, b) => a.position - b.position),
    [legs]
  );

  const runDateKey = challenge.type === "daily_pool" ? getTodayDateKey() : undefined;

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const existing = loadChallengeRun(challenge.slug, runDateKey);
    if (existing?.status === "finished") {
      setRun(existing);
      setPhase("complete");
    } else if (existing?.status === "failed") {
      setRun(existing);
      setPhase("failed");
    } else if (existing) {
      setRun(existing);
    } else {
      setRun(getOrInitChallengeRun(challenge.slug, runDateKey));
    }
    setHydrated(true);
  }, [challenge.slug, runDateKey]);

  const currentLeg = sortedLegs[run?.currentLegIndex ?? 0] ?? null;
  const completedPositions = run?.legs.filter((l) => l.solved).map((l) => l.position) ?? [];
  const legSessionKey = currentLeg
    ? `challenge:${challenge.slug}:leg:${currentLeg.position}`
    : "";

  const persistRun = useCallback(
    (next: StoredChallengeRun) => {
      saveChallengeRun(next, runDateKey);
      setRun(next);
    },
    [runDateKey]
  );

  const finishRun = useCallback(
    (current: StoredChallengeRun) => {
      const finished: StoredChallengeRun = {
        ...current,
        status: "finished",
        currentLegIndex: challenge.leg_count,
      };
      persistRun(finished);
      setPhase("complete");
    },
    [challenge.leg_count, persistRun]
  );

  const advanceAfterWin = useCallback(
    (current: StoredChallengeRun, payload: LegCompletePayload, movieId: string, position: number) => {
      const legEntry = {
        movieId,
        position,
        guessesUsed: payload.guessesUsed,
        solved: true,
        completedAt: new Date().toISOString(),
      };

      const legsWithoutPosition = current.legs.filter((l) => l.position !== position);
      const nextLegs = [...legsWithoutPosition, legEntry].sort((a, b) => a.position - b.position);
      const nextIndex = current.currentLegIndex + 1;
      const nextRun: StoredChallengeRun = {
        ...current,
        legs: nextLegs,
        currentLegIndex: nextIndex,
      };

      if (nextIndex >= challenge.leg_count) {
        finishRun(nextRun);
        return;
      }

      persistRun(nextRun);
      setPhase("playing");
    },
    [challenge.leg_count, finishRun, persistRun]
  );

  const failRun = useCallback(
    (current: StoredChallengeRun, payload: LegCompletePayload, movieId: string, position: number) => {
      const failed = markChallengeRunFailed(
        current,
        movieId,
        position,
        payload.guessesUsed,
        runDateKey
      );
      setRun(failed);
      setPhase("failed");
    },
    [runDateKey]
  );

  const handleTryAgain = useCallback(() => {
    pendingLegRef.current = null;
    setBetweenPosterUrl(null);
    const fresh = restartChallengeRun(challenge.slug, runDateKey);
    setRun(fresh);
    setPhase("playing");
  }, [challenge.slug, runDateKey]);

  const handleLegComplete = useCallback(
    (payload: LegCompletePayload) => {
      if (!run || !currentLeg) return;

      if (payload.solved) {
        pendingLegRef.current = payload;
        setBetweenPosterUrl(currentLeg.movie.posterUrl ?? null);
        setPhase("between");
        return;
      }

      failRun(run, payload, currentLeg.movieId, currentLeg.position);
    },
    [run, currentLeg, failRun]
  );

  const handleBetweenComplete = useCallback(() => {
    if (!run || !currentLeg) return;
    const payload = pendingLegRef.current;
    if (!payload) return;
    pendingLegRef.current = null;
    advanceAfterWin(run, payload, currentLeg.movieId, currentLeg.position);
    setBetweenPosterUrl(null);
  }, [run, currentLeg, advanceAfterWin]);

  const headerMenu = run ? (
    <MainMenu
      challengeMenu={{
        title: challenge.title,
        legIndex: run.currentLegIndex,
        legCount: challenge.leg_count,
        score: 0,
        onExit: () => router.push("/"),
      }}
    />
  ) : null;

  if (!hydrated || !run) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080808] text-muted text-sm">
        Loading challenge…
      </div>
    );
  }

  if (legs.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#080808] px-6 text-center">
        <p className="text-foreground">Today&apos;s challenge isn&apos;t ready yet. Check back soon.</p>
        <Link href="/" className="mt-4 text-sm text-gold">
          ← Portal
        </Link>
      </div>
    );
  }

  if (phase === "failed" || run.status === "failed") {
    return (
      <ChallengeRunFailed
        challengeTitle={challenge.title}
        challengeType={challenge.type}
        run={run}
        legCount={challenge.leg_count}
        onTryAgain={handleTryAgain}
      />
    );
  }

  if (phase === "complete" || run.status === "finished") {
    return (
      <ChallengeSetComplete
        challengeTitle={challenge.title}
        run={run}
        legCount={challenge.leg_count}
      />
    );
  }

  if (!currentLeg) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#080808] px-6 text-center">
        <p className="text-foreground">No movies configured for this challenge.</p>
        <Link href="/" className="mt-4 text-sm text-gold">
          ← Portal
        </Link>
      </div>
    );
  }

  const relaxedVisual = isDesktop || playLayoutRelaxed;
  const backgroundUrl = parseChallengeBackgroundUrl(challenge.art_config);

  return (
    <div
      className={`relative min-h-screen w-full bg-[#080808] text-foreground ${isDesktop ? "overflow-x-hidden" : "overflow-hidden"}`}
    >
      {backgroundUrl ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[-1]"
          style={{
            backgroundImage: `url("${backgroundUrl}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.12,
          }}
        />
      ) : null}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 200px 500px at 50% -5%, rgba(201,169,110,0.04) 0%, transparent 70%)",
        }}
      />

      <div
        className={
          isDesktop
            ? "relative flex min-h-screen w-full flex-col"
            : "relative flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden"
        }
      >
        <div
          className={
            isDesktop
              ? "relative z-10 flex flex-1 flex-col"
              : "relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden"
          }
        >
          <main
            className={
              isDesktop
                ? `flex flex-1 flex-col justify-start px-5 pb-12 md:px-8 ${relaxedVisual ? "pt-5 md:pt-7" : "pt-2"}`
                : `flex min-h-0 flex-1 flex-col justify-start overflow-y-auto overscroll-contain px-5 pb-12 md:px-8 ${relaxedVisual ? "pt-5 md:pt-7" : "pt-2"}`
            }
          >
            <GamePlayHeader headerMenu={headerMenu} relaxedVisual={relaxedVisual} />

            <div className="mx-auto mb-4 flex w-full max-w-lg items-end justify-between gap-3 border-b border-white/5 pb-3">
              <p
                className="min-w-0 truncate text-sm font-medium text-foreground"
                style={{ fontFamily: FONT_PLAYFAIR }}
              >
                {challenge.title}
              </p>
              <ChallengeProgressTracker
                currentLegIndex={run.currentLegIndex}
                legCount={challenge.leg_count}
                completedPositions={completedPositions}
              />
            </div>

            {phase === "playing" ? (
              <ChallengeLegGame
                key={legSessionKey}
                movie={currentLeg.movie}
                legSessionKey={legSessionKey}
                onLegComplete={handleLegComplete}
                relaxedVisual={relaxedVisual}
                onLayoutBreathingChange={isDesktop ? undefined : setPlayLayoutRelaxed}
              />
            ) : null}
          </main>
        </div>
      </div>

      {phase === "between" ? (
        <BetweenLegsOverlay posterUrl={betweenPosterUrl} onComplete={handleBetweenComplete} />
      ) : null}
    </div>
  );
}

function parseChallengeBackgroundUrl(artConfig: Record<string, unknown> | null): string | null {
  if (!artConfig || typeof artConfig.backgroundUrl !== "string") return null;
  const url = artConfig.backgroundUrl.trim();
  return url.length > 0 ? url : null;
}
