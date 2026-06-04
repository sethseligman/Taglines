/**
 * Narrator lines for daily pool challenge results only.
 * Completion and one_off challenges use narratorResultLine from narratorResult.ts.
 * Failed tiers keyed by number of correct legs before failure (0–4).
 * Completed tiers keyed by total guesses used across all legs.
 */

export const challengeFailedLines: Record<number, string[]> = {
  0: [
    "Out on the first one. That's not a cold start, that's a no-start.",
    "Zero for five. The tagline was right there. We don't need to talk about this.",
    "Maybe today wasn't your day. Come back when you've seen something.",
    "The movie hasn't even started and you're already in the parking lot.",
    "No soup for you.",
    "You came, you saw, you guessed wrong. Mostly you guessed wrong.",
    "This is why we can't have nice things.",
    "The taglines were right there. Like, right there.",
    "I've seen better performances at a school play. A bad school play.",
    "Zero. The loneliest number since the number one.",
  ],
  1: [
    "Made it past the opening credits. That's something. Not much, but something.",
    "You had one. Then the wheels came off. Cinematically speaking, this was a short film.",
    "You almost got past the previews.",
    "There's no crying in taglines.",
    "One film. The narrator has seen longer bathroom breaks.",
    "One film. You peaked early and never looked back.",
    "You know what they say about one-hit wonders.",
    "The sequel was worse. Much worse.",
    "One correct. Four chances to fix it. Four chances wasted.",
    "Statistically this is below average. And statistics are generous.",
  ],
  2: [
    "Almost half a cinephile. Which is still more than most people at a dinner party.",
    "You had momentum. Then you didn't. That's cinema.",
    "For a second there I thought you actually watched movies.",
    "Getting two correct is better than most people. People who don't watch movies.",
    "Two films. The third one had other plans.",
    "Two films. You're not a cinephile, you're a tourist.",
    "Sorry, if this were school you would have been left back.",
    "You had the scent. Then you lost it. Then it was gone.",
    "Two correct answers and the confidence of someone with five.",
    "The films were willing. You were not able.",
  ],
  3: [
    "Three films and then the lights went out. You were so close the popcorn was still warm.",
    "Three correct. One bad guess from a clean finish. That one's going to linger.",
    "You had three. The fourth one disagreed.",
    "Three for five is an amazing batting average. In taglines it's a near miss.",
    "You had a lead. The fourth act got you. There's always a fourth act.",
    "Three films down, two to go, and then the plot twist nobody wanted.",
    "You were in the zone. The zone had other ideas.",
    "Three correct answers and one very wrong one. The one that counts.",
    "You had the lead going into the third act. Cinema has a word for that. Tragedy.",
    "Three films. Respectable. The fourth one was not impressed.",
  ],
  4: [
    "Four films. The fifth one had the audacity to beat you.",
    "You were one movie from a clean finish. The narrator finds this deeply satisfying.",
    "Four correct. One left. You had it and then you absolutely did not have it.",
    "So close the end credits were practically rolling. Then they weren't.",
    "Four for five. The last film wins. Today, anyway.",
    "Almost. The most devastating word in any language, including the one this film was shot in.",
    "You had four. The fifth one saw you coming.",
    "One film between you and glory. It was enough.",
    "The last one is always the hardest. Today it was impossible.",
    "Four films isn't failure. It's a cliffhanger. Without a sequel.",
  ],
};

export const challengeCompletedLines: Array<{ maxGuesses: number; lines: string[] }> = [
  {
    maxGuesses: 5,
    lines: [
      "Five films. Five first guesses. You weren't playing — you were performing.",
      "Perfect. One guess per film. I'm mildly furious.",
      "Clean sweep. First guess every time. We'll be watching you.",
      "Is this Roger Ebert playing from beyond?",
      "Film school is finally paying off. Assuming you went. If not, this is more impressive and more troubling.",
      "We don't need no stinking hints.",
      "First guess. Every time. Either you cheated or you're dangerous.",
      "A perfect score in a game designed to humble you. The narrator is taking notes.",
      "Five for five on the first try. We'll need to make this harder.",
      "You knew every single one. That's either impressive or suspicious. Probably both.",
    ],
  },
  {
    maxGuesses: 8,
    lines: [
      "All five films. A hint here and there but you were never really in trouble.",
      "Strong run. The kind that holds up on a second viewing.",
      "Five for five. A few detours but the destination was never in doubt.",
      "Excellent. Not perfect. Excellent is better — it leaves room for personality.",
      "You finished clean. The hints were decorative.",
      "A few hints but never in real trouble. That's the mark of a genuine film person.",
      "You made it look easy. It wasn't. That's the point.",
      "Minor detours. Major result. The GPS recalculated and you still arrived first.",
      "All five films with hints to spare. The narrator approves, reluctantly.",
      "Not perfect but close enough to be annoying about it.",
    ],
  },
  {
    maxGuesses: 12,
    lines: [
      "All five films. Some turbulence but a clean landing.",
      "You got there. It took a few extra guesses but the set is done.",
      "Solid. Not flashy. A reliable moviegoer if not a devoted one.",
      "Five films, some hints, no shame. This is a respectable result.",
      "You earned it. The hints helped. That's what they're there for.",
      "You needed the hints. The hints delivered. Everybody wins.",
      "A few rough patches but you never quit. That counts for something around here.",
      "You got all five. It took a village of hints, but you got all five.",
      "B plus. Maybe A minus if we're being generous. We're not being generous.",
      "Solid work. The kind that doesn't get celebrated but should.",
    ],
  },
  {
    maxGuesses: Infinity,
    lines: [
      "You made it through on fumes. The narrator respects the stubbornness.",
      "Every film eventually fell. Slowly, but they fell.",
      "Five films. Lots of hints. Zero quit. The narrator has complicated feelings.",
      "You finished. It wasn't pretty but the credits are rolling and your name is on them.",
      "Every guess counts. Even the wrong ones. Especially the wrong ones.",
      "You used every hint available and still you pushed through. Respect.",
      "Finished. Barely. The credits rolled and you were still in your seat.",
      "A win is a win. This one just took longer than most feature films.",
      "Maximum effort. Maximum hints. Maximum respect. Minimal grace.",
      "The hints weren't enough. More hints. Still not enough. And yet, here we are.",
    ],
  },
];

function pickRandom(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)] ?? lines[0];
}

export function challengeFailedNarratorLine(correctLegs: number): string {
  const key = Math.min(4, Math.max(0, correctLegs)) as 0 | 1 | 2 | 3 | 4;
  const pool = challengeFailedLines[key] ?? challengeFailedLines[0];
  return pickRandom(pool);
}

export function challengeCompletedNarratorLine(totalGuesses: number): string {
  const tier = challengeCompletedLines.find((t) => totalGuesses <= t.maxGuesses);
  const pool = tier?.lines ?? challengeCompletedLines[challengeCompletedLines.length - 1].lines;
  return pickRandom(pool);
}
