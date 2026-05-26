"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { FONT_DM, FONT_PLAYFAIR } from "@/lib/fontStacks";

const CONTACT_EMAIL = "taglinesapp@gmail.com";
const MAILTO_SUBJECT = "Taglines Contact";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type ContactModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ContactModal({ open, onClose }: ContactModalProps) {
  const [message, setMessage] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmedMessage = message.trim();
  const canSend = trimmedMessage.length > 0;

  const handleClose = useCallback(() => {
    setMessage("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const handleBackdropPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (cardRef.current?.contains(e.target as Node)) return;
    handleClose();
  };

  const handleSend = () => {
    if (!canSend) return;
    const mailtoLink = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(MAILTO_SUBJECT)}&body=${encodeURIComponent(trimmedMessage)}`;
    window.location.href = mailtoLink;
    handleClose();
  };

  if (!open || typeof document === "undefined") return null;

  const transitionClass = reduceMotion
    ? ""
    : "transition-[opacity,transform] duration-150 ease-out";

  return createPortal(
    <div
      className={`pointer-events-auto fixed inset-0 z-[20100] flex items-center justify-center ${transitionClass}`}
      style={{ background: "var(--background)" }}
      role="presentation"
      onPointerDown={handleBackdropPointerDown}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
        className={`relative mx-4 w-full max-w-[390px] overflow-hidden rounded-[24px] border shadow-2xl ${reduceMotion ? "" : "transition-opacity duration-150 ease-out"}`}
        style={{
          background: "#111111",
          borderColor: "var(--border-soft)",
          maxHeight: "min(100dvh - 2rem, 100vh - 2rem)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 pb-6 pt-5 md:px-6 md:pb-7 md:pt-6">
          <div className="flex items-start justify-between gap-3">
            <h2
              id="contact-modal-title"
              className="leading-tight"
              style={{ fontFamily: FONT_PLAYFAIR, fontSize: 18, fontWeight: 700, color: "var(--foreground)" }}
            >
              Contact
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="flex size-[44px] min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border transition hover:opacity-90"
              style={{ borderColor: "var(--border-soft)", background: "#111111" }}
              aria-label="Close"
            >
              <span className="relative block size-3" aria-hidden>
                <span className="absolute left-1/2 top-1/2 block h-px w-[11px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#6b6860]" />
                <span className="absolute left-1/2 top-1/2 block h-px w-[11px] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-[#6b6860]" />
              </span>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your message…"
            rows={5}
            className="mt-6 w-full resize-y rounded-xl border border-white/15 bg-[#111111] px-4 py-3 text-base text-[#f0ede6] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-[#6b6860] focus:border-[#c9a96e]/50 focus:ring-2 focus:ring-[#c9a96e]/20"
            style={{ fontFamily: FONT_DM, minHeight: 120 }}
            aria-label="Your message"
          />

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="order-2 rounded-xl border border-white/15 bg-transparent px-4 py-3 text-sm font-medium text-[#f0ede6] transition hover:bg-white/5 active:scale-[0.99] sm:order-1"
              style={{ fontFamily: FONT_DM }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="order-1 rounded-xl bg-[#c9a96e] px-4 py-3 text-sm font-semibold text-[#0d0d0d] transition hover:bg-[#c9a96e]/90 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99] sm:order-2"
              style={{ fontFamily: FONT_DM }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
