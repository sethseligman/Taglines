/**
 * Lightweight dev-only logging for missing daily data or content issues.
 * No-op in production; in development helps debug admin/schedule setup.
 */
const isDev = process.env.NODE_ENV === "development";

export function logDailyFallback(reason: string, dateKey: string): void {
  if (isDev) {
    console.warn(`[Taglines] Daily: ${reason} for ${dateKey}. Using local fallback.`);
  }
}

export function logPracticeFallback(reason: string): void {
  if (isDev) {
    console.warn(`[Taglines] Practice: ${reason}. Using local fallback.`);
  }
}

export function logAutocompleteFallback(reason: string): void {
  if (isDev) {
    console.warn(`[Taglines] Autocomplete: ${reason}. Using local/sample data.`);
  }
}
