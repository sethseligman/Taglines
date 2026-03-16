export interface Movie {
  title: string;
  year: number;
  officialTagline: string;
  alternateTagline?: string;
  genre: string;
  castHint: string;
  plotHint: string;
  acceptedAnswers: string[];
  posterUrl?: string | null;
}

export type HintLevel = 0 | 1 | 2 | 3 | 4;

// Order: tagline first, then progressively more revealing (genre → plot → cast → year)
export const HINT_LABELS: Record<HintLevel, string> = {
  0: "Tagline",
  1: "Genre",
  2: "Plot",
  3: "Cast",
  4: "Year",
};

export const MAX_GUESSES = 5;
