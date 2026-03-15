export interface Movie {
  title: string;
  year: number;
  officialTagline: string;
  alternateTagline?: string;
  genre: string;
  castHint: string;
  plotHint: string;
  acceptedAnswers: string[];
}

export type HintLevel = 0 | 1 | 2 | 3 | 4;

export const HINT_LABELS: Record<HintLevel, string> = {
  0: "Tagline",
  1: "Genre",
  2: "Cast",
  3: "Plot",
  4: "Year",
};

export const MAX_GUESSES = 5;
