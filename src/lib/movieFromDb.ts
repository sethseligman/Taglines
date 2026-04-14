import type { Movie } from "@/types/movie";
import type { DbMovie } from "@/types/database";

/** TMDB image base URL; poster_path is appended (e.g. /kqjL17yufvn9OVLyXYpvtyrFfak.jpg). */
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

export interface MovieRow extends DbMovie {
  taglines?: { tagline_text: string; is_primary: boolean }[];
  aliases?: string[];
  hint_1?: string | null;
  hint_2?: string | null;
  hint_3?: string | null;
  hint_4?: string | null;
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
    hint_1: row.hint_1 ?? undefined,
    hint_2: row.hint_2 ?? undefined,
    hint_3: row.hint_3 ?? undefined,
    hint_4: row.hint_4 ?? undefined,
    genre: row.genre,
    castHint: row.cast_hint,
    plotHint: row.plot_hint,
    acceptedAnswers,
    posterUrl: buildPosterUrl(row),
  };
}
