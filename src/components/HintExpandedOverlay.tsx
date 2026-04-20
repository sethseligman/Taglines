"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  EXPANDED_HINT_CARD_HEIGHT as LARGE_H,
  EXPANDED_HINT_CARD_WIDTH as LARGE_W,
  getExpandedHintCardAnchor,
} from "@/lib/expandedHintCardLayout";

/** Quick journey in/out (WrongGuess Beat 3 style easing). */
const JOURNEY_MS = 420;

export type HintExpandedOverlayHandle = {
  /** Runs close journey then calls onClosed. */
  close: () => void;
};

type HintExpandedOverlayProps = {
  hintText: string;
  hintTileRef: RefObject<HTMLDivElement | null>;
  /** Fired after close animation (or immediately if already idle). */
  onClosed: () => void;
};

export const HintExpandedOverlay = forwardRef<HintExpandedOverlayHandle, HintExpandedOverlayProps>(
  function HintExpandedOverlay({ hintText, hintTileRef, onClosed }, ref) {
    const { top: cy, left: cx } = getExpandedHintCardAnchor();
    const [tx, setTx] = useState(0);
    const [ty, setTy] = useState(0);
    const [sx, setSx] = useState(1);
    const [sy, setSy] = useState(1);
    const [move, setMove] = useState(false);
    const [backdropOpacity, setBackdropOpacity] = useState(0);
    const leavingRef = useRef(false);
    const closedRef = useRef(false);
    const closeTimerRef = useRef<number | null>(null);

    const measure = useCallback(() => {
      const rect = hintTileRef.current?.getBoundingClientRect();
      const tileW = rect && rect.width > 2 ? rect.width : 72;
      const tileH = rect && rect.height > 2 ? rect.height : 96;
      const destLeft = rect?.left ?? (window.innerWidth - tileW) / 2;
      const destTop = rect?.top ?? (window.innerHeight - tileH) / 2;
      const { top: ccy, left: ccx } = getExpandedHintCardAnchor();
      const scaleX = tileW / LARGE_W;
      const scaleY = tileH / LARGE_H;
      return {
        cx: ccx,
        cy: ccy,
        tx: destLeft - ccx,
        ty: destTop - ccy,
        sx: scaleX,
        sy: scaleY,
      };
    }, [hintTileRef]);

    const finishClose = useCallback(() => {
      if (closedRef.current) return;
      closedRef.current = true;
      onClosed();
    }, [onClosed]);

    const runClose = useCallback(() => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      const m = measure();
      setMove(false);
      setTx(0);
      setTy(0);
      setSx(1);
      setSy(1);
      setBackdropOpacity(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setMove(true);
          setTx(m.tx);
          setTy(m.ty);
          setSx(m.sx);
          setSy(m.sy);
        });
      });
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        finishClose();
      }, JOURNEY_MS);
    }, [finishClose, measure]);

    useImperativeHandle(
      ref,
      () => ({
        close: () => {
          if (!leavingRef.current) runClose();
        },
      }),
      [runClose]
    );

    useLayoutEffect(() => {
      closedRef.current = false;
      leavingRef.current = false;
      const m = measure();
      setTx(m.tx);
      setTy(m.ty);
      setSx(m.sx);
      setSy(m.sy);
      setMove(false);
      setBackdropOpacity(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setMove(true);
          setTx(0);
          setTy(0);
          setSx(1);
          setSy(1);
          setBackdropOpacity(1);
        });
      });
    }, [hintText, measure]);

    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") runClose();
      };
      window.addEventListener("keydown", onKey);
      return () => {
        window.removeEventListener("keydown", onKey);
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
      };
    }, [runClose]);

    const backdropClick = () => {
      runClose();
    };

    const transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;

    return (
      <div className="fixed inset-0 z-[45]" style={{ pointerEvents: "auto" }}>
        <button
          type="button"
          aria-label="Dismiss hint"
          className="absolute inset-0 cursor-default border-0 p-0"
          style={{
            background: "rgba(13,13,13,0.92)",
            opacity: backdropOpacity,
            transition: `opacity ${Math.min(200, JOURNEY_MS)}ms ease`,
          }}
          onClick={backdropClick}
        />
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ pointerEvents: "none" }}
        >
          <div
            className="relative"
            style={{
              pointerEvents: "auto",
              position: "fixed",
              top: cy,
              left: cx,
              width: LARGE_W,
              height: LARGE_H,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                transform,
                transformOrigin: "top left",
                transition: move ? `transform ${JOURNEY_MS}ms cubic-bezier(0.4,0,0.2,1)` : "none",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  borderRadius: 10,
                  background: "#161410",
                  border: "1px solid #2E2410",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 20,
                  paddingTop: 36,
                  textAlign: "center",
                  boxSizing: "border-box",
                }}
              >
                <button
                  type="button"
                  aria-label="Close hint"
                  className="absolute right-2 top-2 flex h-8 w-8 cursor-pointer items-center justify-center border-0 bg-transparent p-0"
                  style={{
                    fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
                    fontSize: 20,
                    lineHeight: 1,
                    color: "#C9B87A",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    runClose();
                  }}
                >
                  ✕
                </button>
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
    );
  }
);
