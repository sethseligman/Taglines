/**
 * Normalize user guess and accepted answers for comparison.
 * - Ignore capitalization
 * - Ignore punctuation (apostrophes, periods, hyphens, etc.)
 * - Collapse whitespace
 * - Optional: strip leading "the", normalize "part i/ii" and subtitle omissions
 */

const PUNCTUATION_REGEX = /[''’.,\-:;!?()\[\]{}"\/\\@#$%^&*+=]/g;
const MULTI_SPACE_REGEX = /\s+/g;
const LEADING_THE_REGEX = /^the\s+/i;

/**
 * Normalize a string for answer comparison.
 * Lowercase, strip punctuation, collapse spaces, optional leading "the" removal.
 */
export function normalizeAnswer(value: string): string {
  if (!value || typeof value !== "string") return "";
  let s = value
    .trim()
    .toLowerCase()
    .replace(PUNCTUATION_REGEX, " ")
    .replace(MULTI_SPACE_REGEX, " ")
    .trim();
  // Optional: treat "the x" same as "x"
  s = s.replace(LEADING_THE_REGEX, "");
  return s.trim();
}

/**
 * Apply subtitle omissions: "e.t. the extra-terrestrial" -> "e t the extra terrestrial"
 * and we also accept "e t" or "et" for short. So when comparing we normalize both sides.
 * Additional: "part i" / "part 1" / "part one" equivalence (optional).
 */
function normalizePartSuffix(s: string): string {
  return s
    .replace(/\bpart\s+i\b/gi, "part 1")
    .replace(/\bpart\s+ii\b/gi, "part 2")
    .replace(/\bpart\s+iii\b/gi, "part 3")
    .replace(/\bpart\s+iv\b/gi, "part 4")
    .replace(/\bpart\s+one\b/gi, "part 1")
    .replace(/\bpart\s+two\b/gi, "part 2");
}

/**
 * Full normalization for comparison (includes part number variants).
 */
export function normalizeForComparison(value: string): string {
  const step1 = normalizeAnswer(value);
  return normalizePartSuffix(step1);
}

/**
 * Check if a user guess matches any of the accepted answers (or the title).
 * Uses full normalization on both sides.
 */
export function isGuessCorrect(
  guess: string,
  acceptedAnswers: string[],
  canonicalTitle?: string
): boolean {
  const normalizedGuess = normalizeForComparison(guess);
  if (!normalizedGuess) return false;
  const toCheck = canonicalTitle
    ? [canonicalTitle, ...acceptedAnswers]
    : acceptedAnswers;
  return toCheck.some((a) => normalizeForComparison(a) === normalizedGuess);
}
