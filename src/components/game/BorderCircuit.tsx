"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { SLAM_ENTRANCE_EASING, SLAM_ENTRANCE_MS } from "@/lib/slamEntrance";

const STROKE = "#ef4444";
const STROKE_WIDTH = 3;
const DOT_LENGTH = 8;

interface BorderCircuitProps {
  /** 1–4 = traveling dots (escalates after each ✕); 5 = solid slam (final wrong guess / loss). */
  wrongGuesses: number;
}

interface CircuitStyle {
  visible: boolean;
  strokeDasharray: string | undefined;
  strokeOpacity: number;
  animationName: string;
  animationDuration: string;
  animationTimingFunction: string;
  animationIterationCount: string;
  animationFillMode: string;
}

function circuitStyleForWrongGuesses(wrongGuesses: number, perimeter: number): CircuitStyle {
  const hidden: CircuitStyle = {
    visible: false,
    strokeDasharray: undefined,
    strokeOpacity: 1,
    animationName: "none",
    animationDuration: "0s",
    animationTimingFunction: "linear",
    animationIterationCount: "1",
    animationFillMode: "none",
  };

  if (wrongGuesses <= 0 || perimeter <= 0) {
    return hidden;
  }

  if (wrongGuesses >= 5) {
    return {
      visible: true,
      strokeDasharray: "none",
      strokeOpacity: 1,
      animationName: "borderSlam",
      animationDuration: `${SLAM_ENTRANCE_MS}ms`,
      animationTimingFunction: SLAM_ENTRANCE_EASING,
      animationIterationCount: "1",
      animationFillMode: "forwards",
    };
  }

  if (wrongGuesses === 4) {
    const gap = perimeter / 11;
    return {
      visible: true,
      strokeDasharray: `${DOT_LENGTH} ${gap}`,
      strokeOpacity: 1,
      animationName: "borderCircuit",
      animationDuration: "3s",
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
      animationFillMode: "none",
    };
  }

  if (wrongGuesses === 3) {
    const gap = perimeter / 8;
    return {
      visible: true,
      strokeDasharray: `${DOT_LENGTH} ${gap}`,
      strokeOpacity: 1,
      animationName: "borderCircuit",
      animationDuration: "5s",
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
      animationFillMode: "none",
    };
  }

  if (wrongGuesses === 2) {
    const gap = perimeter / 4.5;
    return {
      visible: true,
      strokeDasharray: `${DOT_LENGTH} ${gap}`,
      strokeOpacity: 0.5,
      animationName: "borderCircuit",
      animationDuration: "7s",
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
      animationFillMode: "none",
    };
  }

  const gap = perimeter / 2.5;
  return {
    visible: true,
    strokeDasharray: `${DOT_LENGTH} ${gap}`,
    strokeOpacity: 0.35,
    animationName: "borderCircuit",
    animationDuration: "10s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    animationFillMode: "none",
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
        key={wrongGuesses}
        x={STROKE_WIDTH / 2}
        y={STROKE_WIDTH / 2}
        width={rectWidth}
        height={rectHeight}
        fill="none"
        stroke={STROKE}
        strokeWidth={STROKE_WIDTH}
        strokeOpacity={circuit.strokeOpacity}
        style={{
          ["--border-perimeter" as string]: `${perimeter}px`,
          strokeDasharray: circuit.strokeDasharray,
          strokeDashoffset: 0,
          opacity: wrongGuesses >= 5 ? 0 : undefined,
          animation: `${circuit.animationName} ${circuit.animationDuration} ${circuit.animationTimingFunction} ${circuit.animationIterationCount} ${circuit.animationFillMode}`,
        }}
      />
    </svg>
  );

  return createPortal(overlay, document.body);
}
