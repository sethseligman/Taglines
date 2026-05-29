"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ContactModal } from "@/components/ContactModal";
import { FONT_DM } from "@/lib/fontStacks";
import { openHowToPlayModal } from "@/lib/htpModal";

const MENU_WIDTH_PX = 224;
const MENU_GAP_PX = 6;
const VIEWPORT_PAD_PX = 8;

function HamburgerIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

export function PortalMenu() {
  const [open, setOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
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
    setMenuPos({ top: rect.bottom + MENU_GAP_PX, left });
  }, []);

  useEffect(() => {
    setMounted(true);
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

  const menu =
    open && menuPos && mounted ? (
      <div
        ref={menuRef}
        role="menu"
        aria-label="Portal menu"
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
        }}
      >
        <MenuRow
          label="How to Play"
          onSelect={() => {
            openHowToPlayModal();
            close();
          }}
        />
        <MenuRow
          label="Contact"
          onSelect={() => {
            close();
            setContactOpen(true);
          }}
        />
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-opacity duration-150 ease-out hover:opacity-80 active:opacity-65"
        style={{ color: "#F0EDE6", height: 28 }}
        aria-label="Portal menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <HamburgerIcon />
      </button>
      {mounted && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  );
}

function MenuRow({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full cursor-pointer items-center border-0 text-left transition-colors duration-150 ease-out hover:bg-[#1a1a1a]"
      style={{
        fontFamily: FONT_DM,
        padding: "11px 14px 11px 12px",
        color: "#F0EDE6",
        fontSize: 14,
        background: "transparent",
      }}
    >
      {label}
    </button>
  );
}
