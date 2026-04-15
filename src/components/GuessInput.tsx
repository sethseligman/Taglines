"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { searchAutocompleteSuggestions } from "@/actions/movies";
import { normalizeForComparison } from "@/lib/answerNormalize";
import type { SuggestionCatalogItem } from "@/types/suggestion";

interface GuessInputProps {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  /** Optional: show a Guess button (for mobile / clarity). Enter and selection still submit. */
  showSubmitButton?: boolean;
  /** Input and Guess on one row: input flex-1, fixed-width Guess button. */
  submitInline?: boolean;
  /**
   * `false` while the guess field is focused (compact layout); `true` when relaxed after blur.
   * Lets the parent add breathing room when the keyboard is not active.
   */
  onLayoutBreathingChange?: (relaxed: boolean) => void;
}

export function GuessInput({
  onSubmit,
  disabled = false,
  placeholder = "Search movies...",
  "aria-label": ariaLabel = "Guess the movie",
  showSubmitButton = true,
  submitInline = false,
  onLayoutBreathingChange,
}: GuessInputProps) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [filtered, setFiltered] = useState<SuggestionCatalogItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const blurLayoutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRequestIdRef = useRef(0);

  const clearAfterSubmit = useCallback(() => {
    setValue("");
    setOpen(false);
    setHighlightIndex(0);
  }, []);

  /** Every successful guess path ends here: same clear, blur (dismiss keyboard), relaxed layout. */
  const finishSubmit = useCallback(
    (guess: string) => {
      const trimmed = guess.trim();
      if (!trimmed) return;
      if (blurLayoutTimeoutRef.current) {
        clearTimeout(blurLayoutTimeoutRef.current);
        blurLayoutTimeoutRef.current = null;
      }
      onSubmit(trimmed);
      clearAfterSubmit();
      onLayoutBreathingChange?.(true);
      requestAnimationFrame(() => {
        inputRef.current?.blur();
      });
    },
    [onSubmit, clearAfterSubmit, onLayoutBreathingChange]
  );

  const submitCurrent = useCallback(() => {
    finishSubmit(value);
  }, [value, finishSubmit]);

  const showDropdown = open && filtered.length > 0;

  const resetHighlight = useCallback(() => {
    setHighlightIndex(0);
  }, []);

  useEffect(() => {
    setHighlightIndex(0);
  }, [value]);

  useEffect(() => {
    if (!open || disabled) {
      setFiltered([]);
      return;
    }
    const trimmed = value.trim();
    if (normalizeForComparison(trimmed).length < 3) {
      setFiltered([]);
      return;
    }
    const requestId = ++queryRequestIdRef.current;
    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await searchAutocompleteSuggestions(trimmed);
        if (queryRequestIdRef.current !== requestId) return;
        setFiltered(results);
      } catch {
        if (queryRequestIdRef.current !== requestId) return;
        setFiltered([]);
      }
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, [value, open, disabled]);

  useEffect(() => {
    return () => {
      if (blurLayoutTimeoutRef.current) {
        clearTimeout(blurLayoutTimeoutRef.current);
      }
    };
  }, []);

  const handleInputFocus = useCallback(() => {
    if (blurLayoutTimeoutRef.current) {
      clearTimeout(blurLayoutTimeoutRef.current);
      blurLayoutTimeoutRef.current = null;
    }
    onLayoutBreathingChange?.(false);
    setOpen(true);
    const el = inputRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    });
    window.setTimeout(() => {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }, 160);
  }, [onLayoutBreathingChange]);

  const handleInputBlur = useCallback(() => {
    blurLayoutTimeoutRef.current = setTimeout(() => {
      setOpen(false);
      onLayoutBreathingChange?.(true);
      blurLayoutTimeoutRef.current = null;
    }, 180);
  }, [onLayoutBreathingChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown) {
        if (e.key === "Enter") {
          e.preventDefault();
          finishSubmit(value);
        }
        return;
      }
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightIndex((i) => (i + 1) % filtered.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightIndex((i) => (i - 1 + filtered.length) % filtered.length);
          break;
        case "Enter":
          e.preventDefault();
          const picked = filtered[highlightIndex];
          if (picked) {
            finishSubmit(picked.title);
          } else {
            submitCurrent();
          }
          break;
        case "Escape":
          setOpen(false);
          inputRef.current?.blur();
          break;
        default:
          break;
      }
    },
    [showDropdown, filtered, highlightIndex, value, submitCurrent, finishSubmit]
  );

  useEffect(() => {
    if (showDropdown && listRef.current) {
      const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [showDropdown, highlightIndex]);

  const handleSelect = useCallback(
    (item: SuggestionCatalogItem) => {
      finishSubmit(item.title);
    },
    [finishSubmit]
  );

  const inputClassName = submitInline
    ? "w-full rounded-xl border border-white/15 bg-surface px-4 py-3 text-base text-foreground placeholder:text-muted outline-none transition focus:border-gold/50 focus:ring-2 focus:ring-gold/20 disabled:opacity-50"
    : "w-full rounded-xl border border-white/15 bg-surface px-5 py-4 text-lg text-foreground placeholder:text-muted outline-none transition focus:border-gold/50 focus:ring-2 focus:ring-gold/20 disabled:opacity-50";

  const fieldBlock = (
    <div className={submitInline ? "relative min-w-0 flex-1" : "relative w-full"}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls="guess-suggestions"
        aria-activedescendant={showDropdown ? `guess-option-${highlightIndex}` : undefined}
        id="guess-input"
        autoComplete="off"
        inputMode="search"
        className={inputClassName}
      />
      {showDropdown && (
        <ul
          id="guess-suggestions"
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 right-0 z-10 mt-1 max-h-64 overflow-auto rounded-xl border border-white/15 bg-surface py-2 backdrop-blur-sm touch-pan-y"
        >
          {filtered.map((item, i) => (
            <li
              key={`${item.tmdbId}-${item.title}`}
              id={`guess-option-${i}`}
              role="option"
              aria-selected={i === highlightIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item);
              }}
              className={`cursor-pointer select-none px-5 py-3 text-left text-foreground transition touch-manipulation ${
                i === highlightIndex ? "bg-gold/25 text-gold" : "hover:bg-white/10"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">{item.title}</span>
                {item.year > 0 && (
                  <span className={`shrink-0 text-xs ${i === highlightIndex ? "text-gold/90" : "text-muted"}`}>
                    {item.year}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (submitInline && showSubmitButton) {
    return (
      <div className="flex w-full items-stretch gap-2" style={{ gap: 8 }}>
        {fieldBlock}
        <button
          type="button"
          onClick={submitCurrent}
          disabled={disabled || !value.trim()}
          className="shrink-0 rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-background transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
          style={{ width: 96 }}
        >
          Guess
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {fieldBlock}
      {showSubmitButton && (
        <button
          type="button"
          onClick={submitCurrent}
          disabled={disabled || !value.trim()}
          className="mt-4 w-full rounded-xl bg-gold py-4 font-semibold text-background transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
        >
          Guess
        </button>
      )}
    </div>
  );
}
