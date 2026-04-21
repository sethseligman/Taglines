export const narratorLines = {
  one: [
    "Flawless.",
    "You didn't need the hints. The hints knew it.",
    "Some people are just built for this.",
    "First try. Don't let it go to your head. Let it go a little to your head.",
    "The tagline never stood a chance.",
    "Instant. Clinical. Impressive.",
    "You saw it and you knew. That's the whole game.",
    "The hints sat there unused like a backup plan you never needed.",
    "One look. Done. The rest of us are taking notes.",
    "Perfect is a strong word. Use it.",
  ],
  two: [
    "One hint. No shame in that.",
    "Sharp enough.",
    "You knew it. You just needed a moment.",
    "One clue and the rest was instinct.",
    "Nearly clean. Nearly counts.",
    "One hint to confirm what you already suspected.",
    "The second guess landed like you meant it all along.",
    "Quick enough to brag about. Honest enough not to.",
    "One nudge. That's all it took.",
    "You were close before you were right. Good enough.",
  ],
  three: [
    "You got there with something to spare.",
    "Right down the middle.",
    "The hints did their job. So did you.",
    "Not your fastest. Not your slowest. Perfectly human.",
    "Three and through.",
    "Took the scenic route but arrived on time.",
    "Solid without being showy. The film appreciates that.",
    "Three guesses is a respectable pace. Own it.",
    "You warmed up and then you got it. That counts.",
    "The middle path. Dignified.",
  ],
  four: [
    "That one asked something of you.",
    "Four guesses and a lot of quiet thinking.",
    "The movie made you work for it.",
    "Not pretty. Correct.",
    "You were never not going to get it.",
    "Four is fine. Four got the job done.",
    "The hints earned their keep today.",
    "You stayed in it. That's the whole move.",
    "A little turbulence. A clean landing.",
    "Most people fold earlier. You didn't.",
  ],
  five: [
    "Survived.",
    "Five guesses and the will to continue. Respect.",
    "The last hint did heavy lifting today.",
    "You held on. The movie respects that. Probably.",
    "That one was a fight and you won.",
    "Down to the wire and still standing.",
    "Five guesses means you never quit. That's something.",
    "The movie had you. You had the movie. You won.",
    "Came down to the last clue and you still got there.",
    "Not graceful. Effective. There's honor in that.",
  ],
  lost: [
    "It'll come to you. Probably at 2am.",
    "The movie got you today. Come back tomorrow.",
    "Even Ebert walked out of one once.",
    "Not every tagline gives itself up easily. This one didn't.",
    "Tomorrow's another chance. The films aren't going anywhere.",
    "The good ones fight back. This was a good one.",
    "You'll know it the second you see the answer. That's just how it works.",
    "Some days the film wins. Today was its day.",
    "No shame in losing to a great tagline.",
    "Come back tomorrow. The streak starts then.",
  ],
};

export function getNarratorLine(status: "won" | "lost", guessesUsed: number): string {
  const lines =
    status === "lost"
      ? narratorLines.lost
      : guessesUsed === 1
        ? narratorLines.one
        : guessesUsed === 2
          ? narratorLines.two
          : guessesUsed === 3
            ? narratorLines.three
            : guessesUsed === 4
              ? narratorLines.four
              : narratorLines.five;
  return lines[Math.floor(Math.random() * lines.length)] ?? "Survived.";
}
