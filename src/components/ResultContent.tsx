"use client";

import type { ReactNode } from "react";
import { useImdbMeta } from "@/hooks/useImdbMeta";
import { FONT_DM, FONT_PLAYFAIR } from "@/lib/fontStacks";

export type ResultContentVariant = "modal" | "completion";

export interface ResultContentStats {
  played: number;
  winPct: number;
  streak: number;
  bestStreak: number;
}

export interface ResultContentProps {
  variant: ResultContentVariant;
  title: string;
  year: number;
  genre: string;
  tagline: string;
  posterUrl: string | null;
  showPoster: boolean;
  onPosterError: () => void;
  showDailyStats?: boolean;
  stats?: ResultContentStats;
  copied: boolean;
  onShare: () => void;
  /** Renders between the IMDb tile divider and daily stats/share (e.g. solve beat, countdown). */
  betweenTileAndDailyExtras?: ReactNode;
}

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <circle cx="18" cy="5" r="2.25" fill="currentColor" />
      <circle cx="6" cy="12" r="2.25" fill="currentColor" />
      <circle cx="18" cy="19" r="2.25" fill="currentColor" />
      <path
        d="M8.59 13.51l6.83 3.98M15.41 6.51L8.58 10.49"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ResultContent({
  variant,
  title,
  year,
  genre,
  tagline,
  posterUrl,
  showPoster,
  onPosterError,
  showDailyStats = false,
  stats,
  copied,
  onShare,
  betweenTileAndDailyExtras,
}: ResultContentProps) {
  const meta = useImdbMeta(title, year);
  const isModal = variant === "modal";
  const pf = FONT_PLAYFAIR;
  const dm = isModal ? FONT_DM : '"DM Sans", sans-serif';

  const metaLine = `${year} · ${genre}`;
  const imdbRating = meta?.imdbRating ?? null;
  const displayMetaLine = imdbRating !== null ? `${metaLine} · ⭐ ${imdbRating.toFixed(1)}` : metaLine;
  const movieImdbUrl = meta?.movieImdbId ? `https://www.imdb.com/title/${meta.movieImdbId}` : null;

  const posterImg = showPoster && posterUrl ? (
    <img
      src={posterUrl}
      alt=""
      width={84}
      height={124}
      className="block shrink-0 object-cover"
      style={{ width: 84, height: 124, borderRadius: 6 }}
      onError={onPosterError}
    />
  ) : (
    <div
      className="shrink-0 bg-[#161616]"
      style={{ width: 84, height: 124, borderRadius: 6, border: "1px solid #222" }}
      aria-hidden
    />
  );

  const tileOuterClassName = isModal ? "mt-2 w-full" : "mx-auto mt-2 w-full";

  return (
    <>
      <div className={tileOuterClassName}>
        {movieImdbUrl ? (
          <div className="relative rounded-md border border-[#1e1e1e] bg-[#111] px-3 py-3">
            <a
              href={movieImdbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute inset-0 z-0"
              aria-label={`View ${title} on IMDb`}
            />
            <div
              className={`relative z-10 flex w-full flex-row items-start gap-3${isModal ? "" : " text-left"}`}
            >
              {posterImg}
              <div className={`min-w-0 flex-1${isModal ? " text-left" : ""}`}>
                <p
                  className="font-bold leading-tight text-[#f0ede6]"
                  style={{ fontFamily: pf, fontSize: "1.12rem", lineHeight: 1.15 }}
                >
                  {title}
                </p>
                <p
                  className="mt-1 text-[#6b6860]"
                  style={{ fontFamily: dm, fontSize: "0.74rem", lineHeight: 1.3 }}
                >
                  {displayMetaLine}
                </p>
                <p
                  className="mt-2.5 italic leading-snug text-[#d7d3c8]"
                  style={{ fontFamily: pf, fontSize: "1.03rem" }}
                >
                  {tagline}
                </p>
                {meta?.director?.name && meta.director.imdbId ? (
                  <p className="mt-1.5 text-[#6b6860]" style={{ fontFamily: dm, fontSize: "0.72rem" }}>
                    🎬{" "}
                    <a
                      href={`https://www.imdb.com/name/${meta.director.imdbId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-20 underline"
                    >
                      {meta.director.name}
                    </a>
                  </p>
                ) : null}
                {meta?.cast?.length ? (
                  <p
                    className="mt-1.5 text-[#6b6860]"
                    style={{ fontFamily: dm, fontSize: "0.72rem", lineHeight: 1.35 }}
                  >
                    {meta.cast.map((actor, idx) => (
                      <span key={`${actor.name}-${idx}`}>
                        {actor.imdbId ? (
                          <a
                            href={`https://www.imdb.com/name/${actor.imdbId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative z-20 underline"
                          >
                            {actor.name}
                          </a>
                        ) : (
                          actor.name
                        )}
                        {idx < meta.cast.length - 1 ? " · " : ""}
                      </span>
                    ))}
                  </p>
                ) : null}
                <a
                  href={movieImdbUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative z-20 mt-1.5 inline-block text-[#6b6860] underline"
                  style={{ fontFamily: dm, fontSize: "0.72rem" }}
                >
                  View on IMDb →
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`flex w-full flex-row items-start gap-3 rounded-md border border-[#1e1e1e] bg-[#111] px-3 py-3${isModal ? "" : " text-left"}`}
          >
            {posterImg}
            <div className={`min-w-0 flex-1${isModal ? " text-left" : ""}`}>
              <p
                className="font-bold leading-tight text-[#f0ede6]"
                style={{ fontFamily: pf, fontSize: "1.12rem", lineHeight: 1.15 }}
              >
                {title}
              </p>
              <p
                className="mt-1 text-[#6b6860]"
                style={{ fontFamily: dm, fontSize: "0.74rem", lineHeight: 1.3 }}
              >
                {metaLine}
              </p>
              <p
                className="mt-2.5 italic leading-snug text-[#d7d3c8]"
                style={{ fontFamily: pf, fontSize: "1.03rem" }}
              >
                {tagline}
              </p>
            </div>
          </div>
        )}
        <div className="mt-4 w-full border-t" style={{ borderColor: "#1e1e1e" }} />
      </div>

      {betweenTileAndDailyExtras}

      {showDailyStats && stats ? (
        <>
          <div
            className={isModal ? "mt-6 grid w-full grid-cols-4 border border-[#222]" : "mt-8 grid w-full grid-cols-4 border border-[#222]"}
            style={isModal ? { borderColor: "#222" } : undefined}
          >
            {[
              { n: stats.played, l: "Played" },
              { n: `${stats.winPct}%`, l: "Win %" },
              { n: stats.streak, l: "Streak" },
              { n: stats.bestStreak, l: "Best" },
            ].map((cell, i) => (
              <div
                key={cell.l}
                className="flex flex-col items-center justify-center py-3 text-center"
                style={{
                  borderLeft: i > 0 ? "1px solid #222" : undefined,
                }}
              >
                <span
                  className="font-bold text-[#f0ede6]"
                  style={{ fontFamily: dm, fontSize: isModal ? "1.4rem" : "1.35rem" }}
                >
                  {cell.n}
                </span>
                <span
                  className="mt-1 uppercase tracking-[0.06em] text-[#6b6860]"
                  style={{ fontFamily: dm, fontSize: "0.65rem" }}
                >
                  {cell.l}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex w-full justify-center">
            {isModal ? (
              <button
                type="button"
                onClick={onShare}
                className="flex w-full max-w-[320px] items-center justify-center gap-2 font-bold text-black transition active:scale-[0.99]"
                style={{
                  fontFamily: dm,
                  height: 52,
                  backgroundColor: "#c9a96e",
                  borderRadius: 8,
                }}
              >
                <ShareIcon />
                {copied ? "Copied" : "Share today's result"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onShare}
                className="w-full rounded-lg bg-[#c9a96e] py-3 font-bold text-black transition hover:bg-[#d4b377] active:scale-[0.99]"
                style={{ fontFamily: dm }}
              >
                {copied ? "Copied" : "Share today's result"}
              </button>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
