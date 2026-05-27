"use client";

/* eslint-disable react-hooks/set-state-in-effect -- mount + timed sequence orchestration (explicit timeouts, cleaned up on unmount) */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAutoFitFontSize } from "@/hooks/useAutoFitFontSize";
import { FONT_PLAYFAIR } from "@/lib/fontStacks";
import {
  SLAM_ENTRANCE_EASING,
  SLAM_ENTRANCE_MS,
  SLAM_EASE_OUT,
  SLAM_INITIAL_SCALE,
} from "@/lib/slamEntrance";

/** Tunable phase durations (absolute schedule built from these per win/loss). */
const T_MS = {
  /** Win: full-bleed poster appears instantly. */
  winPosterEnter: 0,
  /** Loss: slow fade-in for full-bleed poster. */
  lossPosterFadeIn: 1400,
  /** Full-screen poster hold before recede. */
  posterHold: 900,
  /** Full-screen poster recede (scale + fade); empty beat starts after this ends. */
  posterRecede: 450,
  /** Near-empty seated frame (header only) before verdict slams. */
  emptyBeatHold: 550,
  /** Verdict slam — matches WrongGuessFlash SLAM_MS via slamEntrance.ts. */
  verdictSlam: SLAM_ENTRANCE_MS,
  /** Brief settle after verdict lands (mirrors WrongGuessFlash HOLD_MS). */
  verdictHoldAfterSlam: 400,
  /** Result card (ResultContent) cascade fade + rise. */
  cardCascadeFade: 520,
  /** Delay after card fade before pointer events + onSequenceComplete. */
  interactiveDelayAfterCard: 120,
} as const;

type ResultStatus = "won" | "lost";
type VerdictSlamPhase = "hidden" | "idle" | "slam" | "hold";

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

function VerdictLine({ text, visible }: { text: string; visible: boolean }) {
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

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full max-w-[min(100vw-3rem,420px)] px-3"
      style={{
        minHeight: isDesktop ? 120 : 100,
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

function buildSchedule(status: ResultStatus) {
  const posterFadeIn = status === "won" ? T_MS.winPosterEnter : T_MS.lossPosterFadeIn;
  const posterHoldEnd = posterFadeIn + T_MS.posterHold;
  const recedeStart = posterHoldEnd;
  const portalOff = recedeStart + T_MS.posterRecede;
  const emptyBeatEnd = portalOff + T_MS.emptyBeatHold;
  const verdictSlamStart = emptyBeatEnd;
  const cardRevealStart = verdictSlamStart + T_MS.verdictSlam + T_MS.verdictHoldAfterSlam;
  const interactiveAt = cardRevealStart + T_MS.cardCascadeFade + T_MS.interactiveDelayAfterCard;
  return {
    posterFadeIn,
    recedeStart,
    portalOff,
    emptyBeatEnd,
    verdictSlamStart,
    cardRevealStart,
    interactiveAt,
  };
}

export type GameEndSequenceProps = {
  resultStatus: ResultStatus;
  narratorLine: string;
  posterUrl: string | null;
  showPoster: boolean;
  onPosterError?: () => void;
  children: React.ReactNode;
  onPhaseCEnter?: () => void;
  onSequenceComplete?: () => void;
  skipSequence?: boolean;
};

export function GameEndSequence({
  resultStatus,
  narratorLine,
  posterUrl,
  showPoster,
  onPosterError,
  children,
  onPhaseCEnter,
  onSequenceComplete,
  skipSequence = false,
}: GameEndSequenceProps) {
  const onPhaseCEnterRef = useRef(onPhaseCEnter);
  const onSequenceCompleteRef = useRef(onSequenceComplete);

  useEffect(() => {
    onPhaseCEnterRef.current = onPhaseCEnter;
    onSequenceCompleteRef.current = onSequenceComplete;
  }, [onPhaseCEnter, onSequenceComplete]);

  const [reduceMotion, setReduceMotion] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showPosterPortal, setShowPosterPortal] = useState(false);
  const [posterOpacity, setPosterOpacity] = useState(0);
  const [posterScale, setPosterScale] = useState(1);
  const [posterReceding, setPosterReceding] = useState(false);
  const [verdictSlamPhase, setVerdictSlamPhase] = useState<VerdictSlamPhase>("hidden");
  const [cardOpacity, setCardOpacity] = useState(0);
  const [cardOffsetY, setCardOffsetY] = useState(18);
  const [resultInteractive, setResultInteractive] = useState(false);
  const timersRef = useRef<number[]>([]);
  const bypassSequence = reduceMotion || skipSequence;
  const isWin = resultStatus === "won";

  const clearTimers = () => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  };

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduceMotion(rm);
    setMounted(true);
    if (rm || skipSequence) {
      setVerdictSlamPhase("hold");
      setCardOpacity(1);
      setCardOffsetY(0);
      setResultInteractive(true);
      queueMicrotask(() => {
        onPhaseCEnterRef.current?.();
        onSequenceCompleteRef.current?.();
      });
    }
  }, [skipSequence]);

  useEffect(() => {
    clearTimers();
    if (!mounted || bypassSequence) return;

    const schedule = buildSchedule(resultStatus);
    const push = (fn: () => void, delay: number) => {
      timersRef.current.push(window.setTimeout(fn, delay));
    };

    setShowPosterPortal(true);
    setPosterReceding(false);
    setPosterScale(1);
    setVerdictSlamPhase("hidden");
    setCardOpacity(0);
    setCardOffsetY(18);
    setResultInteractive(false);

    if (isWin) {
      setPosterOpacity(1);
    } else {
      setPosterOpacity(0);
      push(() => setPosterOpacity(1), 0);
    }

    push(() => {
      setPosterReceding(true);
      setPosterScale(0.9);
      setPosterOpacity(0);
    }, schedule.recedeStart);

    push(() => {
      setShowPosterPortal(false);
      setPosterReceding(false);
    }, schedule.portalOff);

    push(() => {
      setVerdictSlamPhase("idle");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVerdictSlamPhase("slam"));
      });
    }, schedule.verdictSlamStart);

    push(() => setVerdictSlamPhase("hold"), schedule.verdictSlamStart + T_MS.verdictSlam);

    push(() => {
      setCardOpacity(1);
      setCardOffsetY(0);
      onPhaseCEnterRef.current?.();
    }, schedule.cardRevealStart);

    push(() => {
      setResultInteractive(true);
      onSequenceCompleteRef.current?.();
    }, schedule.interactiveAt);

    return clearTimers;
  }, [mounted, bypassSequence, resultStatus, narratorLine, posterUrl, showPoster, isWin]);

  const posterEnterTransition = isWin
    ? "none"
    : `opacity ${T_MS.lossPosterFadeIn}ms ${SLAM_EASE_OUT}`;
  const posterRecedeTransition = posterReceding
    ? `opacity ${T_MS.posterRecede}ms ${SLAM_EASE_OUT}, transform ${T_MS.posterRecede}ms ${SLAM_EASE_OUT}`
    : posterEnterTransition;

  const verdictScale =
    verdictSlamPhase === "hidden" || verdictSlamPhase === "idle"
      ? SLAM_INITIAL_SCALE
      : 1;
  const verdictOpacity =
    verdictSlamPhase === "hidden" ? 0 : verdictSlamPhase === "idle" ? 0 : 1;
  const verdictTransition =
    verdictSlamPhase === "slam"
      ? `transform ${SLAM_ENTRANCE_MS}ms ${SLAM_ENTRANCE_EASING}, opacity ${SLAM_ENTRANCE_MS}ms ${SLAM_EASE_OUT}`
      : verdictSlamPhase === "hold"
        ? "none"
        : "none";

  let posterPortalEl: ReactNode = null;
  if (mounted && showPosterPortal && !bypassSequence && typeof document !== "undefined") {
    posterPortalEl = createPortal(
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
          className="absolute inset-0 overflow-hidden"
          style={{
            opacity: posterOpacity,
            transform: `scale(${posterScale})`,
            transition: posterRecedeTransition,
            transformOrigin: "center center",
          }}
        >
          {showPoster && posterUrl ? (
            <img
              src={posterUrl}
              alt=""
              className="block h-full w-full object-cover object-center"
              style={{ width: "100%", height: "100%" }}
              onError={onPosterError}
            />
          ) : (
            <div
              className="h-full w-full bg-[#161616]"
              style={{ border: "1px solid #222" }}
              aria-hidden
            />
          )}
        </div>
      </div>,
      document.body
    );
  }

  return (
    <>
      {posterPortalEl}
      <div className="flex w-full flex-col">
        <div
          className="flex w-full shrink-0 flex-col items-center justify-center px-4"
          style={{
            minHeight: verdictSlamPhase === "hidden" ? 0 : "min(32vh, 280px)",
            paddingTop: verdictSlamPhase === "hidden" ? 0 : "min(12vh, 96px)",
            pointerEvents: "none",
            overflow: "hidden",
            visibility: verdictSlamPhase === "hidden" ? "hidden" : "visible",
          }}
          aria-live="polite"
        >
          <div
            style={{
              transform: `scale(${verdictScale})`,
              opacity: verdictOpacity,
              transition: verdictTransition,
              transformOrigin: "center center",
            }}
          >
            <VerdictLine text={narratorLine} visible={verdictSlamPhase !== "hidden"} />
          </div>
        </div>
        <div
          className="w-full"
          style={{
            opacity: cardOpacity,
            transform: `translateY(${cardOffsetY}px)`,
            transition: bypassSequence
              ? undefined
              : `opacity ${T_MS.cardCascadeFade}ms ${SLAM_EASE_OUT}, transform ${T_MS.cardCascadeFade}ms ${SLAM_EASE_OUT}`,
            pointerEvents: resultInteractive ? "auto" : "none",
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
