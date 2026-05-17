"use client";

/* eslint-disable react-hooks/set-state-in-effect -- mount + timed sequence orchestration (explicit timeouts, cleaned up on unmount) */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAutoFitFontSize } from "@/hooks/useAutoFitFontSize";
import { FONT_PLAYFAIR } from "@/lib/fontStacks";

const T_MS = {
  blackHold: 0,
  lineFadeIn: 300,
  lineHoldEnd: 3800,
  lineFadeOut: 300,
  posterFadeIn: 300,
  posterHoldEnd: 5400,
  posterFadeOut: 300,
  phaseCEnd: 6300,
  phaseCFadeMs: 600,
} as const;

/** Narrator + poster share this frame so the poster replaces the line in the same screen position. */
const PHASE_AB_SLOT_OUTER =
  "absolute inset-0 flex flex-col items-center px-4 pt-[min(20vh,176px)] md:pt-[min(22vh,200px)]";
const PHASE_AB_SLOT_INNER =
  "mx-auto flex w-full max-w-[min(100vw-3rem,420px)] min-h-[280px] items-center justify-center px-3";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return isDesktop;
}

function PhaseANarrator({ text, visible }: { text: string; visible: boolean }) {
  const isDesktop = useIsDesktop();
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const min = isDesktop ? 22 : 18;
  const max = isDesktop ? 40 : 32;
  const fontSize = useAutoFitFontSize(textRef, containerRef, {
    min,
    max,
    deps: [text, isDesktop, visible],
  });
  const h = isDesktop ? 180 : 140;

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full max-w-[min(100vw-3rem,420px)] px-3"
      style={{
        height: h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <p
        ref={textRef}
        className="text-center"
        style={{
          margin: 0,
          color: "#c9a96e",
          fontFamily: FONT_PLAYFAIR,
          fontStyle: "italic",
          fontSize: `${fontSize}px`,
          lineHeight: 1.35,
          width: "100%",
          maxWidth: "100%",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
        }}
      >
        {text}
      </p>
    </div>
  );
}

export type GameEndSequenceProps = {
  narratorLine: string;
  posterUrl: string | null;
  showPoster: boolean;
  onPosterError?: () => void;
  children: React.ReactNode;
  onPhaseCEnter?: () => void;
  onSequenceComplete?: () => void;
};

export function GameEndSequence({
  narratorLine,
  posterUrl,
  showPoster,
  onPosterError,
  children,
  onPhaseCEnter,
  onSequenceComplete,
}: GameEndSequenceProps) {
  const onPhaseCEnterRef = useRef(onPhaseCEnter);
  const onSequenceCompleteRef = useRef(onSequenceComplete);

  useEffect(() => {
    onPhaseCEnterRef.current = onPhaseCEnter;
    onSequenceCompleteRef.current = onSequenceComplete;
  }, [onPhaseCEnter, onSequenceComplete]);

  const [reduceMotion, setReduceMotion] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showAbPortal, setShowAbPortal] = useState(false);
  const [narratorOpacity, setNarratorOpacity] = useState(0);
  const [posterOpacity, setPosterOpacity] = useState(0);
  const [resultOpacity, setResultOpacity] = useState(0);
  const [resultInteractive, setResultInteractive] = useState(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  };

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduceMotion(rm);
    setMounted(true);
    if (rm) {
      setResultOpacity(1);
      setResultInteractive(true);
      queueMicrotask(() => {
        onPhaseCEnterRef.current?.();
        onSequenceCompleteRef.current?.();
      });
    } else {
      setShowAbPortal(true);
    }
  }, []);

  useEffect(() => {
    clearTimers();
    if (!mounted || reduceMotion) return;

    setShowAbPortal(true);
    setNarratorOpacity(0);
    setPosterOpacity(0);
    setResultOpacity(0);
    setResultInteractive(false);

    const push = (fn: () => void, delay: number) => {
      timersRef.current.push(window.setTimeout(fn, delay));
    };

    push(() => setNarratorOpacity(1), T_MS.blackHold);
    push(() => setNarratorOpacity(0), T_MS.lineHoldEnd);
    push(() => setPosterOpacity(1), T_MS.lineHoldEnd + T_MS.lineFadeOut);
    push(() => setPosterOpacity(0), T_MS.posterHoldEnd);
    push(() => {
      setShowAbPortal(false);
      setResultOpacity(1);
      onPhaseCEnterRef.current?.();
    }, T_MS.posterHoldEnd + T_MS.posterFadeOut);
    push(() => {
      setResultInteractive(true);
      onSequenceCompleteRef.current?.();
    }, T_MS.phaseCEnd);

    return clearTimers;
  }, [mounted, reduceMotion, narratorLine, posterUrl, showPoster]);

  let portalEl: ReactNode = null;
  if (mounted && showAbPortal && !reduceMotion && typeof document !== "undefined") {
    portalEl = createPortal(
      <div
        className="fixed inset-0 z-[200] bg-black"
        style={{
          pointerEvents: "auto",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          height: "100dvh",
        }}
        role="presentation"
        aria-hidden
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={PHASE_AB_SLOT_OUTER}
          style={{
            opacity: narratorOpacity,
            transition: `opacity ${T_MS.lineFadeIn}ms ease-in-out`,
            pointerEvents: "none",
          }}
        >
          <div className={PHASE_AB_SLOT_INNER}>
            <PhaseANarrator text={narratorLine} visible={narratorOpacity > 0} />
          </div>
        </div>
        <div
          className={PHASE_AB_SLOT_OUTER}
          style={{
            opacity: posterOpacity,
            transition: `opacity ${T_MS.posterFadeIn}ms ease-in-out`,
            pointerEvents: "none",
          }}
        >
          <div className={PHASE_AB_SLOT_INNER}>
            {showPoster && posterUrl ? (
              <img
                src={posterUrl}
                alt=""
                width={187}
                height={280}
                className="mx-auto block h-auto w-auto max-w-full object-contain object-center"
                style={{ maxHeight: 280 }}
                onError={onPosterError}
              />
            ) : (
              <div
                className="mx-auto bg-[#161616]"
                style={{
                  width: "min(85vw, 187px)",
                  height: 280,
                  maxHeight: 280,
                  borderRadius: 6,
                  border: "1px solid #222",
                }}
                aria-hidden
              />
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <>
      {portalEl}
      <div
        className="w-full"
        style={{
          opacity: resultOpacity,
          transition: reduceMotion ? undefined : `opacity ${T_MS.phaseCFadeMs}ms ease-in`,
          pointerEvents: resultInteractive ? "auto" : "none",
        }}
      >
        {children}
      </div>
    </>
  );
}
