"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  SLAM_ENTRANCE_EASING,
  SLAM_ENTRANCE_MS,
  SLAM_EASE_OUT,
  SLAM_INITIAL_SCALE,
} from "@/lib/slamEntrance";

const THINK_MS = 500;
const SLAM_MS = SLAM_ENTRANCE_MS;
const HOLD_MS = 400;
const FADE_MS = 150;
const COMPLETE_MS = THINK_MS + SLAM_MS + HOLD_MS + FADE_MS;
const FADE_START_MS = THINK_MS + SLAM_MS + HOLD_MS;
const REDUCE_MOTION_COMPLETE_MS = 220;
const EASE_OUT = SLAM_EASE_OUT;

interface WrongGuessFlashProps {
  onComplete: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function WrongGuessFlash({ onComplete }: WrongGuessFlashProps) {
  const [reduceMotion] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<"idle" | "slam" | "hold" | "fade">("idle");
  const timersRef = useRef<number[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (reduceMotion) {
      timersRef.current.push(
        window.setTimeout(() => {
          onCompleteRef.current();
        }, REDUCE_MOTION_COMPLETE_MS)
      );
      return () => {
        timersRef.current.forEach((t) => clearTimeout(t));
        timersRef.current = [];
      };
    }

    timersRef.current.push(window.setTimeout(() => setPhase("slam"), THINK_MS));
    timersRef.current.push(window.setTimeout(() => setPhase("hold"), THINK_MS + SLAM_MS));
    timersRef.current.push(window.setTimeout(() => setPhase("fade"), FADE_START_MS));
    timersRef.current.push(
      window.setTimeout(() => {
        onCompleteRef.current();
      }, COMPLETE_MS)
    );

    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
  }, [reduceMotion]);

  if (reduceMotion) {
    return null;
  }

  const scale = phase === "idle" ? SLAM_INITIAL_SCALE : 1;
  const opacity = phase === "idle" ? 0 : phase === "fade" ? 0 : 1;
  const transition =
    phase === "slam"
      ? `transform ${SLAM_MS}ms ${SLAM_ENTRANCE_EASING}, opacity ${SLAM_MS}ms ${EASE_OUT}`
      : phase === "fade"
        ? `opacity ${FADE_MS}ms ${EASE_OUT}`
        : "none";

  const mark = (
    <>
      <span
        aria-hidden
        style={{
          position: "fixed",
          top: "40%",
          left: "50%",
          zIndex: 10050,
          pointerEvents: "none",
          fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
          fontSize: 420,
          lineHeight: 1,
          color: "#C0392B",
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center",
          transition,
          opacity,
        }}
      >
        <span
          style={{
            display: "inline-block",
            animation: phase === "hold" ? "wrongGuessRattle 120ms ease-out 1" : undefined,
          }}
        >
          ✕
        </span>
      </span>
      <style jsx global>{`
        @keyframes wrongGuessRattle {
          0% {
            transform: translateX(0) rotate(0deg);
          }
          35% {
            transform: translateX(-1.8px) rotate(-1.6deg);
          }
          65% {
            transform: translateX(1.8px) rotate(1.6deg);
          }
          100% {
            transform: translateX(0) rotate(0deg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes wrongGuessRattle {
            from,
            to {
              transform: none;
            }
          }
        }
      `}</style>
    </>
  );
  if (typeof document === "undefined") {
    return mark;
  }
  return createPortal(mark, document.body);
}
