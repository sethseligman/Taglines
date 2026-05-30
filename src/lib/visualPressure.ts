/** Ambient visual pressure for the daily game — guess-button pulse. */

export function guessPulseClassForWrongGuesses(wrongGuesses: number): string | undefined {
  if (wrongGuesses <= 1) return undefined;
  if (wrongGuesses === 2) return "guess-pulse-slow";
  if (wrongGuesses === 3) return "guess-pulse-medium";
  return "guess-pulse-fast";
}
