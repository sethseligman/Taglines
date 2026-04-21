"use client";

import { useEffect, useRef, useState } from "react";

const FADE_IN_MS = 100;
const X_SETTLE_MS = 150;
const HOLD_TOTAL_MS = 400;
const FADE_OUT_MS = 150;
const COMPLETE_MS = HOLD_TOTAL_MS + FADE_OUT_MS; // 550ms total

interface WrongGuessFlashProps {
  onComplete: () => void;
}

export function WrongGuessFlash({ onComplete }: WrongGuessFlashProps) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [scale, setScale] = useState(1.15);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    requestAnimationFrame(() => {
      setVisible(true);
      setScale(1);
    });

    timersRef.current.push(
      window.setTimeout(() => {
        setLeaving(true);
        setVisible(false);
      }, HOLD_TOTAL_MS)
    );
    timersRef.current.push(window.setTimeout(onComplete, COMPLETE_MS));

    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
  }, [onComplete]);

  const fadeMs = leaving ? FADE_OUT_MS : FADE_IN_MS;

  return (
    <>
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          pointerEvents: "none",
          background: "rgba(13,13,13,0.88)",
          opacity: visible ? 1 : 0,
          transition: `opacity ${fadeMs}ms ease`,
        }}
      />
      <span
        aria-hidden
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          zIndex: 51,
          pointerEvents: "none",
          fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
          fontSize: 96,
          lineHeight: 1,
          color: "#C0392B",
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center",
          transition: `transform ${X_SETTLE_MS}ms cubic-bezier(0.2,0,0.3,1), opacity ${fadeMs}ms ease`,
          opacity: visible ? 1 : 0,
        }}
      >
        ✕
      </span>
    </>
  );
}
