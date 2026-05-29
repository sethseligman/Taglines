"use client";

import type { Movie } from "@/types/movie";
import type { HintLevel } from "@/types/movie";
import { getHintBodyForLevel } from "@/lib/hintContent";
import { FONT_PLAYFAIR } from "@/lib/fontStacks";
import { AutoFitHintText } from "@/components/game/AutoFitHintText";
import {
  EASE_OUT,
  WRONG_GUESS_FADE_IN_MS,
  WRONG_GUESS_SLIDE_OUT_MS,
} from "@/lib/hintCarouselConstants";

export interface GameHintCarouselProps {
  movie: Movie;
  displayedHintLevel: number;
  carouselIndex: number;
  carouselTransitionMs: number;
  carouselTransitionEasing: string;
  hintRevealPhase: "normal" | "slideOut" | "blank" | "fadingIn";
  slideOutHintText: string;
  sprocketsRunning: boolean;
  isDesktop: boolean;
  relaxedVisual: boolean;
  onPrevHint: () => void;
  onNextHint: () => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
}

export function GameHintCarousel({
  movie,
  displayedHintLevel,
  carouselIndex,
  carouselTransitionMs,
  carouselTransitionEasing,
  hintRevealPhase,
  slideOutHintText,
  sprocketsRunning,
  isDesktop,
  relaxedVisual,
  onPrevHint,
  onNextHint,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: GameHintCarouselProps) {
  if (displayedHintLevel < 1) return null;

  return (
    <section
      className={`flex w-full max-w-md shrink-0 flex-col items-stretch scroll-mt-6 ${
        relaxedVisual ? "gap-3 md:gap-6" : "gap-2 md:gap-3"
      }`}
    >
      <div className="w-full">
        <div className="flex w-full flex-col" style={{ gap: 12 }}>
          <p
            style={{
              margin: 0,
              color: "#6B6860",
              fontFamily: '"DM Sans", sans-serif',
              fontSize: isDesktop ? 12 : 11,
              lineHeight: 1.35,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              textAlign: "center",
            }}
          >
            Hint {carouselIndex + 1}
          </p>
          <div
            className="relative w-full"
            style={{ padding: "0 22px", touchAction: "pan-y" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <button
              type="button"
              onClick={onPrevHint}
              aria-label="Previous hint"
              className="flex shrink-0 items-center justify-center"
              style={{
                position: "absolute",
                left: -18,
                top: "50%",
                transform: "translateY(-50%)",
                width: 28,
                height: 28,
                borderRadius: 9999,
                border: "1px solid #2A2A2A",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                visibility: carouselIndex === 0 ? "hidden" : "visible",
                zIndex: 5,
              }}
            >
              <svg width="9" height="14" viewBox="0 0 9 14" fill="none" aria-hidden>
                <path
                  d="M7.5 1L1.5 7l6 6"
                  stroke="#6B6860"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={onNextHint}
              aria-label="Next hint"
              className="flex shrink-0 items-center justify-center"
              style={{
                position: "absolute",
                right: -18,
                top: "50%",
                transform: "translateY(-50%)",
                width: 28,
                height: 28,
                borderRadius: 9999,
                border: "1px solid #2A2A2A",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                visibility: carouselIndex === displayedHintLevel - 1 ? "hidden" : "visible",
                zIndex: 5,
              }}
            >
              <svg width="9" height="14" viewBox="0 0 9 14" fill="none" aria-hidden>
                <path
                  d="M1.5 1L7.5 7l-6 6"
                  stroke="#6B6860"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="w-full">
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "calc(100% + 44px)",
                    height: "100%",
                    background:
                      "repeating-linear-gradient(90deg, #0D0D0D 0px, #0D0D0D 12px, #1A1A1A 12px, #1A1A1A 22px)",
                    backgroundSize: "22px 10px",
                    animation: sprocketsRunning
                      ? "perforationRoll 260ms steps(22, end) infinite"
                      : undefined,
                  }}
                />
                <span
                  style={{
                    fontFamily: "DM Sans",
                    fontSize: 7,
                    letterSpacing: "0.2em",
                    color: "#8B6914",
                    position: "absolute",
                    top: "50%",
                    left: 12,
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                    userSelect: "none",
                    zIndex: 1,
                  }}
                >
                  A · KU 22 9611 1802 · 35MM
                </span>
              </div>
              <div className="relative w-full overflow-hidden" style={{ height: 180, minHeight: 180 }}>
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: 180,
                    minHeight: 180,
                    background: "#141410",
                    borderTop: "3px solid #2A2410",
                    borderBottom: "3px solid #2A2410",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: "100%",
                      transform: `translateX(-${carouselIndex * 100}%)`,
                      transition: `transform ${carouselTransitionMs}ms ${carouselTransitionEasing}`,
                    }}
                  >
                    {Array.from({ length: displayedHintLevel }, (_, i) => (
                      <div
                        key={`hint-strip-${i}`}
                        style={{
                          flex: "0 0 100%",
                          padding: "32px 28px",
                          height: 180,
                          minHeight: 180,
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity:
                              i === carouselIndex &&
                              (hintRevealPhase === "slideOut" ||
                                hintRevealPhase === "blank" ||
                                hintRevealPhase === "fadingIn")
                                ? 0
                                : 1,
                            animation:
                              i === carouselIndex && hintRevealPhase === "fadingIn"
                                ? `hintTextSettleFade ${WRONG_GUESS_FADE_IN_MS}ms ${EASE_OUT} both`
                                : undefined,
                          }}
                        >
                          <AutoFitHintText
                            text={getHintBodyForLevel(movie, (i + 1) as HintLevel)}
                            isDesktop={isDesktop}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "#141410",
                      opacity: hintRevealPhase === "blank" ? 1 : hintRevealPhase === "fadingIn" ? 0 : 0,
                      transition:
                        hintRevealPhase === "fadingIn"
                          ? `opacity ${WRONG_GUESS_FADE_IN_MS}ms ${EASE_OUT}`
                          : undefined,
                      pointerEvents: "none",
                    }}
                    aria-hidden
                  />
                  {hintRevealPhase === "slideOut" ? (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "32px 28px",
                        pointerEvents: "none",
                        animation: `hintSlideOutLeft ${WRONG_GUESS_SLIDE_OUT_MS}ms ${EASE_OUT} both`,
                      }}
                      aria-hidden
                    >
                      <p
                        style={{
                          margin: 0,
                          color: "#C9B87A",
                          fontFamily: FONT_PLAYFAIR,
                          fontStyle: "italic",
                          fontSize: isDesktop ? 18 : 16,
                          lineHeight: 1.6,
                          textAlign: "center",
                        }}
                      >
                        {slideOutHintText}
                      </p>
                    </div>
                  ) : null}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: 2,
                      background: "#000000",
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      right: 0,
                      width: 2,
                      background: "#000000",
                      pointerEvents: "none",
                    }}
                  />
                </div>
              </div>
              <div style={{ position: "relative", width: "100%", height: 10, overflow: "hidden" }}>
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "calc(100% + 44px)",
                    height: "100%",
                    background:
                      "repeating-linear-gradient(90deg, #0D0D0D 0px, #0D0D0D 12px, #1A1A1A 12px, #1A1A1A 22px)",
                    backgroundSize: "22px 10px",
                    animation: sprocketsRunning
                      ? "perforationRoll 260ms steps(22, end) infinite"
                      : undefined,
                  }}
                />
              </div>
            </div>
          </div>
          {displayedHintLevel > 1 ? (
            <div className="flex w-full items-center justify-center" style={{ gap: 8 }} aria-hidden>
              {Array.from({ length: displayedHintLevel }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: 6,
                    height: 4,
                    borderRadius: 1,
                    background: i === carouselIndex ? "#C9A96E" : "#2E2410",
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
