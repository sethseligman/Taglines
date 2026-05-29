"use client";

interface ChallengeProgressTrackerProps {
  currentLegIndex: number;
  legCount: number;
  completedPositions: number[];
}

export function ChallengeProgressTracker({
  currentLegIndex,
  legCount,
  completedPositions,
}: ChallengeProgressTrackerProps) {
  const completedSet = new Set(completedPositions);
  const activeIndex = Math.min(currentLegIndex, legCount - 1);

  return (
    <div className="flex flex-col items-end gap-1">
      <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--muted)" }}>
        Leg {Math.min(currentLegIndex + 1, legCount)} of {legCount}
      </p>
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: legCount }, (_, i) => {
          const done = completedSet.has(i + 1);
          const active = i === activeIndex && !done;
          return (
            <span
              key={i}
              className="block h-2 w-2 rounded-sm border"
              style={{
                background: done ? "var(--gold)" : active ? "rgba(201,169,110,0.35)" : "transparent",
                borderColor: done || active ? "var(--gold)" : "rgba(255,255,255,0.15)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
