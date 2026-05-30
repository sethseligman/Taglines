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
 * Autocomplete-only normalization: strip punctuation entirely (not to spaces),
 * collapse whitespace, lowercase. Display titles stay unchanged; use only when matching.
 */
export function normalizeForAutocompleteMatch(value: string): string {
  if (!value || typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(PUNCTUATION_REGEX, "")
    .replace(MULTI_SPACE_REGEX, " ")
    .trim();
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

/**
 * Returns the closest accepted answer (or title) if the guess is very close.
 * Used for "Did you mean X?" when the guess doesn't match.
 * Checks: exact normalized match (handled elsewhere), contains, or short edit distance.
 */
export function getDidYouMean(
  guess: string,
  acceptedAnswers: string[],
  canonicalTitle?: string
): string | null {
  const normalizedGuess = normalizeForComparison(guess);
  if (!normalizedGuess || normalizedGuess.length < 2) return null;
  const candidates = canonicalTitle
    ? [canonicalTitle, ...acceptedAnswers]
    : acceptedAnswers;
  let best: string | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const norm = normalizeForComparison(c);
    if (norm === normalizedGuess) return null; // exact match, no "did you mean"
    if (norm.includes(normalizedGuess) || normalizedGuess.includes(norm)) {
      const score = Math.min(norm.length, normalizedGuess.length);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    } else {
      const distance = simpleEditDistance(normalizedGuess, norm);
      const maxLen = Math.max(normalizedGuess.length, norm.length);
      const similarity = 1 - distance / maxLen;
      if (similarity >= 0.75 && similarity > bestScore) {
        bestScore = similarity;
        best = c;
      }
    }
  }
  return best;
}

function simpleEditDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  return dp[m]![n]!;
}
