"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { FONT_DM, FONT_PLAYFAIR } from "@/lib/fontStacks";
import { openHowToPlayModal } from "@/lib/htpModal";

const KEY_SPLASHED = "taglines-splashed";
const SPLASH_DISMISSED_EVENT = "taglines:splash-dismissed";

const PF = FONT_PLAYFAIR;
const DM = FONT_DM;

export function SplashModal() {
  const notifySplashDismissed = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(SPLASH_DISMISSED_EVENT));
  }, []);

  const [open, setOpen] = useState(false);
  const [showtimeLayer, setShowtimeLayer] = useState(false);
  const [showtimeTextVisible, setShowtimeTextVisible] = useState(false);
  const [showtimeCurtainOut, setShowtimeCurtainOut] = useState(false);

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

  useEffect(() => {
    if (!open) {
      setShowtimeLayer(false);
      setShowtimeTextVisible(false);
      setShowtimeCurtainOut(false);
    }
  }, [open]);

  const persistDismiss = useCallback((fromHtp: boolean) => {
    try {
      localStorage.setItem(KEY_SPLASHED, "true");
      void fromHtp;
    } catch {
      // ignore
    }
  }, []);

  const dismiss = useCallback(
    (opts?: { fromHtp?: boolean; notify?: boolean }) => {
      persistDismiss(Boolean(opts?.fromHtp));
      if (opts?.notify !== false) notifySplashDismissed();
      setOpen(false);
    },
    [notifySplashDismissed, persistDismiss]
  );

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[200]"
      style={{ background: "var(--background)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Taglines"
    >
      <div
        className="flex h-full min-h-0 w-full flex-col items-center justify-center"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex w-full max-w-[390px] flex-col items-center">
          <p className="text-center leading-none" style={{ fontFamily: PF, fontSize: 52, fontWeight: 700 }}>
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
            onClick={openHowToPlayModal}
            className="mt-5 border-none bg-transparent p-0 underline-offset-2 hover:underline"
            style={{ fontFamily: DM, fontSize: 13, color: "var(--muted)" }}
          >
            How to play
          </button>
        </div>
      </div>

      {showtimeLayer ? (
        <div
          className={`pointer-events-none fixed inset-0 z-[210] flex items-center justify-center transition-opacity duration-200 ease-out ${
            showtimeCurtainOut ? "opacity-0" : "opacity-100"
          }`}
          style={{ background: "var(--background)" }}
        >
          <p
            className={`px-6 text-center transition-opacity duration-200 ease-out ${
              showtimeTextVisible ? "opacity-100" : "opacity-0"
            }`}
            style={{
              fontFamily: PF,
              fontSize: 36,
              fontStyle: "italic",
              fontWeight: 400,
              color: "var(--gold)",
            }}
          >
            It&apos;s showtime.
          </p>
        </div>
      ) : null}
    </div>
  );
}
