"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  SLAM_ENTRANCE_EASING,
  SLAM_ENTRANCE_MS,
  SLAM_HOLD_MS,
  SLAM_INITIAL_SCALE,
  SLAM_RATTLE_ANIMATION,
} from "@/lib/slamEntrance";

const CHECK_GREEN = "#22c55e";
const POSTER_DELAY_MS = 250;
const SLAM_PRIME_MS = 50;

interface BetweenLegsOverlayProps {
  posterUrl: string | null;
  onComplete: () => void;
}

type Phase = "poster" | "prime" | "slam" | "hold" | "done";

export function BetweenLegsOverlay({ posterUrl, onComplete }: BetweenLegsOverlayProps) {
  const [phase, setPhase] = useState<Phase>("poster");
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setPhase("prime"), POSTER_DELAY_MS));
    timers.push(
      window.setTimeout(() => setPhase("slam"), POSTER_DELAY_MS + SLAM_PRIME_MS)
    );
    timers.push(
      window.setTimeout(
        () => setPhase("hold"),
        POSTER_DELAY_MS + SLAM_PRIME_MS + SLAM_ENTRANCE_MS
      )
    );
    timers.push(
      window.setTimeout(() => {
        setPhase("done");
        onCompleteRef.current();
      }, POSTER_DELAY_MS + SLAM_PRIME_MS + SLAM_ENTRANCE_MS + SLAM_HOLD_MS
    ));
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const checkScale = phase === "prime" ? SLAM_INITIAL_SCALE : 1;
  const checkOpacity = phase === "prime" ? 0 : 1;
  const checkTransition =
    phase === "slam"
      ? `transform ${SLAM_ENTRANCE_MS}ms ${SLAM_ENTRANCE_EASING}, opacity ${SLAM_ENTRANCE_MS}ms ease-out`
      : "none";

  const overlay = (
    <div
      className="fixed inset-0 z-[10070] flex flex-col items-center justify-center"
      style={{ background: "var(--background)" }}
      role="status"
      aria-live="polite"
      aria-label="Leg complete"
    >
      <div className="relative flex flex-col items-center px-6">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt=""
            className="mb-8 max-h-[40vh] w-auto max-w-[200px] rounded-lg object-contain shadow-2xl"
            style={{ opacity: 1 }}
          />
        ) : (
          <div
            className="mb-8 flex h-[200px] w-[140px] items-center justify-center rounded-lg border border-white/10 bg-white/5"
            style={{ opacity: 1 }}
          />
        )}
        {phase !== "poster" && phase !== "done" ? (
          <span
            aria-hidden
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 120,
              lineHeight: 1,
              color: CHECK_GREEN,
              transform: `scale(${checkScale})`,
              transformOrigin: "center",
              transition: checkTransition,
              opacity: checkOpacity,
              animation: phase === "hold" ? SLAM_RATTLE_ANIMATION : undefined,
            }}
          >
            ✓
          </span>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}
