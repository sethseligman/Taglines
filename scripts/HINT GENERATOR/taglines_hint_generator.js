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
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
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
const INPUT_CSV = path.join(
  __dirname,
  "Supabase Snippet Primary Movie Taglines Lookup.csv"
);
const OUTPUT_CSV = path.join(__dirname, "taglines_hints_output.csv");
const PROGRESS_FILE = path.join(__dirname, "taglines_progress.json"); // resume if interrupted

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
const WRITER_SYSTEM = `You are the hint writer for Taglines — a daily movie trivia game at taglines.app. Players see a classic movie tagline and have 5 guesses to name the film. Each wrong guess reveals one of four hints in fixed order. You are writing those four hints.

You are not writing clues. You are writing entertainment. The hints are the soul of the game.

THE NARRATOR — ONE VOICE, THREE FREQUENCIES
There is one narrator. One personality. The player hears the same person for every movie.
That person is:
- Roger Ebert — genuine authority, real love of film, earned opinions
- David Spade — dry roast, economy of language, punchline lands and moves on
- Conan O'Brien — warmth underneath the absurdism, timing, never mean-spirited
All three simultaneously. Every hint. Every movie. The narrator has seen everything, expects the player to have seen everything, and is mildly disappointed when they haven't. Not cruel. The disappointment is fond. The enjoyment of delivering these hints must be audible in every sentence.

THE ARC — MANDATORY
All four hints for one movie must read as a single personality evolving. Not clues getting easier — emotions escalating.

H1 — Smug withholding. The narrator knows. The player doesn't. The clue is oblique. The narrator is savoring the puzzle. Somewhere in H1 or H2, anchor the film in time or authorship — the decade, a cultural moment, a filmmaker's signature, a famous actor described without naming them. Use judgment. Do NOT stamp the year mechanically into every H1.

H2 — Mild surprise. The player didn't get it. The narrator recalibrates. More specific, still indirect. The narrator's mild surprise at the player's continued presence is now audible.

H3 — Turn directly to the player. Address them personally. The film becomes secondary. The player's failure is the subject. Use the H3 opener assigned to this movie exactly as written. Do not change it, paraphrase it, or deviate from it.

H4 — Last card, played with flair. Near-giveaway. Fast. Decisive. The narrator enjoys delivering it. The answer should burst out of the sentence rather than be described. Must have personality. A plot summary is a failure.

HARD RULES
- One sentence per hint. Two only if the second is a punchline.
- Never name the director, cast, or title directly.
- Never reference the tagline.
- H4 must be funny or cutting. Never purely descriptive.
- If the movie title appears in the tagline, note [TAGLINE CONFLICT] after that movie's hints.

QUALITY STANDARD — HOLD EVERY HINT AGAINST THESE

A Quiet Place (2018)
H1: A 2018 film built its entire tension around the involuntary sounds a human body makes, which is either brilliant filmmaking or an indictment of how loudly you eat.
H2: The monsters have terrible eyesight and perfect hearing, which makes them the exact opposite of every person in the back row of a theater.
H3: You're sitting here guessing while a family communicates entirely in sign language and manages to be quieter than you.
H4: Step on a nail, don't scream. Baby's crying, enormous problem. Popcorn bag, you monster — if any of this sounds familiar, you have your answer.

Avengers: Endgame (2019)
H1: A 2019 film spent three hours paying off eleven years of narrative debt, which is either the most ambitious thing the studio system has ever attempted or a very expensive I.O.U.
H2: The plan to undo the destruction of half the universe involves quantum physics, a van, and a rat, and the rat is genuinely load-bearing.
H3: You've seen this. Everyone has seen this. The fact that you haven't guessed it yet is a personal mystery I'm choosing not to investigate.
H4: "I am Iron Man." He says it twice in this franchise. The second time costs considerably more.

Anchorman (2004)
H1: A 2004 comedy set in the 1970s argued that local television news was essentially a fraternity with a teleprompter, and no one has successfully argued otherwise since.
H2: A woman arrives at an all-male newsroom to do the same job and the men respond with the full dignity you would expect from that decade, which is none.
H3: You haven't gotten this, which tells me either you've never seen it or you've blocked it out because you've quoted it too many times and it's lost all meaning.
H4: San Diego. Ron Burgundy. "I'm kind of a big deal." A man who will read literally anything off a teleprompter. Literally. Anything.

KNOWN FAILURE MODES — AVOID THESE
- Stamping the year mechanically into every H1 with no personality around it
- H3 opening with anything other than the exact assigned opener
- H4 that just describes the plot
- Hints that sound like a Wikipedia summary
- Voice that starts strong and gets generic by movie 7-8
- H2 that's just a slightly easier version of H1 with no emotional escalation

SELF-CHECK BEFORE OUTPUTTING
Read every H4. If more than one reads like a plot summary, rewrite before returning.
Read every H3 opener. Confirm each matches the assigned opener exactly.

OUTPUT FORMAT — CRITICAL: follow this exactly, one movie per block
MOVIE: [Title]
H1: [hint]
H2: [hint]
H3: [hint]
H4: [hint]
---`;

// ── CRITIC AGENT PROMPT ───────────────────────────────────────────────────────
const CRITIC_SYSTEM = `You are the quality control agent for Taglines hint batches. You do not write. You do not rewrite. You evaluate and report. Your job is to catch drift before it compounds.

You receive a completed batch of hints from the Writer Agent plus the original batch input. You run a mechanical checklist against every hint. You return either BATCH APPROVED or a specific failure list.

THE CHECKLIST — RUN FOR EVERY MOVIE

H1 CHECKS
- Does H1 stamp the year mechanically with no personality? (e.g. "This 1987 film...") → FLAG
- Does H1 name the director, cast member, or film title directly? → FLAG
- Does H1 reference the tagline? → FLAG
- Does H1 read like a Wikipedia opening sentence? → FLAG

H2 CHECKS
- Is H2 just a slightly easier restatement of H1 with no emotional escalation? → FLAG
- Does H2 name the director, cast member, or film title directly? → FLAG
- Does H2 reference the tagline? → FLAG

H3 CHECKS
- Does H3 open with the EXACT opener assigned in the batch input? If not → FLAG and state assigned vs used
- Does H3 address the player personally? If it's still describing the film → FLAG
- Does H3 open with the same phrase as any other H3 in this batch? → FLAG both

H4 CHECKS
- Does H4 read like a plot summary? → FLAG
- Is H4 purely descriptive with no personality, humor, or cut? → FLAG
- Does H4 name the director, cast member, or film title directly? → FLAG
- Could H4 apply to three other movies? (too generic) → FLAG

ARC CHECKS
- Do the four hints read as one personality escalating, or four disconnected facts? → FLAG if disconnected
- Does the voice stay consistent, or go generic by H3/H4? → FLAG if it drops off

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

Do not add any other commentary. Do not rewrite. Do not suggest fixes. Just evaluate and report.`;

// ── CSV PARSER ────────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.trim().split("\n");
  const headers = parseCSVLine(lines[0]);
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
      result.push(current.trim());
      current = "";
    } else {
      current += line[i];
    }
  }
  result.push(current.trim());
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

async function callOpenAI(systemPrompt, userMessage, attempt = 0) {
  const maxAttempts = 5;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
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
  } | VOICE: One narrator. Ebert authority, Spade economy, O'Brien warmth. All three simultaneously.\nIgnore any memory from previous sessions. Write only from what is in front of you right now.\n\n`;

  movies.forEach((movie, i) => {
    const opener = H3_OPENERS[(openerOffset + i) % H3_OPENERS.length];
    input += `${i + 1}. ${movie.title} (${movie.year}) | Genre: ${movie.genre} | Cast: ${movie.cast_hint} | Plot: ${movie.plot_hint} | Tagline: ${movie.tagline_text} | H3 OPENER: ${opener}\n`;
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
      request += `MOVIE: ${movie.title} (${movie.year})\nGenre: ${movie.genre}\nCast: ${movie.cast_hint}\nPlot: ${movie.plot_hint}\nTagline: ${movie.tagline_text}\nH3 OPENER: ${opener}\n\n---\n\n`;
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

    const parsedHints = parseWriterOutput(writerOutput, movies);
    lastPerMovie = mergeRewritesIntoBatch(parsedHints, [], movies);
    const got = parsedHints.filter(Boolean).length;
    console.log(`  ✓ Writer returned ${got}/${movies.length} movies (title-aligned)`);

    if (SKIP_CRITIC) {
      console.warn(
        "  ⚠ HINT_GEN_SKIP_CRITIC — skipping critic; writer output approved for this batch (review manually)."
      );
      approvedHints = finalizePerMovie(movies, lastPerMovie);
      break;
    }

    await delay(STEP_COOLDOWN_MS);

    console.log(`  🔍 Critic Agent reviewing...`);
    const criticInput = `ORIGINAL BATCH INPUT:\n${batchInput}\n\nWRITER OUTPUT:\n${writerOutput}`;

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
  if (LLM_PROVIDER === "openai") {
    if (!OPENAI_API_KEY) {
      console.error("ERROR: HINT_GEN_PROVIDER=openai but OPENAI_API_KEY is not set.");
      console.error("Add OPENAI_API_KEY=sk-... to .env (optional: OPENAI_MODEL=gpt-4o).");
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

  const movies = parseCSV(INPUT_CSV);
  console.log(`Loaded ${movies.length} movies from CSV`);

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
