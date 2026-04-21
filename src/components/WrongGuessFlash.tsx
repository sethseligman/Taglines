"use client";

import { useEffect, useRef, useState } from "react";

const THINK_MS = 500;
const SLAM_MS = 100;
const HOLD_MS = 400;
const FADE_MS = 150;
const COMPLETE_MS = THINK_MS + SLAM_MS + HOLD_MS + FADE_MS; // 1150ms total
const FADE_START_MS = THINK_MS + SLAM_MS + HOLD_MS; // 1000ms

interface WrongGuessFlashProps {
  onComplete: () => void;
}

export function WrongGuessFlash({ onComplete }: WrongGuessFlashProps) {
  const [phase, setPhase] = useState<"idle" | "slam" | "hold" | "fade">("idle");
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    timersRef.current.push(window.setTimeout(() => setPhase("slam"), THINK_MS));
    timersRef.current.push(window.setTimeout(() => setPhase("hold"), THINK_MS + SLAM_MS));
    timersRef.current.push(window.setTimeout(() => setPhase("fade"), FADE_START_MS));
    timersRef.current.push(window.setTimeout(onComplete, COMPLETE_MS));

    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
  }, [onComplete]);

  const scale = phase === "idle" ? 1.3 : 1;
  const opacity = phase === "idle" ? 0 : phase === "fade" ? 0 : 1;
  const transition =
    phase === "slam"
      ? `transform ${SLAM_MS}ms cubic-bezier(0.2,0,0.3,1)`
      : phase === "fade"
        ? `opacity ${FADE_MS}ms ease`
        : "none";

  return (
    <>
      <span
        aria-hidden
        style={{
          position: "fixed",
          top: "40%",
          left: "50%",
          zIndex: 51,
          pointerEvents: "none",
          fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
          fontSize: 196,
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
            animation: phase === "hold" ? "wrongGuessRattle 90ms ease-in-out 3" : undefined,
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
          25% {
            transform: translateX(-1.8px) rotate(-1.6deg);
          }
          50% {
            transform: translateX(1.8px) rotate(1.6deg);
          }
          75% {
            transform: translateX(-1px) rotate(-0.8deg);
          }
          100% {
            transform: translateX(0) rotate(0deg);
          }
        }
      `}</style>
    </>
  );
}
