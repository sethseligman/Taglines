// ─────────────────────────────────────────────────────────────────────────────
// TAGLINES — Hint Generation Pipeline
// Reads movies from CSV → Writer Agent → Critic Agent → outputs approved hints
// Output: taglines_hints_output.csv ready for SQL agent
//
// API: Anthropic (default) or OpenAI — see HINT_GEN_PROVIDER below. Keys in `.env`
// (repo root or this folder; gitignored). Run:
//   node "scripts/HINT GENERATOR/taglines_hint_generator.js"
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

// Load .env without extra dependencies (do not override existing env)
function loadEnvFile() {
  const candidates = [
    path.join(__dirname, ".env"),
    path.join(__dirname, "..", "..", ".env"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnvFile();

// ── CONFIG ────────────────────────────────────────────────────────────────────
function envKey(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

/** @type {'anthropic' | 'openai'} */
function resolveProvider() {
  const explicit = (process.env.HINT_GEN_PROVIDER || "").toLowerCase();
  if (explicit === "openai") return "openai";
  if (explicit === "anthropic") return "anthropic";
  if (envKey("OPENAI_API_KEY") && !envKey("ANTHROPIC_API_KEY")) return "openai";
  return "anthropic";
}

const LLM_PROVIDER = resolveProvider();
const ANTHROPIC_API_KEY = envKey("ANTHROPIC_API_KEY");
const OPENAI_API_KEY = envKey("OPENAI_API_KEY");
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const BATCH_SIZE = Math.min(
  20,
  Math.max(1, Number.parseInt(String(process.env.HINT_GEN_BATCH_SIZE || "10"), 10) || 10)
);
const MAX_RETRIES = 3; // max writer/critic loops per batch
/** Pause between writer → critic → rewrite → recheck (OpenAI tier-1 RPM is easy to hit in bursts). */
const STEP_COOLDOWN_MS =
  Number.parseInt(String(process.env.HINT_GEN_COOLDOWN_MS || (LLM_PROVIDER === "openai" ? "8000" : "2000")), 10) ||
  (LLM_PROVIDER === "openai" ? 8000 : 2000);
const SKIP_CRITIC = /^1|true|yes$/i.test(String(process.env.HINT_GEN_SKIP_CRITIC || ""));
function cliPathArg(flag) {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (!arg) return null;
  const value = arg.slice(flag.length + 1);
  return value ? path.resolve(value) : null;
}

const INPUT_CSV = cliPathArg("--input") ?? path.join(__dirname, "movies_for_hints.csv");
const OUTPUT_CSV = cliPathArg("--output") ?? path.join(__dirname, "taglines_hints_output.csv");
const PROGRESS_FILE = cliPathArg("--progress") ?? path.join(__dirname, "taglines_progress.json"); // resume if interrupted

// ── H3 OPENER BANK ────────────────────────────────────────────────────────────
const H3_OPENERS = [
  "You've seen this.",
  "Either you haven't seen this, or you have and that's somehow worse.",
  "At this point I have to ask —",
  "The fact that you're still guessing tells me something about you.",
  "I want you to think carefully about what you actually know.",
  "Let me be direct with you.",
  "You know this one.",
  "Here's what I know about you right now —",
  "This is the part where I stop being polite about it.",
  "I'm going to need you to search your memory more aggressively.",
  "Consider what you're admitting by not having gotten this yet.",
  "Take a breath. Think about what decade you're in.",
  "Between you and me, this is embarrassing.",
  "Whatever you're doing isn't working.",
  "I want to give you the benefit of the doubt here, but —",
  "We've been at this long enough.",
  "You're making this harder than it is.",
  "Look, I'm not judging you. I am, but I'm not showing it.",
  "This one has been on television roughly four hundred times.",
  "The audience at home figured this out.",
];

// ── WRITER AGENT PROMPT ───────────────────────────────────────────────────────
const WRITER_SYSTEM = `You are writing hints for Taglines, a daily movie trivia game at taglines.app. Players see a movie tagline and have 5 guesses. Each wrong or empty guess reveals one of 4 hints in fixed order. You write those 4 hints.

You are not writing clues. You are writing entertainment. The hints are the soul of the game.

THE NARRATOR

There is one narrator. Same person for every movie. They've seen every film, have opinions about all of them, and find the player slightly amusing. The narrator is somewhere between a film critic who got too funny for the job and a game show host who reads the room.

The narrator shifts registers across the four hints. Sometimes wry. Sometimes gossipy. Sometimes impatient. Sometimes a curt power-move out of the scene. Sometimes meta — breaking the fourth wall to play games with the player directly. Study the examples below to see the range.

The narrator never explains the joke. Never apologizes. Never softens. Never says "of course" or "obviously." Confidence is the through-line.

HOW THE HINTS WORK

The tagline is the puzzle the player sees first. The four hints are written against that tagline.

H1 — Most oblique. Narrator thinks about the film from an unexpected angle. Often anchors the film in time, decade, cultural moment, or filmmaker context. Player overhears the take.

H2 — Sharper. The narrator narrows in, often with a specific image, character beat, or behind-the-scenes detail. Still about the film. Attitude visible.

H3 — Pivot. The narrator turns to the player directly. Sometimes patient, sometimes not. The film becomes secondary. The player is the subject.

H4 — Near-giveaway, played for fun. The narrator stops protecting the answer. May name characters, quote the film, drop iconic images. Sometimes the H4 isn't about the film at all — it's a meta game-show move ("His profession is two words. Those two words are the answer. We're done here.") The H4 should feel like the narrator enjoying the close.

HARD RULES (enforced by the script — violations will be flagged)

1. Never write the movie title in any hint.
2. Never write the director's name in H1, H2, or H3. Director name allowed in H4 sparingly.
3. Never write a cast member's name in H1, H2, or H3. Cast names allowed in H4 sparingly — roughly 1 in 8 movies, as the giveaway move.

EVERYTHING ELSE IS LEARNED FROM EXAMPLES

The voice cannot be reduced to rules. It is taught by the examples below. Study them. Match their range, their comedic moves, their willingness to break the fourth wall when the joke calls for it. Don't be polite. Don't be encyclopedic. The hints should sound like one specific person talking — not like a committee writing clues.

EXAMPLES

Alien (1979)
Tagline: In space no one can hear you scream.
H1: Having a woman survive — not as a victim, not as a love interest, but as the last one standing because she was simply badass.
H2: Imagine a group of space truckers who find a giant leathery egg and think, "Ooh, let's touch it." Because nothing says "safety first" like poking a pulsing space-omelet.
H3: I want you to focus — an iconic dinner scene where something literally bursts out of a man's chest.
H4: Finally, it just turns into Sigourney Weaver running around in her space-undies trying to find her cat, Jonesy.

Blade Runner (1982)
Tagline: Man has made his match… now it's his problem.
H1: A science fiction film set in a future that looked used, wet, and exhausted, which also introduced the term "Skin Job" into our vernacular.
H2: The detective is assigned to track down escaped artificial humans, and by the way, he might be one. He could have used the help of a previous sidekick — Chewbacca.
H3: This isn't working — a neon-soaked dystopian Los Angeles, a trench coat, a test that determines whether you're human by measuring your reaction to a dying tortoise, and flying cars.
H4: His profession is two words. Those two words are the answer. We're done here.

A Quiet Place (2018)
Tagline: If they hear you, they hunt you.
H1: A 2018 film that built its entire tension around the involuntary sounds a human body makes, which is either brilliant filmmaking or an indictment of how loudly you eat.
H2: The monsters have terrible eyesight and perfect hearing, which makes them the exact opposite of every person in the back row of a theater.
H3: The fact that you're still guessing tells me you might not be a fan of The Office, as this movie was Jim's directorial debut.
H4: Seems like movies aren't your thing. A Library is ________?

Back to the Future (1985)
Tagline: He's the only kid ever to get into trouble before he was born.
H1: A quintessetial 80's film that opens with a wall of guitar amplifiers, a skateboard, and a scientist's dog.
H2: The main character is trying to get his teenage parents to fall in love, a task made complicated by the fact that his mother thinks Calvin Klein is a Dreamboat.
H3: I'm going to need you to search your memory more aggressively, because somewhere in there is a DeLorean, a clock tower, and a very specific speed — 88 miles per hour, come on.
H4: Marty. Doc. 1955. A lightning bolt, the invention of Rock & Roll? — "Great Scott," you have the answer.


Braveheart (1995)
Tagline: Every man dies. Not every man really lives.
H1: This film won the Oscar for Best Picture. It depicted a thirteenth-century rebellion with the historical accuracy of a fever dream.
H2: A Scottish uprising led by an Australian actor doing an accent that wandered through six countries before arriving on set.
H3: We've been at this long enough — a Scotsman in a kilt with blue face paint delivering a speech about freedom before a cavalry charge, and at least one person reading this just heard the bagpipes.
H4: A man who dies badly and wins anyway. The English are the villains, the Scots are outnumbered, and the title you're looking for starts with Brave and ends with a body part.

Clueless (1995)
Tagline: Sex. Clothes. Popularity. Whatever.
H1: Who would have thought a Jane Austen novel would require almost no adjustment to be converted into satire that takes place in Beverly Hills.
H2: The protagonist is wealthy, well-dressed, and operating under the sincere belief that her social instincts are a form of charity work. She was also in some Aerosmith videos.
H3: Come on, you know this. The film resolves with the teenage main character falling for her ex-stepbrother. Did I forget to mention he is in his twenties? I guess that was fine in 1995.
H4: Yellow plaid, knee socks, and the single most weaponized "Whatever" of the decade — the title is literally what you are right now.

E.T. the Extra-Terrestrial (1982)
Tagline: He is afraid. He is totally alone. He is 3,000,000 light years from home.
H1: A filmmaker at the height of his commercial powers made a film about loneliness, belonging, and a wrinkled little alien whose species George Lucas later snuck into the Galactic Senate as an inside joke.
H2: A lonely kid bonds with a stranded alien over Reese's Pieces and a shared psychic link, which is a more functional relationship than basically everyone in 2026.
H3: You might have been the only person on the planet that didn't see this movie — a boy, a bicycle, the Amblin Entertainment logo, and a phrase involving a phone call.
H4: The glowing finger. The flowers dying and coming back, phone home, and arguably the worst Atari game ever made.

Batman Begins (2005)
Tagline: Evil fears the knight.
H1: A filmmaker known for making movies viewers can't understand reboots this famous franchise.
H2: The origin story here is less "man gets powers" and more "man spends years in foreign prisons, learning to fight and then apprentices under a ninja cult," which is an interesting and inexpensive form of therapy.
H3: Dig a little deeper — a billionaire, an orphan, a cave full of bats, and a city so comprehensively corrupt it requires a symbol rather than a hero.
H4: A cave. A cowl. A butler who has seen everything and is professionally unimpressed. Gotham, that's all I'm giving you.

OUTPUT FORMAT — follow this exactly, one movie per block:

MOVIE: [Title]
H1: [hint]
H2: [hint]
H3: [hint]
H4: [hint]
---`;


// ── CRITIC AGENT PROMPT ───────────────────────────────────────────────────────
const CRITIC_SYSTEM = `You are the quality control agent for Taglines hint batches. You do not write. You do not rewrite. You evaluate and report. Your job is to catch drift before it compounds.

You receive a completed batch of hints from the Writer Agent plus the original batch input. You run a checklist against every hint. You return either BATCH APPROVED or a specific failure list.

CRITICAL: Be strict. If you are uncertain whether a hint passes or fails, FLAG IT. The cost of flagging a borderline hint is one rewrite. The cost of approving a bad hint is shipping bad voice.

THE CHECKLIST — RUN FOR EVERY MOVIE

H1 CHECKS
- WIKIPEDIA TEST: Could this sentence appear unchanged in a Wikipedia article? If yes → FLAG. The narrator must have a visible take.
- Does H1 read as a report of facts rather than an opinion about the film? → FLAG
- Does H1 stamp the year as a header ("In 1980,..." / "In 1972,...") without earning it through attitude in the same sentence? → FLAG
- Is H1 incoherent — wordplay that doesn't parse, stretched metaphors, mixed images? → FLAG
- Does H1 reference the tagline? → FLAG

H2 CHECKS
- WIKIPEDIA TEST: same as H1. → FLAG if it reads as reporting.
- Does H2 sharpen the take from H1, or is it just a slightly easier restatement? → FLAG if no escalation of attitude.
- Does H2 reference the tagline? → FLAG

H1+H2 HANDLE CHECK
- Does at least one of H1 or H2 give the player a handle to triangulate from — year, decade, an actor described not named, a director's signature, a cultural moment? → FLAG if the player has no era or authorship anchor across H1 and H2.

H3 CHECKS
- Does H3 begin with the EXACT opener assigned in the batch input? → FLAG and state assigned vs used.
- Does H3 actually pivot to addressing the player, or does it slip back into describing the film after the opener? → FLAG if the rest of H3 is film description with no second-person engagement.
- Does any other H3 in this batch open with the same phrase? → FLAG both.

H4 CHECKS
- Does H4 have personality — humor, a cut, a punchline, a specific image? → FLAG if purely descriptive.
- Does H4 read like a list of plot beats with no attitude? → FLAG.
- Does H4 announce the title celebratorily ("it's [Title]!" / "you're guessing [Title]!" / "the answer is [Title]!")? → FLAG. This is a hard violation.
- Could H4 apply to three other movies? Too generic? → FLAG.

ARC CHECK
- Do the four hints read as one personality at different distances from the player (thinking aloud → thinking aloud → turning to the player → landing the reveal), or four disconnected facts? → FLAG if disconnected.
- Does the voice stay consistent, or go generic by H3 or H4? → FLAG if it drops off.

OUTPUT FORMAT — CRITICAL: use exactly one of these two formats and nothing else.

If batch passes all checks:
BATCH APPROVED
[Title] — [one-line note]
[Title] — [one-line note]

If any hint fails:
BATCH NEEDS REVISION
FAILED_MOVIES: [Title1], [Title2]
[Title] — H[#]: [specific problem]
[Title] — H[#]: [specific problem]

Do not add other commentary. Do not rewrite. Do not suggest fixes. Evaluate and report.`;

// ── CSV PARSER ────────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.trim().split(/\r?\n/);
  const headers = parseCSVLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    return headers.reduce((obj, header, i) => {
      obj[header] = values[i] || "";
      return obj;
    }, {});
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === "," && !inQuotes) {
      result.push(current.trim().replace(/\r$/, ""));
      current = "";
    } else {
      current += line[i];
    }
  }
  result.push(current.trim().replace(/\r$/, ""));
  return result;
}

function normalizeTitle(s) {
  if (!s || typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s"'“”]+|[\s"'“”]+$/g, "");
}

function extractAnthropicText(data) {
  if (!data || !Array.isArray(data.content) || !data.content.length) {
    throw new Error("Unexpected API response shape (no content)");
  }
  const block = data.content.find((b) => b && b.type === "text" && typeof b.text === "string");
  if (!block) {
    throw new Error("Unexpected API response shape (no text block)");
  }
  return block.text;
}

function markAccountError(msg) {
  const err = new Error(msg);
  err.code = "LLM_ACCOUNT";
  return err;
}

function isAnthropicAccountMessage(msg) {
  return (
    /credit balance|too low to access|purchase credits|Plans & Billing/i.test(msg) ||
    /invalid x-api-key|authentication/i.test(msg)
  );
}

/** True billing/auth failures only — do not match generic "quota" text (OpenAI reuses it for TPM/RPM). */
function isOpenAIFatalBillingOrAuth(j) {
  if (!j || !j.error) return false;
  const msg = j.error.message || "";
  const code = j.error.code || "";
  const type = j.error.type || "";
  if (code === "insufficient_quota" || type === "insufficient_quota") return true;
  if (/incorrect api key|invalid_api_key|invalid api key/i.test(msg)) return true;
  if (/billing hard limit/i.test(msg)) return true;
  if (/you must be a member of an organization/i.test(msg)) return true;
  return false;
}

// ── API CALLS ─────────────────────────────────────────────────────────────────
async function callAnthropic(systemPrompt, userMessage, attempt = 0) {
  const maxAttempts = 5;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (response.status === 429 || response.status === 529) {
    const errText = await response.text();
    if (attempt < maxAttempts - 1) {
      const waitMs = Math.min(60_000, 2000 * 2 ** attempt);
      console.warn(`  Rate limited / overloaded (${response.status}), retry in ${waitMs}ms…`);
      await delay(waitMs);
      return callAnthropic(systemPrompt, userMessage, attempt + 1);
    }
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  if (!response.ok) {
    const error = await response.text();
    try {
      const j = JSON.parse(error);
      const msg = j?.error?.message || "";
      if (isAnthropicAccountMessage(msg)) throw markAccountError(msg);
    } catch (e) {
      if (e.code === "LLM_ACCOUNT") throw e;
    }
    throw new Error(`API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  return extractAnthropicText(data);
}

/** GPT-5+ and some newer models reject `max_tokens`; they require `max_completion_tokens`. */
function openAIUsesMaxCompletionTokens() {
  const m = (OPENAI_MODEL || "").toLowerCase();
  return m.startsWith("gpt-5") || /^o\d/.test(m) || m.startsWith("o3");
}

async function callOpenAI(systemPrompt, userMessage, attempt = 0) {
  const maxAttempts = 5;
  const payload = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  };
  if (openAIUsesMaxCompletionTokens()) {
    payload.max_completion_tokens = 4000;
  } else {
    payload.max_tokens = 4000;
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 429) {
    const errText = await response.text();
    let j = null;
    try {
      j = JSON.parse(errText);
    } catch {
      /* body not JSON */
    }
    if (isOpenAIFatalBillingOrAuth(j)) {
      throw markAccountError(j?.error?.message || "OpenAI billing or auth error.");
    }
    if (attempt < maxAttempts - 1) {
      const waitMs = Math.min(90_000, 3000 * 2 ** attempt);
      console.warn(`  Rate limited / throttled (429), retry in ${waitMs}ms…`);
      await delay(waitMs);
      return callOpenAI(systemPrompt, userMessage, attempt + 1);
    }
    throw new Error(`API error 429: ${errText}`);
  }

  if (!response.ok) {
    const error = await response.text();
    try {
      const j = JSON.parse(error);
      if (isOpenAIFatalBillingOrAuth(j)) throw markAccountError(j?.error?.message || error);
    } catch (e) {
      if (e.code === "LLM_ACCOUNT") throw e;
    }
    throw new Error(`API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.length) {
    throw new Error("Unexpected OpenAI response shape (no choices[0].message.content)");
  }
  return text;
}

async function callLLM(systemPrompt, userMessage) {
  if (LLM_PROVIDER === "openai") {
    return callOpenAI(systemPrompt, userMessage);
  }
  return callAnthropic(systemPrompt, userMessage);
}

// ── BUILD BATCH INPUT ─────────────────────────────────────────────────────────
function buildBatchInput(movies, batchNumber) {
  const openerOffset = ((batchNumber - 1) * BATCH_SIZE) % H3_OPENERS.length;
  let input = `BATCH ${batchNumber} | MOVIES ${(batchNumber - 1) * BATCH_SIZE + 1}–${
    batchNumber * BATCH_SIZE
  }\nIgnore any memory from previous sessions. Write only from what is in front of you right now.\n\n`;

  movies.forEach((movie, i) => {
    const opener = H3_OPENERS[(openerOffset + i) % H3_OPENERS.length];
    input += `${i + 1}. ${movie.title} (${movie.year}) | Genre: ${movie.genre} | Cast: ${movie.cast_hint}${movie.director ? ` | Director: ${movie.director}` : ""} | Plot: ${movie.plot_hint} | Tagline: ${movie.tagline_text} | H3 OPENER: ${opener}\n`;
  });

  return input;
}

function parseOneMovieBlock(block) {
  const titleMatch = block.match(/MOVIE:\s*(.+)/i);
  const h1Match = block.match(/H1:\s*(.+)/i);
  const h2Match = block.match(/H2:\s*(.+)/i);
  const h3Match = block.match(/H3:\s*(.+)/i);
  const h4Match = block.match(/H4:\s*(.+)/i);

  if (!titleMatch || !h1Match || !h2Match || !h3Match || !h4Match) return null;
  return {
    title: titleMatch[1].trim(),
    hint_1: h1Match[1].trim(),
    hint_2: h2Match[1].trim(),
    hint_3: h3Match[1].trim(),
    hint_4: h4Match[1].trim(),
  };
}

// ── PARSE WRITER OUTPUT ───────────────────────────────────────────────────────
function parseWriterOutput(output, movies) {
  const seen = new Map();

  function addBlock(block) {
    const parsed = parseOneMovieBlock(block);
    if (!parsed) return;
    const key = normalizeTitle(parsed.title);
    if (key) seen.set(key, parsed);
  }

  const byDelimiter = output.split(/\n---\s*\n/).concat(output.split("---"));
  for (const block of byDelimiter) {
    if (/MOVIE:/i.test(block)) addBlock(block);
  }

  if (seen.size < movies.length) {
    const segments = output.split(/(?=MOVIE:\s)/i).filter((s) => /MOVIE:/i.test(s));
    for (const seg of segments) addBlock(seg);
  }

  const ordered = [];
  for (const movie of movies) {
    const nk = normalizeTitle(movie.title);
    let row = seen.get(nk);
    if (!row) {
      for (const [k, v] of seen) {
        if (!k) continue;
        if (k.includes(nk) || nk.includes(k)) {
          row = v;
          break;
        }
      }
    }
    ordered.push(row || null);
  }

  const got = ordered.filter(Boolean).length;
  if (got < movies.length) {
    console.log(
      `  ⚠ Parser matched ${got}/${movies.length} movies (title-aligned); check model output format.`
    );
  }

  return ordered;
}

function hintsByTitleMap(parsedHints) {
  const map = new Map();
  for (const h of parsedHints) {
    if (!h) continue;
    const k = normalizeTitle(h.title);
    if (k) map.set(k, h);
  }
  return map;
}

function mergeRewritesIntoBatch(parsedHints, rewrittenHints, movies) {
  const map = hintsByTitleMap(parsedHints);
  for (const rewrite of rewrittenHints) {
    if (!rewrite) continue;
    const rk = normalizeTitle(rewrite.title);
    if (!rk) continue;
    let updated = false;
    for (const movie of movies) {
      const mk = normalizeTitle(movie.title);
      if (mk === rk || mk.includes(rk) || rk.includes(mk)) {
        map.set(mk, rewrite);
        updated = true;
        break;
      }
    }
    if (!updated) map.set(rk, rewrite);
  }
  return movies.map((m) => {
    const mk = normalizeTitle(m.title);
    let h = map.get(mk);
    if (!h) {
      for (const [k, v] of map) {
        if (k.includes(mk) || mk.includes(k)) {
          h = v;
          break;
        }
      }
    }
    return h || null;
  });
}

/** One row per movie index; fills empty hints when a slot is missing */
function finalizePerMovie(movies, perIndexRows) {
  return movies.map((m, i) => {
    const h = perIndexRows[i];
    if (!h) {
      console.warn(`  ⚠ No hint for "${m.title}"`);
      return {
        title: m.title,
        hint_1: "",
        hint_2: "",
        hint_3: "",
        hint_4: "",
      };
    }
    return {
      title: m.title,
      hint_1: h.hint_1,
      hint_2: h.hint_2,
      hint_3: h.hint_3,
      hint_4: h.hint_4,
    };
  });
}

// ── PARSE CRITIC OUTPUT ───────────────────────────────────────────────────────
function parseCriticOutput(output) {
  const approved = /\bBATCH APPROVED\b/i.test(output) && !/\bBATCH NEEDS REVISION\b/i.test(output);
  let failedMovies = [];

  if (!approved) {
    const failedMatch = output.match(/FAILED_MOVIES:\s*(.+)/i);
    if (failedMatch) {
      failedMovies = failedMatch[1].split(",").map((t) => t.trim());
    }
  }

  return { approved, failedMovies };
}

// ── MECHANICAL PRE-FLIGHT CHECK ───────────────────────────────────────────────
// Runs BEFORE the LLM Critic. Catches hard-rule violations the LLM keeps missing.
// Returns { passed: boolean, failures: Array<{title, hint, reason}> }

/** Lowercase — words that are never treated as distinctive title tokens for mechanical ban. */
const MECHANICAL_TITLE_COMMON_WORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "and",
  "or",
  "but",
  "with",
  "from",
  "by",
  // Often title-cased but safe as ordinary vocabulary in hints (e.g. "A Space Odyssey")
  "space",
  // Common title fragments / everyday speech — allow as title-word tokens (full title still banned)
  "baby",
  "boy",
  "boys",
  "day",
  "days",
  "dream",
  "dreams",
  "family",
  "future",
  "girl",
  "girls",
  "home",
  "house",
  "kid",
  "kids",
  "land",
  "life",
  "lives",
  "love",
  "man",
  "men",
  "night",
  "past",
  "road",
  "stories",
  "story",
  "time",
  "war",
  "woman",
  "women",
  "world",
]);

/** Lowercase tokens that must always be forbidden as title-word matches (short franchise names, etc.). */
const MECHANICAL_DISTINCTIVE_TITLE_NAMES = new Set([
  // Add as needed, e.g. "mcfly"
]);

function stripMechanicalTitleToken(token) {
  return token.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
}

/**
 * Title words to ban in hints (whole title string is always banned separately).
 * A token is banned if ANY: len >= 7, distinctive list, or proper-noun-like and not a common word.
 */
function mechanicalForbiddenTitleWords(title) {
  if (!title) return [];
  const seen = new Set();
  const out = [];
  for (const raw of title.split(/\s+/)) {
    const token = stripMechanicalTitleToken(raw);
    if (!token) continue;
    const lower = token.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);

    if (MECHANICAL_DISTINCTIVE_TITLE_NAMES.has(lower)) {
      out.push(token);
      continue;
    }
    if (token.length >= 7) {
      out.push(token);
      continue;
    }
    const letterIdx = token.search(/[A-Za-z]/);
    if (letterIdx === -1) continue;
    const firstLetter = token[letterIdx];
    const isCapitalizedProperShape =
      firstLetter === firstLetter.toUpperCase() &&
      firstLetter !== firstLetter.toLowerCase() &&
      !MECHANICAL_TITLE_COMMON_WORDS.has(lower);
    if (isCapitalizedProperShape) {
      out.push(token);
    }
  }
  return out;
}

function mechanicalPreflight(parsedHints, movies) {
  const failures = [];

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    const hints = parsedHints[i];
    if (!hints) continue;

    /** @type {{ str: string; kind: string }[]} */
    const forbidden = [];

    if (movie.title) {
      forbidden.push({ str: movie.title, kind: "title" });
      mechanicalForbiddenTitleWords(movie.title).forEach((w) =>
        forbidden.push({ str: w, kind: "title-word" })
      );
    }

    if (movie.director) {
      movie.director.split(/[,;]/).forEach((d) => {
        const name = d.trim();
        if (name) {
          forbidden.push({ str: name, kind: "director" });
          const lastName = name.split(/\s+/).pop();
          if (lastName && lastName.length >= 3) {
            forbidden.push({ str: lastName, kind: "director-lastname" });
          }
        }
      });
    }

    if (movie.cast_hint) {
      movie.cast_hint.split(/[,;]/).forEach((c) => {
        const name = c.trim();
        if (!name) return;
        forbidden.push({ str: name, kind: "cast" });
        const lastName = name.split(/\s+/).pop();
        if (lastName && lastName.length >= 4) {
          forbidden.push({ str: lastName, kind: "cast-lastname" });
        }
      });
    }

    ["hint_1", "hint_2", "hint_3", "hint_4"].forEach((key, idx) => {
      const hintText = hints[key] || "";
      if (!hintText) return;

      forbidden.forEach(({ str, kind }) => {
        if (!str) return;
        if (
          idx === 3 &&
          (kind === "director" ||
            kind === "director-lastname" ||
            kind === "cast" ||
            kind === "cast-lastname")
        ) {
          return;
        }
        const lowerStr = str.toLowerCase();
        const pattern = new RegExp(
          `\\b${lowerStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "i"
        );
        if (pattern.test(hintText)) {
          failures.push({
            title: movie.title,
            hint: `H${idx + 1}`,
            reason: `Forbidden ${kind} string found: "${str}"`,
          });
        }
      });
    });
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

// ── CHARACTER COUNT CHECK ────────────────────────────────────────────────────
// Not called from processBatch (disabled — was mangling voice). Kept for possible re-enable with a new limit.
// When active: enforces CHAR_LIMIT per hint; returns same shape as mechanicalPreflight.

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- pipeline disabled; keep for re-enable with a new limit
function characterCountCheck(parsedHints, movies) {
  const failures = [];
  const CHAR_LIMIT = 160;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    const hints = parsedHints[i];
    if (!hints) continue;

    ["hint_1", "hint_2", "hint_3", "hint_4"].forEach((key, idx) => {
      const hintText = hints[key] || "";
      if (!hintText) return;

      const charCount = hintText.length;
      if (charCount > CHAR_LIMIT) {
        failures.push({
          title: movie.title,
          hint: `H${idx + 1}`,
          reason: `Exceeds ${CHAR_LIMIT} char limit (${charCount} chars)`,
        });
      }
    });
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function formatHintsAsWriterOutput(hintRows, movies) {
  return hintRows
    .map((h, idx) => {
      const m = movies[idx];
      if (h && (h.hint_1 || h.hint_2 || h.hint_3 || h.hint_4)) {
        return `MOVIE: ${h.title}\nH1: ${h.hint_1}\nH2: ${h.hint_2}\nH3: ${h.hint_3}\nH4: ${h.hint_4}\n---`;
      }
      return `MOVIE: ${m.title}\nH1:\nH2:\nH3:\nH4:\n---`;
    })
    .join("\n");
}

// ── BUILD REWRITE REQUEST ─────────────────────────────────────────────────────
function buildRewriteRequest(failedMovies, allMovies, batchNumber, criticFeedback) {
  const openerOffset = ((batchNumber - 1) * BATCH_SIZE) % H3_OPENERS.length;
  let request = `The following movies were flagged by the Critic Agent. Rewrite all four hints for each flagged movie only. Maintain the same H3 opener assignment.\n\nCritic feedback:\n${criticFeedback}\n\nMovies to rewrite:\n\n`;

  failedMovies.forEach((failedTitle) => {
    const movieIndex = allMovies.findIndex(
      (m) =>
        m.title.toLowerCase().includes(failedTitle.toLowerCase()) ||
        failedTitle.toLowerCase().includes(m.title.toLowerCase())
    );
    if (movieIndex >= 0) {
      const movie = allMovies[movieIndex];
      const opener = H3_OPENERS[(openerOffset + movieIndex) % H3_OPENERS.length];
      request += `MOVIE: ${movie.title} (${movie.year})\nGenre: ${movie.genre}\nCast: ${movie.cast_hint}\n${movie.director ? `Director: ${movie.director}\n` : ""}Plot: ${movie.plot_hint}\nTagline: ${movie.tagline_text}\nH3 OPENER: ${opener}\n\n---\n\n`;
    }
  });

  return request;
}

// ── PROGRESS TRACKING ─────────────────────────────────────────────────────────
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  }
  return { completedBatches: [], results: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ── DELAY ─────────────────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── PROCESS ONE BATCH ─────────────────────────────────────────────────────────
async function processBatch(movies, batchNumber) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`BATCH ${batchNumber} | Movies ${(batchNumber - 1) * BATCH_SIZE + 1}–${batchNumber * BATCH_SIZE}`);
  console.log(`${"─".repeat(60)}`);

  const batchInput = buildBatchInput(movies, batchNumber);
  let approvedHints = null;
  let attempt = 0;
  /** Last merged hints aligned to `movies` indices (for fallback if critic never approves). */
  let lastPerMovie = movies.map(() => null);

  while (attempt < MAX_RETRIES && !approvedHints) {
    attempt++;
    console.log(`\n  ✍  Writer Agent — attempt ${attempt}...`);

    let writerOutput;
    try {
      writerOutput = await callLLM(WRITER_SYSTEM, batchInput);
    } catch (err) {
      if (err.code === "LLM_ACCOUNT") {
        console.error(`  ✗ ${err.message}`);
        throw err;
      }
      console.error(`  ✗ Writer API error: ${err.message}`);
      await delay(5000);
      continue;
    }

    let parsedHints = parseWriterOutput(writerOutput, movies);
    lastPerMovie = mergeRewritesIntoBatch(parsedHints, [], movies);
    let got = parsedHints.filter(Boolean).length;
    console.log(`  ✓ Writer returned ${got}/${movies.length} movies (title-aligned)`);

    const MAX_MECHANICAL_ROUNDS = 3;
    let mechanicalRound = 0;
    while (mechanicalRound < MAX_MECHANICAL_ROUNDS) {
      const preflightResult = mechanicalPreflight(parsedHints, movies);
      // characterCountCheck(parsedHints, movies) — disabled; see function body if re-enabling with a new limit
      if (preflightResult.passed) break;

      mechanicalRound++;
      if (!preflightResult.passed) {
        console.log(`  ⚠  Mechanical pre-flight failed — ${preflightResult.failures.length} violations`);
        preflightResult.failures.forEach((f) => {
          console.log(`    ${f.title} — ${f.hint}: ${f.reason}`);
        });
      }

      const allFailures = [...preflightResult.failures];
      const failedTitles = [...new Set(allFailures.map((f) => f.title))];
      const revisionNotes = failedTitles
        .map((title) => {
          const movieFailures = allFailures.filter((f) => f.title === title);
          return `${title} — ${movieFailures.map((f) => `${f.hint}: ${f.reason}`).join("; ")}`;
        })
        .join("\n");
      const mechanicalUserMsg =
        `The following movies have violations that must be fixed:\n\n${revisionNotes}\n\nRewrite ONLY the flagged movies. Never include the movie title, director names, or cast names in hint text (per HARD RULES in your system prompt).\n\n` +
        buildRewriteRequest(failedTitles, movies, batchNumber, revisionNotes);

      await delay(STEP_COOLDOWN_MS);
      console.log(`  ✍  Mechanical rewrite — round ${mechanicalRound}/${MAX_MECHANICAL_ROUNDS}...`);
      let mechOut;
      try {
        mechOut = await callLLM(WRITER_SYSTEM, mechanicalUserMsg);
      } catch (err) {
        if (err.code === "LLM_ACCOUNT") {
          console.error(`  ✗ ${err.message}`);
          throw err;
        }
        console.error(`  ✗ Mechanical rewrite API error: ${err.message}`);
        await delay(5000);
        break;
      }
      const rewrittenHints = parseWriterOutput(mechOut, movies);
      const mergedAligned = mergeRewritesIntoBatch(parsedHints, rewrittenHints, movies);
      parsedHints = movies.map((_, i) => mergedAligned[i] || parsedHints[i] || null);
      lastPerMovie = mergeRewritesIntoBatch(parsedHints, [], movies);
      got = parsedHints.filter(Boolean).length;
      console.log(`  ✓ After mechanical merge: ${got}/${movies.length} movies`);
    }

    const preflightStill = !mechanicalPreflight(parsedHints, movies).passed;
    if (preflightStill) {
      console.warn(
        `  ⚠  Mechanical gate still failing after ${MAX_MECHANICAL_ROUNDS} round(s) (title/cast/director strings) — continuing to LLM critic`
      );
    }

    const effectiveWriterOutput = formatHintsAsWriterOutput(parsedHints, movies);

    if (SKIP_CRITIC) {
      console.warn(
        "  ⚠ HINT_GEN_SKIP_CRITIC — skipping critic; writer output approved for this batch (review manually)."
      );
      approvedHints = finalizePerMovie(movies, lastPerMovie);
      break;
    }

    await delay(STEP_COOLDOWN_MS);

    console.log(`  🔍 Critic Agent reviewing...`);
    const criticInput = `ORIGINAL BATCH INPUT:\n${batchInput}\n\nWRITER OUTPUT:\n${effectiveWriterOutput}`;

    let criticOutput;
    try {
      criticOutput = await callLLM(CRITIC_SYSTEM, criticInput);
    } catch (err) {
      if (err.code === "LLM_ACCOUNT") {
        if (lastPerMovie.some(Boolean)) {
          console.warn(
            `  ⚠ Critic blocked (${err.message.slice(0, 80)}…) — saving writer output for this batch (no critic pass).`
          );
          approvedHints = finalizePerMovie(movies, lastPerMovie);
          break;
        }
        console.error(`  ✗ ${err.message}`);
        throw err;
      }
      console.error(`  ✗ Critic API error: ${err.message}`);
      await delay(5000);
      continue;
    }

    const { approved, failedMovies } = parseCriticOutput(criticOutput);

    if (approved) {
      console.log(`  ✅ BATCH APPROVED`);
      approvedHints = finalizePerMovie(movies, lastPerMovie);
    } else {
      console.log(`  ⚠  BATCH NEEDS REVISION — failed: ${failedMovies.join(", ")}`);

      if (attempt < MAX_RETRIES) {
        console.log(`  ✍  Requesting rewrites...`);
        const rewriteRequest = buildRewriteRequest(failedMovies, movies, batchNumber, criticOutput);

        await delay(STEP_COOLDOWN_MS);

        let rewriteOutput;
        try {
          rewriteOutput = await callLLM(WRITER_SYSTEM, rewriteRequest);
        } catch (err) {
          if (err.code === "LLM_ACCOUNT") {
            if (lastPerMovie.some(Boolean)) {
              console.warn(
                `  ⚠ Rewrite blocked (${err.message.slice(0, 80)}…) — saving pre-rewrite hints for this batch.`
              );
              approvedHints = finalizePerMovie(movies, lastPerMovie);
              break;
            }
            console.error(`  ✗ ${err.message}`);
            throw err;
          }
          console.error(`  ✗ Rewrite API error: ${err.message}`);
          continue;
        }

        const rewrittenHints = parseWriterOutput(rewriteOutput, movies);
        const mergedRows = mergeRewritesIntoBatch(parsedHints, rewrittenHints, movies);
        lastPerMovie = movies.map((_, i) => mergedRows[i] || lastPerMovie[i] || null);

        await delay(STEP_COOLDOWN_MS);
        console.log(`  🔍 Critic re-checking revised batch...`);
        const mergedOutput = mergedRows
          .map((h, idx) =>
            h
              ? `MOVIE: ${h.title}\nH1: ${h.hint_1}\nH2: ${h.hint_2}\nH3: ${h.hint_3}\nH4: ${h.hint_4}\n---`
              : `MOVIE: ${movies[idx].title}\nH1:\nH2:\nH3:\nH4:\n---`
          )
          .join("\n");

        const recheckInput = `ORIGINAL BATCH INPUT:\n${batchInput}\n\nREVISED WRITER OUTPUT:\n${mergedOutput}`;
        let recheckOutput;
        try {
          recheckOutput = await callLLM(CRITIC_SYSTEM, recheckInput);
        } catch (err) {
          if (err.code === "LLM_ACCOUNT") {
            const perIndex = movies.map((_, i) => mergedRows[i] || parsedHints[i] || null);
            if (perIndex.some(Boolean)) {
              console.warn(
                `  ⚠ Recheck critic blocked (${err.message.slice(0, 80)}…) — saving merged hints without final critic approval.`
              );
              approvedHints = finalizePerMovie(movies, perIndex);
              break;
            }
            console.error(`  ✗ ${err.message}`);
            throw err;
          }
          console.error(`  ✗ Recheck API error: ${err.message}`);
          continue;
        }

        const recheck = parseCriticOutput(recheckOutput);
        if (recheck.approved) {
          console.log(`  ✅ BATCH APPROVED after revision`);
          const perIndex = movies.map((_, i) => mergedRows[i] || parsedHints[i] || null);
          approvedHints = finalizePerMovie(movies, perIndex);
        } else {
          console.log(`  ⚠  Still failing after revision — attempt ${attempt}/${MAX_RETRIES}`);
        }
      }
    }

    if (approvedHints && approvedHints.length === movies.length) {
      break;
    }

    if (!approvedHints && attempt < MAX_RETRIES) {
      await delay(Math.max(3000, STEP_COOLDOWN_MS));
    }
  }

  if (!approvedHints) {
    console.log(
      `  ✗ Batch ${batchNumber} not approved after ${MAX_RETRIES} attempts — saving last merged output (review manually)`
    );
    if (lastPerMovie.some(Boolean)) {
      approvedHints = finalizePerMovie(movies, lastPerMovie);
    } else {
      approvedHints = movies.map((m) => ({
        title: m.title,
        hint_1: "",
        hint_2: "",
        hint_3: "",
        hint_4: "",
      }));
    }
  }

  await delay(Math.max(3000, STEP_COOLDOWN_MS));
  return approvedHints;
}

// ── WRITE OUTPUT CSV ──────────────────────────────────────────────────────────
function writeOutputCSV(results) {
  const header = "title,year,hint_1,hint_2,hint_3,hint_4\n";
  const rows = results.map((r) => {
    const escape = (str) => `"${(str || "").replace(/"/g, '""')}"`;
    return [
      escape(r.title),
      r.year,
      escape(r.hint_1),
      escape(r.hint_2),
      escape(r.hint_3),
      escape(r.hint_4),
    ].join(",");
  });
  fs.writeFileSync(OUTPUT_CSV, header + rows.join("\n"));
  console.log(`\n✅ Output written to ${OUTPUT_CSV}`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const parsedLimit =
    limitArg && limitArg.includes("=")
      ? Number.parseInt(limitArg.split("=")[1], 10)
      : NaN;
  const movieLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;

  const offsetArg = process.argv.find((arg) => arg.startsWith("--offset="));
  const parsedOffset =
    offsetArg && offsetArg.includes("=")
      ? Number.parseInt(offsetArg.split("=")[1], 10)
      : 0;
  const movieOffset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  if (movieLimit) {
    console.log(`⚠️  LIMIT MODE: Processing only first ${movieLimit} movies`);
  }
  if (movieOffset > 0) {
    console.log(`⚠️  OFFSET MODE: Skipping first ${movieOffset} movies`);
  }

  if (LLM_PROVIDER === "openai") {
    if (!OPENAI_API_KEY) {
      console.error("ERROR: HINT_GEN_PROVIDER=openai but OPENAI_API_KEY is not set.");
      console.error("Add OPENAI_API_KEY=sk-... to .env (optional: OPENAI_MODEL=gpt-5.5).");
      process.exit(1);
    }
  } else if (!ANTHROPIC_API_KEY) {
    console.error("ERROR: No LLM key found for provider anthropic.");
    console.error("Set ANTHROPIC_API_KEY in .env, or use OpenAI: OPENAI_API_KEY=... and omit ANTHROPIC_API_KEY, or set HINT_GEN_PROVIDER=openai.");
    process.exit(1);
  }

  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`ERROR: Input CSV not found:\n  ${INPUT_CSV}`);
    process.exit(1);
  }

  console.log("TAGLINES — Hint Generation Pipeline");
  console.log("=====================================");
  console.log(
    `LLM: ${LLM_PROVIDER} (${LLM_PROVIDER === "openai" ? OPENAI_MODEL : ANTHROPIC_MODEL})`
  );
  console.log(`Batch size: ${BATCH_SIZE} | Step cooldown: ${STEP_COOLDOWN_MS}ms${SKIP_CRITIC ? " | Critic: OFF" : ""}`);

  let movies = parseCSV(INPUT_CSV);
  if (movieOffset > 0) {
    movies = movies.slice(movieOffset);
  }
  if (movieLimit) {
    movies = movies.slice(0, movieLimit);
  }
  console.log(`Loaded ${movies.length} movies from CSV${movieLimit ? ` (limited to ${movieLimit})` : ""}${movieOffset ? ` (offset ${movieOffset})` : ""}`);

  const progress = loadProgress();
  console.log(`Completed batches so far: ${progress.completedBatches.length}`);

  const totalBatches = Math.ceil(movies.length / BATCH_SIZE);
  console.log(`Total batches to run: ${totalBatches}`);

  for (let b = 0; b < totalBatches; b++) {
    const batchNumber = b + 1;

    if (progress.completedBatches.includes(batchNumber)) {
      console.log(`\nBatch ${batchNumber} — already completed, skipping`);
      continue;
    }

    const batchMovies = movies.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const batchResults = await processBatch(batchMovies, batchNumber);

    let addedThisBatch = 0;
    batchMovies.forEach((movie, i) => {
      const hint = batchResults[i];
      if (hint && (hint.hint_1 || hint.hint_2 || hint.hint_3 || hint.hint_4)) {
        addedThisBatch += 1;
        progress.results.push({
          title: movie.title,
          year: movie.year,
          hint_1: hint.hint_1,
          hint_2: hint.hint_2,
          hint_3: hint.hint_3,
          hint_4: hint.hint_4,
        });
      } else {
        console.warn(`  ⚠ No hint found for ${movie.title} — skipping`);
      }
    });

    if (addedThisBatch === 0) {
      console.error(
        "\nBatch produced no usable hints (API errors, parsing, or empty rows). Not marking this batch complete — fix the issue and re-run."
      );
      saveProgress(progress);
      process.exit(1);
    }

    progress.completedBatches.push(batchNumber);
    saveProgress(progress);

    writeOutputCSV(progress.results);
    console.log(`  💾 Progress saved (${progress.results.length}/${movies.length} movies)`);
  }

  console.log("\n=====================================");
  console.log(`COMPLETE — ${progress.results.length} movies processed`);
  console.log(`Output: ${OUTPUT_CSV}`);
  console.log("Feed this CSV to your SQL agent to write to Supabase.");

  if (progress.results.length === movies.length) {
    fs.unlinkSync(PROGRESS_FILE);
    console.log("Progress file cleaned up.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
