import type { Movie } from "@/types/movie";
import type { DbMovie } from "@/types/database";

export interface MovieRow extends DbMovie {
  taglines?: { tagline_text: string; is_primary: boolean }[];
  aliases?: string[];
}

/**
 * Build game Movie from DB movie + taglines + aliases.
 * acceptedAnswers = [title, ...aliases]. Primary tagline = officialTagline, first other = alternateTagline.
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
    posterUrl: row.poster_url ?? undefined,
  };
}
