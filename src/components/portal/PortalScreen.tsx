"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DbChallenge } from "@/types/challenges";
import type { DailyCompletionResult } from "@/lib/storage";
import { getDailyCompletionResult } from "@/lib/storage";
import { getPortalChallengeProgress, loadChallengeRun, totalGuessesForRun } from "@/lib/challengeRunStorage";
import { getTodayDateKey } from "@/lib/generateChallengeDailyLegs";
import { FONT_DM, FONT_PLAYFAIR } from "@/lib/fontStacks";
import { TaglinesWordmark } from "@/components/ui/TaglinesWordmark";
import { PortalMenu } from "@/components/portal/PortalMenu";

export interface PortalScreenProps {
  dateKey: string;
  dailyTagline: string | null;
  challenges: DbChallenge[];
}

function formatHeaderDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function formatDailyResultSummary(result: DailyCompletionResult): string {
  if (result.status === "won") {
    const n = result.guessesUsed;
    return `Solved in ${n} ${n === 1 ? "guess" : "guesses"}`;
  }
  return `Didn't solve · ${result.guessesUsed} guesses`;
}

function challengeStatusLabel(challenge: DbChallenge, storageReady: boolean): string {
  if (!storageReady) return "Not started";
  return getPortalChallengeProgress(challenge.slug, challenge.leg_count).label;
}

function dailyPoolStatusLabel(challenge: DbChallenge, storageReady: boolean): string {
  if (!storageReady) return `${challenge.leg_count} ready`;
  const dateKey = getTodayDateKey();
  const progress = getPortalChallengeProgress(challenge.slug, challenge.leg_count, dateKey);
  if (progress.isNotStarted) return `${challenge.leg_count} ready`;
  const run = loadChallengeRun(challenge.slug, dateKey);
  if (run?.status === "finished") {
    return `Done · ${totalGuessesForRun(run)} guesses`;
  }
  if (run?.status === "failed") {
    return "Didn't finish · try again tomorrow";
  }
  return "In progress";
}

export function PortalScreen({ dateKey, dailyTagline, challenges }: PortalScreenProps) {
  const [dailyResult, setDailyResult] = useState<DailyCompletionResult | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    setDailyResult(getDailyCompletionResult(dateKey));
    setStorageReady(true);
  }, [dateKey]);

  const completionChallenges = challenges.filter(
    (c) => c.type === "completion" || c.type === "one_off"
  );
  const dailyPoolChallenges = challenges.filter((c) => c.type === "daily_pool");
  const isCompleted = dailyResult != null;

  return (
    <div
      className="relative mx-auto min-h-screen w-full max-w-lg md:max-w-2xl"
      style={{
        background: "var(--background)",
        fontFamily: FONT_DM,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, rgba(201,169,110,0.07), transparent 55%)",
        }}
        aria-hidden
      />

      <header
        className="relative flex items-center justify-between px-5 pb-3 pt-5 md:px-6 md:pt-6"
        style={{
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
        }}
      >
        <TaglinesWordmark />
        <div className="flex items-center gap-3.5">
          <span
            className="hidden text-[10px] uppercase tracking-[0.18em] sm:inline"
            style={{ color: "var(--muted)" }}
          >
            {formatHeaderDate(dateKey)}
          </span>
          <PortalMenu />
        </div>
      </header>

      <main className="relative px-4 pb-10 md:px-6">
        <DailyHeroCard
          dailyTagline={dailyTagline}
          dailyResult={dailyResult}
          isCompleted={isCompleted}
        />

        <section className="mt-6">
          <p
            className="text-[10px] uppercase tracking-[0.22em]"
            style={{ color: "var(--gold)" }}
          >
            Challenges
          </p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
            Completion runs and daily sets
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {completionChallenges.map((challenge) => (
              <ChallengeTile
                key={challenge.id}
                href={`/challenges/${challenge.slug}`}
                eyebrow={challenge.eyebrow ?? "Completion"}
                title={challenge.title}
                status={challengeStatusLabel(challenge, storageReady)}
                backgroundUrl={parseChallengeBackgroundUrl(challenge.art_config)}
              />
            ))}
            {dailyPoolChallenges.map((challenge) => (
              <ChallengeTile
                key={challenge.id}
                href={`/challenges/${challenge.slug}`}
                eyebrow={challenge.eyebrow ?? "Decade"}
                title={challenge.title}
                status={dailyPoolStatusLabel(challenge, storageReady)}
                backgroundUrl={parseChallengeBackgroundUrl(challenge.art_config)}
              />
            ))}
            <SeeAllTile />
          </div>
        </section>
      </main>
    </div>
  );
}

function DailyHeroCard({
  dailyTagline,
  dailyResult,
  isCompleted,
}: {
  dailyTagline: string | null;
  dailyResult: DailyCompletionResult | null;
  isCompleted: boolean;
}) {
  const cardInner = (
    <div
      className={`relative overflow-hidden rounded-[14px] border transition-opacity ${
        isCompleted ? "opacity-75" : ""
      }`}
      style={{
        background: "#141210",
        borderColor: isCompleted
          ? "rgba(255,255,255,0.08)"
          : "rgba(201,169,110,0.4)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(201,169,110,0.16), transparent 65%)",
        }}
        aria-hidden
      />

      {dailyTagline && !isCompleted ? (
        <div
          className="relative hidden border-b px-5 py-5 md:block"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          <p
            className="text-[10px] uppercase tracking-[0.28em]"
            style={{ color: "var(--gold)" }}
          >
            Today&apos;s Tagline
          </p>
          <blockquote
            className="mt-3.5 text-[19px] leading-snug"
            style={{
              fontFamily: FONT_PLAYFAIR,
              fontStyle: "italic",
              color: "var(--foreground)",
            }}
          >
            &ldquo;{dailyTagline}&rdquo;
          </blockquote>
        </div>
      ) : null}

      <div
        className="relative flex items-center justify-between gap-4 px-5 py-4 md:py-5"
        style={{ background: "#0F0E0D" }}
      >
        <div className="min-w-0">
          <p
            className="text-[10px] uppercase tracking-[0.28em] md:hidden"
            style={{ color: isCompleted ? "var(--muted)" : "var(--gold)" }}
          >
            Daily Tagline
          </p>
          <p
            className="mt-1 leading-tight md:mt-0"
            style={{
              fontFamily: FONT_PLAYFAIR,
              fontWeight: 700,
              fontSize: 22,
              color: isCompleted ? "#9a968c" : "var(--foreground)",
            }}
          >
            The Daily
            <br className="md:hidden" />
            <span className="hidden md:inline"> </span>
            Tagline
          </p>
          {isCompleted && dailyResult ? (
            <p className="mt-2 text-[13px]" style={{ color: "var(--muted)" }}>
              {formatDailyResultSummary(dailyResult)}
            </p>
          ) : (
            <p className="mt-1 text-[11px]" style={{ color: "#9a968c" }}>
              Once a day. Five guesses.
            </p>
          )}
        </div>

        {!isCompleted ? (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-medium"
            style={{ background: "var(--gold)", color: "#0D0D0D" }}
          >
            Play
            <span aria-hidden>→</span>
          </span>
        ) : (
          <span
            className="shrink-0 text-[11px] uppercase tracking-[0.12em]"
            style={{ color: "var(--muted)" }}
          >
            Done
          </span>
        )}
      </div>
    </div>
  );

  return (
    <Link href="/play" className="block no-underline">
      {cardInner}
    </Link>
  );
}

function parseChallengeBackgroundUrl(artConfig: Record<string, unknown> | null): string | null {
  if (!artConfig || typeof artConfig.backgroundUrl !== "string") return null;
  const url = artConfig.backgroundUrl.trim();
  return url.length > 0 ? url : null;
}

function ChallengeTile({
  href,
  eyebrow,
  title,
  status,
  backgroundUrl,
}: {
  href: string;
  eyebrow: string;
  title: string;
  status: string;
  backgroundUrl?: string | null;
}) {
  const hasBackground = Boolean(backgroundUrl);

  return (
    <Link
      href={href}
      className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-xl border p-3.5 no-underline transition hover:opacity-95 active:scale-[0.99]"
      style={{
        background: hasBackground ? "#0f0e0c" : "linear-gradient(135deg, #1a1814 0%, #0f0e0c 100%)",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      {hasBackground ? (
        <>
          <img
            src={backgroundUrl!}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "center 38%" }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 38%), linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 42%, rgba(0,0,0,0.08) 68%, rgba(0,0,0,0.2) 100%)",
            }}
            aria-hidden
          />
        </>
      ) : null}
      <div
        className="absolute left-0 top-0 bottom-0 z-[2] w-1 rounded-l-xl"
        style={{ background: "var(--gold)" }}
        aria-hidden
      />
      <p
        className="relative z-[3] text-[8px] uppercase tracking-[0.22em]"
        style={{
          color: hasBackground ? "rgba(255,255,255,0.82)" : "#9a968c",
          textShadow: hasBackground ? "0 1px 8px rgba(0,0,0,0.85)" : undefined,
        }}
      >
        {eyebrow}
      </p>
      <div className="relative z-[3]">
        <p
          className="text-[17px] leading-tight md:text-[19px]"
          style={{
            fontFamily: FONT_PLAYFAIR,
            fontWeight: 700,
            color: "var(--foreground)",
            textShadow: hasBackground ? "0 2px 12px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8)" : undefined,
          }}
        >
          {title}
        </p>
        <p
          className="mt-1.5 text-[10px]"
          style={{
            color: "var(--gold)",
            textShadow: hasBackground ? "0 1px 6px rgba(0,0,0,0.85)" : undefined,
          }}
        >
          {status}
        </p>
      </div>
    </Link>
  );
}

function SeeAllTile() {
  return (
    <Link
      href="/challenges"
      className="flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed no-underline transition hover:opacity-90"
      style={{
        background: "linear-gradient(135deg, #1a1814 0%, #0f0e0c 100%)",
        borderColor: "rgba(255,255,255,0.12)",
      }}
    >
      <span className="text-xl leading-none" style={{ color: "var(--muted)" }} aria-hidden>
        +
      </span>
      <span className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
        See all
      </span>
    </Link>
  );
}
