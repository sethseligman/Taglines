"use client";

import { useCallback, useLayoutEffect, useState } from "react";

const KEY_SPLASHED = "taglines-splashed";
const KEY_HTP_DISMISSED = "taglines-how-to-play-dismissed";

const PF = '"Playfair Display", Georgia, "Times New Roman", serif';
const DM = '"DM Sans", ui-sans-serif, system-ui, sans-serif';

/** Dividers / rail tones derived from tokens only */
const dividerColor = "color-mix(in srgb, var(--foreground) 7%, var(--background))";
const dimTileBg = "color-mix(in srgb, var(--surface) 82%, var(--foreground))";
const dimTileBorder = "color-mix(in srgb, var(--border-soft) 55%, var(--surface))";
const activeTileBg = "color-mix(in srgb, var(--gold) 12%, var(--background))";
const activeTileBorder = "color-mix(in srgb, var(--gold) 35%, var(--border-soft))";
const activeTileText = "color-mix(in srgb, var(--gold) 58%, var(--muted))";

export function SplashModal() {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"splash" | "htp">("splash");
  const [dontShowAgain, setDontShowAgain] = useState(false);

  /**
   * Read storage in one layout effect (no chained hydration flag).
   * A two-effect chain (setHydrated → then read localStorage) can miss the second
   * effect in edge cases; a single pass matches empty incognito storage reliably.
   */
  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(KEY_SPLASHED)) return;
    } catch {
      // Storage blocked — still show splash once.
    }
    setOpen(true);
  }, []);

  const dismiss = useCallback(
    (opts?: { fromHtp?: boolean }) => {
      try {
        localStorage.setItem(KEY_SPLASHED, "true");
        if (opts?.fromHtp && dontShowAgain) {
          localStorage.setItem(KEY_HTP_DISMISSED, "true");
        }
      } catch {
        // ignore
      }
      setOpen(false);
    },
    [dontShowAgain]
  );

  const goToHowToPlay = useCallback(() => {
    setPanel("htp");
  }, []);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[200]"
      style={{ background: "var(--background)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Taglines"
    >
      <div className="relative h-full min-h-0 w-full">
        {/* Splash: full-viewport overlay only — no card; true flex center */}
        <div
          className={`absolute inset-0 flex w-full flex-col items-center justify-center transition-[opacity,transform] duration-150 ease-out ${
            panel === "splash"
              ? "z-10 translate-y-0 opacity-100"
              : "pointer-events-none z-0 -translate-y-1 opacity-0"
          }`}
          style={{
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
          aria-hidden={panel !== "splash"}
        >
          <div className="flex w-full max-w-[390px] flex-col items-center">
            <p
              className="text-center leading-none"
              style={{ fontFamily: PF, fontSize: 52, fontWeight: 700 }}
            >
              <span style={{ color: "var(--foreground)" }}>Tag</span>
              <span style={{ color: "var(--gold)" }}>lines</span>
            </p>
            <div
              className="mt-5 shrink-0 rounded-full"
              style={{ width: 32, height: 2, background: "var(--gold)" }}
              aria-hidden
            />
            <p
              className="mt-6 text-center italic leading-snug"
              style={{ fontFamily: PF, fontSize: 20, color: "var(--foreground)" }}
            >
              Guess the movie from its tagline.
            </p>
            <p className="mt-3 text-center" style={{ fontFamily: DM, fontSize: 13, color: "var(--muted)" }}>
              One puzzle. Every day.
            </p>
            <button
              type="button"
              onClick={() => dismiss()}
              className="mt-8 w-full max-w-[280px] font-semibold text-background transition hover:opacity-95 active:scale-[0.99]"
              style={{
                fontFamily: DM,
                background: "var(--gold)",
                borderRadius: 14,
                padding: 18,
                fontSize: "0.95rem",
              }}
            >
              Let&apos;s play
            </button>
            <button
              type="button"
              onClick={goToHowToPlay}
              className="mt-5 border-none bg-transparent p-0 underline-offset-2 hover:underline"
              style={{ fontFamily: DM, fontSize: 13, color: "var(--muted)" }}
            >
              How to play
            </button>
          </div>
        </div>

        {/* How to play: unchanged card; centered in same viewport */}
        <div
          className={`absolute inset-0 flex w-full flex-col items-center justify-center transition-[opacity,transform] duration-150 ease-out ${
            panel === "htp"
              ? "z-10 translate-y-0 opacity-100"
              : "pointer-events-none z-0 translate-y-1 opacity-0"
          }`}
          style={{
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
          aria-hidden={panel !== "htp"}
        >
          <div
            className="relative w-full max-w-[390px] overflow-y-auto overscroll-contain rounded-[24px] border shadow-2xl"
            style={{
              maxHeight: "min(100dvh - 2rem, 100vh - 2rem)",
              background: "var(--surface)",
              borderColor: "var(--border-soft)",
            }}
          >
            <div className="px-5 pb-6 pt-5 md:px-6 md:pb-7 md:pt-6">
              <div className="flex items-start justify-between gap-3">
                <p
                  className="leading-tight"
                  style={{ fontFamily: PF, fontSize: 18, fontWeight: 700 }}
                >
                  <span style={{ color: "var(--foreground)" }}>Tag</span>
                  <span style={{ color: "var(--gold)" }}>lines</span>
                </p>
                <button
                  type="button"
                  onClick={() => dismiss({ fromHtp: true })}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full border transition hover:opacity-90"
                  style={{ borderColor: "var(--border-soft)", background: "var(--surface)" }}
                  aria-label="Close"
                >
                  <span className="relative block size-3" aria-hidden>
                    <span
                      className="absolute left-1/2 top-1/2 block h-px w-[11px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-muted"
                    />
                    <span
                      className="absolute left-1/2 top-1/2 block h-px w-[11px] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-muted"
                    />
                  </span>
                </button>
              </div>
              <p
                className="mt-2 text-[13px] italic leading-snug"
                style={{ fontFamily: PF, color: "var(--gold)" }}
              >
                One movie. Every day.
              </p>

              <div className="mt-6">
                <StepBlock dividerColor={dividerColor} stepIndex={0}>
                  <StepTitle>You&apos;ll see a movie tagline</StepTitle>
                  <blockquote
                    className="mt-3 border-l-4 pl-3.5 py-1.5 italic"
                    style={{
                      borderColor: "var(--gold)",
                      fontFamily: PF,
                      fontSize: "0.95rem",
                      lineHeight: 1.45,
                      color: "var(--gold)",
                    }}
                  >
                    In space, no one can hear you scream.
                  </blockquote>
                </StepBlock>

                <StepBlock dividerColor={dividerColor} stepIndex={1}>
                  <StepTitle>Guess the film — 5 chances</StepTitle>
                  <div className="mt-2 flex justify-center">
                    <span
                      className="select-none leading-none"
                      style={{
                        fontFamily: PF,
                        fontSize: 42,
                        fontWeight: 700,
                        color: "color-mix(in srgb, var(--foreground) 15%, transparent)",
                      }}
                      aria-hidden
                    >
                      5
                    </span>
                  </div>
                </StepBlock>

                <StepBlock dividerColor={dividerColor} stepIndex={2}>
                  <StepTitle>Wrong guess? You earn a hint</StepTitle>
                  <p className="mt-2" style={{ fontFamily: DM, fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.5 }}>
                    Empty guess works too.
                  </p>
                </StepBlock>

                <StepBlock dividerColor={dividerColor} stepIndex={3}>
                  <StepTitle>Each hint gives a little more away</StepTitle>
                  <ul className="mt-3 list-none space-y-2 p-0">
                    <HintTileDim text="The employer here makes Amazon look generous." bg={dimTileBg} border={dimTileBorder} />
                    <HintTileDim
                      text="The creature design was so disturbing, even the cast looked away."
                      bg={dimTileBg}
                      border={dimTileBorder}
                    />
                    <HintTileActive
                      text="The real hero is a woman. In 1979, that was controversial."
                      bg={activeTileBg}
                      border={activeTileBorder}
                      textColor={activeTileText}
                    />
                  </ul>
                  <p
                    className="mt-3 text-center"
                    style={{ fontFamily: DM, fontSize: "0.72rem", color: "var(--muted)", letterSpacing: "0.02em" }}
                  >
                    ↑ harder / easier ↓
                  </p>
                </StepBlock>
              </div>

              <div className="mt-6 border-t pt-5" style={{ borderColor: dividerColor }}>
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-md focus-within:outline-none focus-within:ring-2 focus-within:ring-gold/40"
                  style={{ fontFamily: DM, fontSize: "0.85rem", color: "var(--foreground)" }}
                >
                  <input
                    type="checkbox"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition"
                    style={{
                      borderColor: dontShowAgain ? "var(--gold)" : "var(--border-soft)",
                      background: "var(--surface)",
                    }}
                    aria-hidden
                  >
                    <span
                      className="size-2.5 rounded-[1px] transition"
                      style={{
                        background: "var(--gold)",
                        opacity: dontShowAgain ? 1 : 0,
                      }}
                    />
                  </span>
                  <span className="leading-snug">Don&apos;t show this again</span>
                </label>

                <button
                  type="button"
                  onClick={() => dismiss({ fromHtp: true })}
                  className="mt-5 w-full rounded-[14px] py-[18px] font-semibold text-background transition hover:opacity-95 active:scale-[0.99]"
                  style={{ fontFamily: DM, background: "var(--gold)", fontSize: "0.95rem" }}
                >
                  Let&apos;s play
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="leading-snug" style={{ fontFamily: PF, fontSize: "1.05rem", fontWeight: 700, color: "var(--foreground)" }}>
      <span
        className="mr-2 inline-block size-1.5 shrink-0 rounded-full align-middle"
        style={{ background: "color-mix(in srgb, var(--gold) 45%, transparent)" }}
        aria-hidden
      />
      {children}
    </h3>
  );
}

function StepBlock({
  children,
  dividerColor,
  stepIndex,
}: {
  children: React.ReactNode;
  dividerColor: string;
  stepIndex: number;
}) {
  return (
    <div
      className={stepIndex > 0 ? "border-t pt-6" : ""}
      style={stepIndex > 0 ? { borderColor: dividerColor } : undefined}
    >
      {children}
    </div>
  );
}

function HintTileDim({ text, bg, border }: { text: string; bg: string; border: string }) {
  return (
    <li
      className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5"
      style={{
        fontFamily: DM,
        fontSize: "0.78rem",
        lineHeight: 1.45,
        background: bg,
        borderColor: border,
        color: "var(--muted)",
      }}
    >
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: "var(--border-soft)" }} aria-hidden />
      <span>{text}</span>
    </li>
  );
}

function HintTileActive({ text, bg, border, textColor }: { text: string; bg: string; border: string; textColor: string }) {
  return (
    <li
      className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5"
      style={{
        fontFamily: DM,
        fontSize: "0.78rem",
        lineHeight: 1.45,
        background: bg,
        borderColor: border,
        color: textColor,
      }}
    >
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: "var(--gold)" }} aria-hidden />
      <span>{text}</span>
    </li>
  );
}
