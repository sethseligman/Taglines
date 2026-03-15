import type { Movie } from "@/types/movie";

/**
 * Sample movie dataset for practice mode.
 * In production, daily mode would use a date-seeded selection from a larger dataset.
 */
export const SAMPLE_MOVIES: Movie[] = [
  {
    title: "The Shawshank Redemption",
    year: 1994,
    officialTagline: "Fear can hold you prisoner. Hope can set you free.",
    alternateTagline: "Two imprisoned men bond over a number of years.",
    genre: "Drama",
    castHint: "Tim Robbins, Morgan Freeman",
    plotHint: "A banker wrongly convicted of murder finds friendship and hope in prison.",
    acceptedAnswers: [
      "the shawshank redemption",
      "shawshank redemption",
      "shawshank",
    ],
  },
  {
    title: "Inception",
    year: 2010,
    officialTagline: "Your mind is the scene of the crime.",
    genre: "Sci-Fi, Thriller",
    castHint: "Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page",
    plotHint: "A thief who steals secrets through dream-sharing is offered a chance at redemption.",
    acceptedAnswers: ["inception"],
  },
  {
    title: "The Dark Knight",
    year: 2008,
    officialTagline: "Why so serious?",
    alternateTagline: "Welcome to a world without rules.",
    genre: "Action, Crime, Drama",
    castHint: "Christian Bale, Heath Ledger, Aaron Eckhart",
    plotHint: "Batman must accept one of the greatest psychological tests to fight injustice.",
    acceptedAnswers: [
      "the dark knight",
      "dark knight",
      "batman the dark knight",
    ],
  },
  {
    title: "Alien",
    year: 1979,
    officialTagline: "In space no one can hear you scream.",
    genre: "Horror, Sci-Fi",
    castHint: "Sigourney Weaver, Tom Skerritt, John Hurt",
    plotHint: "The crew of a commercial spacecraft encounter a deadly life form.",
    acceptedAnswers: ["alien", "alien 1979"],
  },
  {
    title: "Jaws",
    year: 1975,
    officialTagline: "Don't go in the water.",
    genre: "Thriller, Adventure",
    castHint: "Roy Scheider, Robert Shaw, Richard Dreyfuss",
    plotHint: "A killer shark unleashes chaos on a beach community.",
    acceptedAnswers: ["jaws"],
  },
  {
    title: "The Godfather",
    year: 1972,
    officialTagline: "An offer you can't refuse.",
    genre: "Crime, Drama",
    castHint: "Marlon Brando, Al Pacino, James Caan",
    plotHint: "The aging patriarch of an organized crime dynasty transfers control to his son.",
    acceptedAnswers: ["the godfather", "godfather", "godfather part i"],
  },
  {
    title: "E.T. the Extra-Terrestrial",
    year: 1982,
    officialTagline: "He is afraid. He is alone. He is three million light years from home.",
    genre: "Family, Sci-Fi",
    castHint: "Henry Thomas, Drew Barrymore, Dee Wallace",
    plotHint: "A troubled child summons the courage to help a friendly alien escape Earth.",
    acceptedAnswers: [
      "e.t.",
      "e.t. the extra-terrestrial",
      "et",
      "et the extra-terrestrial",
    ],
  },
  {
    title: "Gone with the Wind",
    year: 1939,
    officialTagline: "The most magnificent picture ever!",
    alternateTagline: "A civilization gone with the wind.",
    genre: "Drama, Romance, War",
    castHint: "Vivien Leigh, Clark Gable, Olivia de Havilland",
    plotHint: "A manipulative Southern belle struggles with love and survival during the Civil War.",
    acceptedAnswers: ["gone with the wind", "gone with the wind 1939"],
  },
];

/**
 * Get a deterministic movie for a given date (for daily mode).
 * Uses a simple hash of the date string to pick from the sample set.
 */
export function getMovieForDate(date: Date): Movie {
  const dateString = date.toISOString().slice(0, 10); // YYYY-MM-DD
  let hash = 0;
  for (let i = 0; i < dateString.length; i++) {
    const char = dateString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const index = Math.abs(hash) % SAMPLE_MOVIES.length;
  return SAMPLE_MOVIES[index]!;
}

/**
 * Get today's date at midnight in local time for consistent daily seed.
 */
export function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
