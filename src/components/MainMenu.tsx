"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FONT_DM } from "@/lib/fontStacks";
import { ContactModal } from "@/components/ContactModal";
import { openHowToPlayModal } from "@/lib/htpModal";
import type { DailyCompletionResult } from "@/lib/storage";

const MENU_WIDTH_PX = 224;
const MENU_GAP_PX = 6;
const VIEWPORT_PAD_PX = 8;

const GOLD = "#C9A96E";
const GOLD_TINT = "rgba(201, 169, 110, 0.12)";
const GOLD_BORDER = "rgba(201, 169, 110, 0.35)";

type Mode = "daily" | "practice";

export type MainMenuProps = {
  mode: Mode;
  gameLocked: boolean;
  dailyDateKey: string;
  dailyResult: DailyCompletionResult | null;
  onSelectDaily: () => void;
  onSelectPractice: () => void;
};

function formatMenuPuzzleDay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDailyResultSummary(result: DailyCompletionResult): string {
  if (result.status === "won") {
    const n = result.guessesUsed;
    return `Solved in ${n} ${n === 1 ? "guess" : "guesses"}`;
  }
  return `Didn't solve · ${result.guessesUsed} guesses`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function HamburgerIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

export function MainMenu({
  mode,
  gameLocked,
  dailyDateKey,
  dailyResult,
  onSelectDaily,
  onSelectPractice,
}: MainMenuProps) {
  const [open, setOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    let left = rect.right - MENU_WIDTH_PX;
    const maxLeft = window.innerWidth - MENU_WIDTH_PX - VIEWPORT_PAD_PX;
    left = Math.max(VIEWPORT_PAD_PX, Math.min(left, maxLeft));
    const top = rect.bottom + MENU_GAP_PX;
    setMenuPos({ top, left });
  }, []);

  useEffect(() => {
    setMounted(true);
    setReduceMotion(prefersReducedMotion());
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const selectDaily = () => {
    if (gameLocked && mode !== "daily") return;
    onSelectDaily();
    close();
  };

  const selectPractice = () => {
    if (gameLocked && mode !== "practice") return;
    onSelectPractice();
    close();
  };

  const selectHowToPlay = () => {
    openHowToPlayModal();
    close();
  };

  const selectContact = () => {
    close();
    setContactOpen(true);
  };

  const dailyDisabled = gameLocked && mode !== "daily";
  const practiceDisabled = gameLocked && mode !== "practice";

  const puzzleDay = formatMenuPuzzleDay(dailyDateKey);
  const dailyRowSublabel = dailyResult
    ? `${puzzleDay} · ${formatDailyResultSummary(dailyResult)}`
    : `${puzzleDay} · Playing now`;

  const practiceRowSublabel =
    mode === "practice" ? "Playing now" : "Random movies · unlimited plays";

  const triggerLabel = mode === "practice" ? "Practice mode" : "Main menu";

  const menu =
    open && menuPos && mounted ? (
      <div
        ref={menuRef}
        role="menu"
        aria-label="Main menu"
        className="fixed z-[10060]"
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: MENU_WIDTH_PX,
          background: "#111111",
          border: "1px solid #1e1e1e",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
          fontFamily: FONT_DM,
          overflow: "hidden",
          opacity: reduceMotion ? 1 : undefined,
          animation: reduceMotion ? undefined : "mainMenuFadeIn 150ms var(--ease-out) both",
        }}
      >
        <MenuRow
          label="Today"
          sublabel={dailyRowSublabel}
          active={mode === "daily"}
          disabled={dailyDisabled}
          onSelect={selectDaily}
        />
        <MenuRow
          label="Practice"
          sublabel={practiceRowSublabel}
          active={mode === "practice"}
          disabled={practiceDisabled}
          onSelect={selectPractice}
        />
        <MenuDivider />
        <MenuRow label="Challenges" disabled soon />
        <MenuRow label="Playlists" disabled soon />
        <MenuDivider />
        <MenuRow label="How to Play" onSelect={selectHowToPlay} />
        <MenuRow label="Contact" onSelect={selectContact} />
        <MenuRow label="About" disabled soon />
        <style jsx global>{`
          @keyframes mainMenuFadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}</style>
      </div>
    ) : null;

  return (
    <div className="flex items-center gap-2.5">
      {mode === "practice" ? (
        <span
          className="select-none text-right leading-tight"
          style={{
            fontFamily: FONT_DM,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: GOLD,
          }}
          aria-hidden
        >
          Practice
        </span>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-opacity duration-150 ease-out hover:opacity-80 active:opacity-65"
        style={{
          color: "#F0EDE6",
          height: 28,
          boxShadow: mode === "practice" ? `0 0 0 1px ${GOLD_BORDER}` : undefined,
          borderRadius: 4,
          padding: mode === "practice" ? 2 : 0,
        }}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <HamburgerIcon />
      </button>
      {mounted && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  );
}

function MenuDivider() {
  return <div role="separator" style={{ height: 1, background: "#1e1e1e", margin: 0 }} />;
}

type MenuRowProps = {
  label: string;
  sublabel?: string;
  active?: boolean;
  disabled?: boolean;
  soon?: boolean;
  onSelect?: () => void;
};

function MenuRow({ label, sublabel, active, disabled, soon, onSelect }: MenuRowProps) {
  const isDisabled = Boolean(disabled || soon);
  const labelColor = isDisabled ? "#6B6860" : active ? GOLD : "#F0EDE6";
  const sublabelColor = "#6B6860";

  return (
    <div role="none">
      <button
        type="button"
        role="menuitem"
        disabled={isDisabled}
        onClick={isDisabled ? undefined : onSelect}
        className="flex w-full cursor-pointer items-center justify-between gap-2 border-0 text-left transition-colors duration-150 ease-out disabled:cursor-default"
        style={{
          fontFamily: FONT_DM,
          padding: "11px 14px 11px 12px",
          color: labelColor,
          background: active ? GOLD_TINT : "transparent",
          borderLeft: active ? `3px solid ${GOLD}` : "3px solid transparent",
        }}
        onMouseEnter={(e) => {
          if (isDisabled) return;
          if (!active) e.currentTarget.style.background = "#1a1a1a";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = active ? GOLD_TINT : "transparent";
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 14,
              fontWeight: active ? 500 : 400,
              lineHeight: 1.25,
            }}
          >
            {label}
          </span>
          {sublabel ? (
            <span
              style={{
                display: "block",
                fontSize: 11,
                color: sublabelColor,
                marginTop: 2,
                lineHeight: 1.3,
              }}
            >
              {sublabel}
            </span>
          ) : null}
        </span>
        {soon ? <span style={{ fontSize: 12, color: "#4a4844", flexShrink: 0 }}>Soon</span> : null}
      </button>
    </div>
  );
}
