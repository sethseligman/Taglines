"use client";

/* eslint-disable react-hooks/set-state-in-effect -- mount + timed sequence orchestration (explicit timeouts, cleaned up on unmount) */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useAutoFitFontSize } from "@/hooks/useAutoFitFontSize";
import { FONT_PLAYFAIR } from "@/lib/fontStacks";
import {
  SLAM_ENTRANCE_EASING,
  SLAM_ENTRANCE_MS,
  SLAM_EASE_OUT,
  SLAM_HOLD_MS,
  SLAM_INITIAL_SCALE,
  SLAM_PRIME_MS,
  SLAM_RATTLE_ANIMATION,
  VERDICT_SLAM_TEXT_SHADOW,
} from "@/lib/slamEntrance";

/** Charcoal letterboxing behind object-contain poster. */
const POSTER_LETTERBOX = "#0D0D0D";

/** Tunable phase durations (absolute schedule built from these per win/loss). */
const T_MS = {
  /** Win: poster appears instantly. */
  winPosterEnter: 0,
  /** Loss: slow fade-in for poster (scaled with slower overall pacing). */
  lossPosterFadeIn: 1800,
  /** Full-screen poster hold before recede. */
  posterHold: 1400,
  /** Poster recede (scale + fade); empty beat starts after this ends. */
  posterRecede: 600,
  /** Near-empty seated frame (header only) before verdict slams. */
  emptyBeatHold: 850,
  /** Verdict slam — matches WrongGuessFlash SLAM_MS via slamEntrance.ts. */
  verdictSlam: SLAM_ENTRANCE_MS,
  /** Brief settle after verdict lands + wrongGuessRattle (mirrors WrongGuessFlash HOLD_MS). */
  verdictHoldAfterSlam: SLAM_HOLD_MS,
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

function posterFrameStyle(isDesktop: boolean): CSSProperties {
  if (isDesktop) {
    return {
      maxWidth: "min(42vw, 340px)",
      maxHeight: "85vh",
      width: "auto",
      height: "auto",
    };
  }
  return {
    maxWidth: "90vw",
    maxHeight: "90dvh",
    width: "auto",
    height: "auto",
  };
}

function VerdictLine({
  text,
  visible,
  slamPhase,
}: {
  text: string;
  visible: boolean;
  slamPhase: VerdictSlamPhase;
}) {
  const isDesktop = useIsDesktop();
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const min = isDesktop ? 22 : 18;
  const max = isDesktop ? 40 : 32;
  const fontSize = useAutoFitFontSize(textRef, containerRef, {
    min,
    max,
    deps: [text, isDesktop, visible, slamPhase],
  });

  const struck = slamPhase === "slam" || slamPhase === "hold";

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full max-w-[min(100vw-3rem,420px)] px-3"
      style={{
        minHeight: isDesktop ? 72 : 64,
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
          textShadow: struck ? VERDICT_SLAM_TEXT_SHADOW : undefined,
          transition: struck ? `text-shadow ${SLAM_ENTRANCE_MS}ms ${SLAM_EASE_OUT}` : undefined,
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
  const isDesktop = useIsDesktop();

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
  const posterFrame = posterFrameStyle(isDesktop);

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
      push(() => setVerdictSlamPhase("slam"), SLAM_PRIME_MS);
    }, schedule.verdictSlamStart);

    push(() => setVerdictSlamPhase("hold"), schedule.verdictSlamStart + SLAM_PRIME_MS + T_MS.verdictSlam);

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
        className="fixed inset-0 z-[200]"
        style={{
          pointerEvents: "auto",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          height: "100dvh",
          backgroundColor: POSTER_LETTERBOX,
        }}
        role="presentation"
        aria-hidden
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
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
              className="block object-contain object-center"
              style={posterFrame}
              onError={onPosterError}
            />
          ) : (
            <div
              className="bg-[#161616]"
              style={{
                ...posterFrame,
                border: "1px solid #222",
                minWidth: isDesktop ? 200 : 160,
                minHeight: isDesktop ? 300 : 240,
              }}
              aria-hidden
            />
          )}
        </div>
      </div>,
      document.body
    );
  }

  const verdictVisible = verdictSlamPhase !== "hidden";

  return (
    <>
      {posterPortalEl}
      <div className="flex w-full flex-col">
        <div
          className="flex w-full shrink-0 flex-col items-center justify-start px-4"
          style={{
            minHeight: 0,
            paddingTop: verdictVisible ? "0.25rem" : 0,
            paddingBottom: verdictVisible ? "0.5rem" : 0,
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
            <span
              style={{
                display: "inline-block",
                width: "100%",
                animation:
                  verdictSlamPhase === "hold" ? SLAM_RATTLE_ANIMATION : undefined,
              }}
            >
              <VerdictLine
                text={narratorLine}
                visible={verdictVisible}
                slamPhase={verdictSlamPhase}
              />
            </span>
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
