import type { HintLevel } from "@/types/movie";
import type { Movie } from "@/types/movie";

/** Same reveal order as gameplay: tagline → hint_1..hint_4 (fallback to legacy fields). */
export function getHintBodyForLevel(movie: Movie, level: HintLevel): string {
  switch (level) {
    case 0:
      return movie.officialTagline;
    case 1:
      return movie.hint_1?.trim() || String(movie.year);
    case 2:
      return movie.hint_2?.trim() || movie.genre;
    case 3:
      return movie.hint_3?.trim() || movie.castHint;
    case 4:
      return movie.hint_4?.trim() || movie.plotHint;
    default:
      return movie.officialTagline;
  }
}
