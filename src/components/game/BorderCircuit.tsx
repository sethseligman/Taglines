"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const STROKE = "#ef4444";
const STROKE_WIDTH = 3;
const DOT_LENGTH = 8;

interface BorderCircuitProps {
  wrongGuesses: number;
}

interface CircuitStyle {
  visible: boolean;
  strokeDasharray: string | undefined;
  animationName: string;
  animationDuration: string;
  animationTimingFunction: string;
}

function circuitStyleForWrongGuesses(wrongGuesses: number, perimeter: number): CircuitStyle {
  if (wrongGuesses <= 0 || perimeter <= 0) {
    return {
      visible: false,
      strokeDasharray: undefined,
      animationName: "none",
      animationDuration: "0s",
      animationTimingFunction: "linear",
    };
  }

  if (wrongGuesses >= 4) {
    return {
      visible: true,
      strokeDasharray: "none",
      animationName: "borderBlink",
      animationDuration: "0.4s",
      animationTimingFunction: "ease-in-out",
    };
  }

  if (wrongGuesses === 3) {
    const gap = perimeter / 15;
    return {
      visible: true,
      strokeDasharray: `${DOT_LENGTH} ${gap}`,
      animationName: "borderCircuit",
      animationDuration: "1s",
      animationTimingFunction: "linear",
    };
  }

  if (wrongGuesses === 2) {
    const gap = perimeter / 6;
    return {
      visible: true,
      strokeDasharray: `${DOT_LENGTH} ${gap}`,
      animationName: "borderCircuit",
      animationDuration: "2s",
      animationTimingFunction: "linear",
    };
  }

  const gap = perimeter / 3;
  return {
    visible: true,
    strokeDasharray: `${DOT_LENGTH} ${gap}`,
    animationName: "borderCircuit",
    animationDuration: "4s",
    animationTimingFunction: "linear",
  };
}

export function BorderCircuit({ wrongGuesses }: BorderCircuitProps) {
  const [mounted, setMounted] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const measure = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const rectWidth = Math.max(0, size.width - STROKE_WIDTH);
  const rectHeight = Math.max(0, size.height - STROKE_WIDTH);
  const perimeter = 2 * (rectWidth + rectHeight);

  const circuit = useMemo(
    () => circuitStyleForWrongGuesses(wrongGuesses, perimeter),
    [wrongGuesses, perimeter]
  );

  if (!mounted || !circuit.visible || size.width === 0 || size.height === 0) {
    return null;
  }

  const overlay = (
    <svg
      className="pointer-events-none fixed inset-0 z-[200]"
      width="100vw"
      height="100dvh"
      viewBox={`0 0 ${size.width} ${size.height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <rect
        x={STROKE_WIDTH / 2}
        y={STROKE_WIDTH / 2}
        width={rectWidth}
        height={rectHeight}
        fill="none"
        stroke={STROKE}
        strokeWidth={STROKE_WIDTH}
        style={{
          ["--border-perimeter" as string]: `${perimeter}px`,
          strokeDasharray: circuit.strokeDasharray,
          strokeDashoffset: 0,
          animation: `${circuit.animationName} ${circuit.animationDuration} ${circuit.animationTimingFunction} infinite`,
        }}
      />
    </svg>
  );

  return createPortal(overlay, document.body);
}
