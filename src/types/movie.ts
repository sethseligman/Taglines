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

// Order: tagline → year → genre → cast → plot (early hints more deductive; plot last)
export const HINT_LABELS: Record<HintLevel, string> = {
  0: "Tagline",
  1: "Year",
  2: "Genre",
  3: "Cast",
  4: "Plot",
};

export const MAX_GUESSES = 5;
