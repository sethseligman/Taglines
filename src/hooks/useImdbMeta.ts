"use client";

import { useEffect, useState } from "react";

export interface ImdbMeta {
  movieImdbId: string | null;
  imdbRating: number | null;
  director: { name: string; imdbId: string | null } | null;
  cast: Array<{ name: string; imdbId: string | null }>;
}

/** Fetches TMDB-derived IMDb links, rating, director, and cast for a movie title + year. */
export function useImdbMeta(title: string, year: number): ImdbMeta | null {
  const [meta, setMeta] = useState<ImdbMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear before refetch
    setMeta(null);
    const encodedTitle = encodeURIComponent(title);
    const encodedYear = encodeURIComponent(String(year));

    const load = async () => {
      try {
        const res = await fetch(`/api/tmdb-movie-meta?title=${encodedTitle}&year=${encodedYear}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as ({ ok: true } & ImdbMeta) | { ok?: false };
        if (!cancelled && data.ok) {
          setMeta({
            movieImdbId: data.movieImdbId ?? null,
            imdbRating: typeof data.imdbRating === "number" ? data.imdbRating : null,
            director: data.director ?? null,
            cast: Array.isArray(data.cast) ? data.cast.slice(0, 3) : [],
          });
        }
      } catch {
        // Graceful fallback: keep compact tile without external data.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [title, year]);

  return meta;
}
