"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  SLAM_ENTRANCE_EASING,
  SLAM_ENTRANCE_MS,
  SLAM_EASE_OUT,
  SLAM_HOLD_MS,
  SLAM_INITIAL_SCALE,
  SLAM_RATTLE_ANIMATION,
  SLAM_THINK_MS,
  WRONG_GUESS_RED,
} from "@/lib/slamEntrance";

const SLAM_MS = SLAM_ENTRANCE_MS;
const FADE_MS = 150;
const COMPLETE_MS = SLAM_THINK_MS + SLAM_MS + SLAM_HOLD_MS + FADE_MS;
const FADE_START_MS = SLAM_THINK_MS + SLAM_MS + SLAM_HOLD_MS;
const REDUCE_MOTION_COMPLETE_MS = 220;
const EASE_OUT = SLAM_EASE_OUT;

interface WrongGuessFlashProps {
  onComplete: () => void;
  /** Fires at SLAM_THINK_MS — same beat as the ✕ strike. Used for loss border slam sync. */
  onSlam?: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function WrongGuessFlash({ onComplete, onSlam }: WrongGuessFlashProps) {
  const [reduceMotion] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<"idle" | "slam" | "hold" | "fade">("idle");
  const timersRef = useRef<number[]>([]);
  const onCompleteRef = useRef(onComplete);
  const onSlamRef = useRef(onSlam);
  onCompleteRef.current = onComplete;
  onSlamRef.current = onSlam;

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

    timersRef.current.push(
      window.setTimeout(() => {
        setPhase("slam");
        onSlamRef.current?.();
      }, SLAM_THINK_MS)
    );
    timersRef.current.push(window.setTimeout(() => setPhase("hold"), SLAM_THINK_MS + SLAM_MS));
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
        color: WRONG_GUESS_RED,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: "center",
        transition,
        opacity,
      }}
    >
      <span
        style={{
          display: "inline-block",
          animation: phase === "hold" ? SLAM_RATTLE_ANIMATION : undefined,
        }}
      >
        ✕
      </span>
    </span>
  );
  if (typeof document === "undefined") {
    return mark;
  }
  return createPortal(mark, document.body);
}
