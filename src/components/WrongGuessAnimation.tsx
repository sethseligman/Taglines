"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const BEAT1_MS = 300;
const FLIP_MS = 480;
const FLIP_HOLD_MS = 3000;
const BEAT3_START_MS = BEAT1_MS + FLIP_MS + FLIP_HOLD_MS;
const JOURNEY_MS = 600;
const OVERLAY_FADE_IN_MS = 150;
const OVERLAY_FADE_OUT_MS = 500;
const COMPLETE_MS = BEAT3_START_MS + JOURNEY_MS;

const LARGE_W = 180;
const LARGE_H = 240;

interface WrongGuessAnimationProps {
  hintText: string;
  hintIndex: number;
  hintTileRef: RefObject<HTMLDivElement | null>;
  onComplete: () => void;
}

function centerBox(w: number, h: number) {
  if (typeof window === "undefined") {
    return { top: 0, left: 0, w, h };
  }
  return {
    top: (window.innerHeight - h) / 2,
    left: (window.innerWidth - w) / 2,
    w,
    h,
  };
}

export function WrongGuessAnimation({
  hintText,
  hintIndex,
  hintTileRef,
  onComplete,
}: WrongGuessAnimationProps) {
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  const [overlayFadeOut, setOverlayFadeOut] = useState(false);
  const [enterScale, setEnterScale] = useState(1.15);
  const [flipDeg, setFlipDeg] = useState(0);
  const [flipTransition, setFlipTransition] = useState(false);
  const [cardBox, setCardBox] = useState(() => centerBox(LARGE_W, LARGE_H));
  /** Beat 3 only: inner wrapper uses translate + scale; shell stays 180×240. */
  const [journeyStarted, setJourneyStarted] = useState(false);
  const [journeyMove, setJourneyMove] = useState(false);
  const [journeyTransform, setJourneyTransform] = useState("translate(0px, 0px) scale(1, 1)");
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const schedule = (fn: () => void, ms: number) => {
      timersRef.current.push(window.setTimeout(fn, ms));
    };

    requestAnimationFrame(() => {
      setOverlayOpacity(1);
      setEnterScale(1);
    });

    schedule(() => {
      setFlipTransition(true);
      setFlipDeg(180);
    }, BEAT1_MS);

    schedule(() => {
      const el = hintTileRef.current;
      const rect = el?.getBoundingClientRect();
      const tileW = rect && rect.width > 2 ? rect.width : 72;
      const tileH = rect && rect.height > 2 ? rect.height : 96;
      const destTop = rect?.top ?? (window.innerHeight - tileH) / 2;
      const destLeft = rect?.left ?? (window.innerWidth - tileW) / 2;
      const scaleX = tileW / LARGE_W;
      const scaleY = tileH / LARGE_H;
      const { top: cy, left: cx } = centerBox(LARGE_W, LARGE_H);

      setCardBox({ top: cy, left: cx, w: LARGE_W, h: LARGE_H });
      setJourneyStarted(true);
      setJourneyMove(false);
      setJourneyTransform("translate(0px, 0px) scale(1, 1)");
      setOverlayFadeOut(true);
      setOverlayOpacity(0);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setJourneyMove(true);
          setJourneyTransform(
            `translate(${destLeft - cx}px, ${destTop - cy}px) scale(${scaleX}, ${scaleY})`
          );
        });
      });
    }, BEAT3_START_MS);

    schedule(onComplete, COMPLETE_MS);

    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
  }, [hintTileRef, onComplete]);

  const overlayTransitionMs = overlayFadeOut ? OVERLAY_FADE_OUT_MS : OVERLAY_FADE_IN_MS;

  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-hidden data-hint-slot={hintIndex}>
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(13,13,13,0.92)",
          opacity: overlayOpacity,
          transition: `opacity ${overlayTransitionMs}ms ease`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{ perspective: 1400, perspectiveOrigin: "50% 50%" }}
      >
        <div
          style={{
            position: "fixed",
            top: cardBox.top,
            left: cardBox.left,
            width: LARGE_W,
            height: LARGE_H,
            transformStyle: "preserve-3d",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              ...(journeyStarted
                ? {
                    transform: journeyTransform,
                    transformOrigin: "top left",
                    transition: journeyMove
                      ? `transform ${JOURNEY_MS}ms cubic-bezier(0.4,0,0.2,1)`
                      : "none",
                  }
                : {}),
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                transform: `scale(${enterScale})`,
                transformOrigin: "50% 50%",
                transition: "transform 220ms cubic-bezier(0.2,0,0.3,1)",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  transformStyle: "preserve-3d",
                  transform: `rotateY(${flipDeg}deg)`,
                  transition: flipTransition ? `transform ${FLIP_MS}ms ease-in-out` : "none",
                }}
              >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 10,
                  background: "#1A1A1A",
                  border: "1px solid #333",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                <span
                  style={{
                    fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
                    fontSize: 72,
                    lineHeight: 1,
                    color: "#F0EDE6",
                  }}
                >
                  ✕
                </span>
              </div>

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 10,
                  background: "#161410",
                  border: "1px solid #2E2410",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 20,
                  textAlign: "center",
                  transform: "rotateY(180deg)",
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                <span
                  style={{
                    fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
                    fontSize: 16,
                    fontStyle: "italic",
                    lineHeight: 1.5,
                    color: "#C9B87A",
                  }}
                >
                  {hintText}
                </span>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
