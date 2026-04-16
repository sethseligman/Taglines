/** Big headline after a round (result modal + daily completion). */
export function narratorResultLine(status: "won" | "lost", guessesUsed: number): string {
  if (status === "lost") return "Maybe next time.";
  if (guessesUsed === 1) return "Flawless.";
  if (guessesUsed === 2) return "One hint. No shame.";
  if (guessesUsed === 3) return "You'll take it.";
  if (guessesUsed === 4) return "That one was a fight.";
  return "Survived.";
}
