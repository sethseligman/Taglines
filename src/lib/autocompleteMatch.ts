import { normalizeForComparison } from "@/lib/answerNormalize";

/** Minimum characters before any suggestions appear. */
const MIN_QUERY_LEN = 3;

/** Maximum suggestions to show; only high-confidence. */
const MAX_SUGGESTIONS = 5;

/** Minimum score (0–100) to show a suggestion. Weak matches are excluded. */
const MIN_SCORE_THRESHOLD = 52;

/** Generic words that should not trigger broad suggestions. */
const BLOCKLIST = new Set(
  ["the", "a", "an", "movie", "film", "it", "is", "in", "on", "to", "of", "and", "or", "so", "go", "no", "be", "me", "we", "do", "see", "my", "by", "at", "as", "he", "she", "his", "her", "him", "man", "men", "day", "way", "say", "may", "new", "old", "big", "one", "two", "all", "get", "can", "run", "out", "up", "us", "am", "if", "so"].map((w) =>
    w.toLowerCase()
  )
);

/**
 * Levenshtein distance between two strings.
 */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
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

/**
 * Fuzzy similarity 0–1 (1 = identical). Uses edit distance.
 */
function fuzzySimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length, 1);
  const dist = editDistance(a, b);
  return 1 - dist / maxLen;
}

/**
 * Minimum prefix length required before a title can be suggested via prefix match.
 * Long/multi-word titles require more commitment; short titles stay responsive.
 */
function requiredPrefixLength(normalizedTitleLength: number): number {
  return Math.max(3, Math.min(6, Math.ceil(normalizedTitleLength * 0.3)));
}

export interface ScoredMatch {
  title: string;
  score: number;
}

/**
 * Precision autocomplete: only return suggestions when input is meaningfully
 * close to a title or alias. Validation remains forgiving; suggestions are strict.
 */
export function getPrecisionSuggestions(query: string, candidates: string[]): string[] {
  const raw = query.trim();
  const norm = normalizeForComparison(raw);
  if (norm.length < MIN_QUERY_LEN) return [];
  if (BLOCKLIST.has(norm)) return [];

  const scored: ScoredMatch[] = [];
  for (const title of candidates) {
    const normTitle = normalizeForComparison(title);
    if (!normTitle) continue;

    let score = 0;

    // Highest: normalized prefix match, only if query meets title-specific minimum length
    const minPrefix = requiredPrefixLength(normTitle.length);
    const prefixMatch = norm.length >= minPrefix && (normTitle.startsWith(norm) || norm.startsWith(normTitle));
    if (prefixMatch) {
      const ratio = normTitle.startsWith(norm) ? norm.length / normTitle.length : normTitle.length / norm.length;
      score = Math.max(score, 60 + Math.round(ratio * 35)); // 60–95
    }

    // Strong fuzzy match (typo or close spelling)
    const similarity = fuzzySimilarity(norm, normTitle);
    if (similarity >= 0.5) {
      const fuzzyScore = Math.round(similarity * 85); // 0.5 -> 42, 0.8 -> 68, 1 -> 85
      score = Math.max(score, fuzzyScore);
    }

    // Contains: only boost if already have a decent fuzzy score (avoid broad "the" → everything)
    const contains = normTitle.includes(norm) || norm.includes(normTitle);
    const minLen = Math.min(norm.length, normTitle.length);
    const lenRatio = minLen / Math.max(norm.length, normTitle.length, 1);
    if (contains && lenRatio >= 0.35 && similarity >= 0.35) {
      score = Math.max(score, 38 + Math.round(lenRatio * 25)); // weak contains gets ~45–55
    }

    if (score >= MIN_SCORE_THRESHOLD) {
      scored.push({ title, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_SUGGESTIONS).map((s) => s.title);
}
