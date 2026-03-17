import type { Movie } from "@/types/movie";
import type { DbMovie } from "@/types/database";

/** TMDB image base URL; poster_path is appended (e.g. /kqjL17yufvn9OVLyXYpvtyrFfak.jpg). */
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

export interface MovieRow extends DbMovie {
  taglines?: { tagline_text: string; is_primary: boolean }[];
  aliases?: string[];
}

function buildPosterUrl(row: MovieRow): string | undefined {
  const path = row.poster_path?.trim();
  if (path) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${TMDB_IMAGE_BASE}${normalized}`;
  }
  return row.poster_url?.trim() || undefined;
}

/**
 * Build game Movie from DB movie + taglines + aliases.
 * acceptedAnswers = [title, ...aliases]. Primary tagline = officialTagline, first other = alternateTagline.
 * Poster: prefer TMDB poster_path (build URL); fall back to poster_url if set.
 */
export function movieFromDb(row: MovieRow): Movie {
  const primary = row.taglines?.find((t) => t.is_primary);
  const others = row.taglines?.filter((t) => !t.is_primary) ?? [];
  const officialTagline = primary?.tagline_text ?? "";
  const alternateTagline = others[0]?.tagline_text;
  const acceptedAnswers = [row.title, ...(row.aliases ?? [])].filter(Boolean);
  return {
    title: row.title,
    year: row.year,
    officialTagline,
    alternateTagline,
    genre: row.genre,
    castHint: row.cast_hint,
    plotHint: row.plot_hint,
    acceptedAnswers,
    posterUrl: buildPosterUrl(row),
  };
}
