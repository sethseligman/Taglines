"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPrecisionSuggestions } from "@/lib/autocompleteMatch";

interface GuessInputProps {
  suggestions: string[];
  onSubmit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  /** Optional: show a Guess button (for mobile / clarity). Enter and selection still submit. */
  showSubmitButton?: boolean;
}

export function GuessInput({
  suggestions,
  onSubmit,
  disabled = false,
  placeholder = "Search movies...",
  "aria-label": ariaLabel = "Guess the movie",
  showSubmitButton = true,
}: GuessInputProps) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const clearAfterSubmit = useCallback(() => {
    setValue("");
    setOpen(false);
    setHighlightIndex(0);
  }, []);

  const submitCurrent = useCallback(() => {
    const v = value.trim();
    if (v) {
      onSubmit(v);
      clearAfterSubmit();
    }
  }, [value, onSubmit, clearAfterSubmit]);

  const filtered = getPrecisionSuggestions(value, suggestions);

  const showDropdown = open && filtered.length > 0;

  const resetHighlight = useCallback(() => {
    setHighlightIndex(0);
  }, []);

  useEffect(() => {
    setHighlightIndex(0);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown) {
        if (e.key === "Enter") {
          e.preventDefault();
          const v = value.trim();
          if (v) {
            onSubmit(v);
            clearAfterSubmit();
          }
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
            setOpen(false);
            onSubmit(picked);
            clearAfterSubmit();
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
    [showDropdown, filtered, highlightIndex, value, submitCurrent, clearAfterSubmit]
  );

  useEffect(() => {
    if (showDropdown && listRef.current) {
      const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [showDropdown, highlightIndex]);

  const handleSelect = useCallback(
    (title: string) => {
      setOpen(false);
      onSubmit(title);
      clearAfterSubmit();
      inputRef.current?.focus();
    },
    [onSubmit, clearAfterSubmit]
  );

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
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
        className="w-full rounded-xl border border-white/15 bg-white/5 px-5 py-4 text-lg text-white placeholder-zinc-500 outline-none transition focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50"
      />
      {showDropdown && (
        <ul
          id="guess-suggestions"
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 right-0 z-10 mt-1 max-h-64 overflow-auto rounded-xl border border-white/15 bg-zinc-900/98 py-2 shadow-xl backdrop-blur-sm touch-pan-y"
        >
          {filtered.map((title, i) => (
            <li
              key={title}
              id={`guess-option-${i}`}
              role="option"
              aria-selected={i === highlightIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(title);
              }}
              className={`cursor-pointer select-none px-5 py-3 text-left text-white transition touch-manipulation ${
                i === highlightIndex ? "bg-amber-500/25 text-amber-100" : "hover:bg-white/10"
              }`}
            >
              {title}
            </li>
          ))}
        </ul>
      )}
      {showSubmitButton && (
        <button
          type="button"
          onClick={submitCurrent}
          disabled={disabled || !value.trim()}
          className="mt-4 w-full rounded-xl bg-amber-500 py-4 font-medium text-zinc-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
        >
          Guess
        </button>
      )}
    </div>
  );
}
