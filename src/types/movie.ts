export interface Movie {
  title: string;
  year: number;
  officialTagline: string;
  alternateTagline?: string;
  hint_1?: string;
  hint_2?: string;
  hint_3?: string;
  hint_4?: string;
  genre: string;
  castHint: string;
  plotHint: string;
  acceptedAnswers: string[];
  posterUrl?: string | null;
}

export type HintLevel = 0 | 1 | 2 | 3 | 4;

// Order: tagline → creative hints (fallback to year/genre/cast/plot text when missing)
export const HINT_LABELS: Record<HintLevel, string> = {
  0: "Tagline",
  1: "Hint 1",
  2: "Hint 2",
  3: "Hint 3",
  4: "Hint 4",
};

export const MAX_GUESSES = 5;
