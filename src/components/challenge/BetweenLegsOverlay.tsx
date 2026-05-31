"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { posterFrameStyle, posterPlaceholderFrameStyle } from "@/lib/posterFrameStyle";
import { SLAM_EASE_OUT, SLAM_THINK_MS } from "@/lib/slamEntrance";

const CHECK_GREEN = "#22c55e";
const CHECK_SIZE_PX = 168;
const CHECK_PATH = "M18 54 L42 78 L82 26";
const POSTER_ENTRANCE_MS = 280;
const CHECK_DRAW_MS = 280;
const CHECK_HOLD_MS = 360;
const REDUCE_MOTION_COMPLETE_MS = 400;

interface BetweenLegsOverlayProps {
  posterUrl: string | null;
  onComplete: () => void;
}

type Phase = "poster" | "think" | "draw" | "hold" | "done";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function PosterCheckDraw({ drawing }: { drawing: boolean }) {
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(120);

  useLayoutEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    setPathLength(path.getTotalLength());
  }, []);

  return (
    <svg
      className="pointer-events-none absolute inset-0 m-auto"
      width={CHECK_SIZE_PX}
      height={CHECK_SIZE_PX}
      viewBox="0 0 100 100"
      aria-hidden
      style={{ filter: "drop-shadow(0 2px 12px rgba(0,0,0,0.85)) drop-shadow(0 0 20px rgba(0,0,0,0.5))" }}
    >
      <path
        ref={pathRef}
        d={CHECK_PATH}
        fill="none"
        stroke={CHECK_GREEN}
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          ["--check-path-length" as string]: `${pathLength}px`,
          strokeDasharray: pathLength,
          strokeDashoffset: drawing ? undefined : 0,
          animation: drawing ? `checkStrokeDraw ${CHECK_DRAW_MS}ms ease-out forwards` : undefined,
        }}
      />
    </svg>
  );
}

export function BetweenLegsOverlay({ posterUrl, onComplete }: BetweenLegsOverlayProps) {
  const isDesktop = useIsDesktop();
  const posterFrame = posterFrameStyle(isDesktop);
  const [reduceMotion] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<Phase>("poster");
  const [posterOpacity, setPosterOpacity] = useState(reduceMotion ? 1 : 0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (reduceMotion) return;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPosterOpacity(1));
    });
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  useEffect(() => {
    const timers: number[] = [];

    if (reduceMotion) {
      timers.push(window.setTimeout(() => setPhase("hold"), 80));
      timers.push(
        window.setTimeout(() => {
          setPhase("done");
          onCompleteRef.current();
        }, REDUCE_MOTION_COMPLETE_MS)
      );
      return () => timers.forEach((t) => clearTimeout(t));
    }

    const thinkAt = POSTER_ENTRANCE_MS;
    const drawAt = thinkAt + SLAM_THINK_MS;
    const holdAt = drawAt + CHECK_DRAW_MS;
    const doneAt = holdAt + CHECK_HOLD_MS;

    timers.push(window.setTimeout(() => setPhase("think"), thinkAt));
    timers.push(window.setTimeout(() => setPhase("draw"), drawAt));
    timers.push(window.setTimeout(() => setPhase("hold"), holdAt));
    timers.push(
      window.setTimeout(() => {
        setPhase("done");
        onCompleteRef.current();
      }, doneAt)
    );

    return () => timers.forEach((t) => clearTimeout(t));
  }, [reduceMotion]);

  const posterVisible = phase !== "done";
  const posterTransition = reduceMotion ? "none" : `opacity ${POSTER_ENTRANCE_MS}ms ${SLAM_EASE_OUT}`;
  const showCheck = phase === "draw" || phase === "hold";

  const overlay = (
    <div
      className="fixed inset-0 z-[10070] flex flex-col items-center justify-center"
      style={{ background: "var(--background)" }}
      role="status"
      aria-live="polite"
      aria-label="Leg complete"
    >
      <div className="relative flex flex-col items-center px-6">
        {posterVisible ? (
          <div className="relative inline-block">
            {posterUrl ? (
              <img
                src={posterUrl}
                alt=""
                className="block object-contain object-center"
                style={{
                  ...posterFrame,
                  opacity: posterOpacity,
                  transition: posterTransition,
                }}
              />
            ) : (
              <div
                className="flex items-center justify-center bg-[#161616]"
                style={{
                  ...posterPlaceholderFrameStyle(isDesktop),
                  opacity: posterOpacity,
                  transition: posterTransition,
                }}
              />
            )}
            {showCheck ? <PosterCheckDraw drawing={phase === "draw"} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}
