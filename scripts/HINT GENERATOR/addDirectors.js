// One-off: enrich Primary Movie Taglines Lookup CSV with TMDB director column.
// Reads TMDB_ACCESS_TOKEN from env (same as scripts/importMovie.ts — load project root .env).
// Output: Supabase Snippet Primary Movie Taglines Lookup_with_directors.csv
// Column order: title, year, genre, cast_hint, director, plot_hint, tagline_text

const fs = require("fs");
const path = require("path");

const TMDB_BASE = "https://api.themoviedb.org/3";
const INPUT_CSV = path.join(__dirname, "Supabase Snippet Primary Movie Taglines Lookup.csv");
const OUTPUT_CSV = path.join(__dirname, "Supabase Snippet Primary Movie Taglines Lookup_with_directors.csv");

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

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.replace(/\r$/, ""));
  return result;
}

function escapeCsvCell(val) {
  const s = String(val ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const values = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? "";
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tmdbFetch(path, token) {
  const res = await fetch(`${TMDB_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TMDB ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function pickSearchResult(results, yearStr) {
  if (!results?.length) return null;
  const y = Number.parseInt(String(yearStr).trim(), 10);
  if (Number.isFinite(y)) {
    const match = results.find((r) => {
      const rd = r.release_date;
      if (!rd || rd.length < 4) return false;
      const ry = Number.parseInt(rd.slice(0, 4), 10);
      return ry === y;
    });
    if (match) return match;
  }
  return results[0];
}

/** Comma-separated director names (multiple if co-directors). */
async function fetchDirectors(title, year, token) {
  const params = new URLSearchParams({
    query: title.trim(),
    include_adult: "false",
    language: "en-US",
  });
  if (year !== undefined && String(year).trim() !== "") {
    params.set("year", String(year).trim());
  }
  const search = await tmdbFetch(`/search/movie?${params}`, token);
  const results = search.results ?? [];
  const best = pickSearchResult(results, year);
  if (!best?.id) return "";

  const details = await tmdbFetch(`/movie/${best.id}?append_to_response=credits`, token);
  const crew = details.credits?.crew ?? [];
  const directors = crew.filter((c) => c.job === "Director").map((c) => c.name).filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const name of directors) {
    if (!seen.has(name)) {
      seen.add(name);
      unique.push(name);
    }
  }
  return unique.join(", ");
}

async function main() {
  loadEnvFile();
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token || !token.trim()) {
    console.error("Missing TMDB_ACCESS_TOKEN (set in project root .env, same as importMovie / build:suggestions).");
    process.exit(1);
  }

  if (!fs.existsSync(INPUT_CSV)) {
    console.error("Input not found:", INPUT_CSV);
    process.exit(1);
  }

  const { headers, rows } = parseCSV(INPUT_CSV);
  const expected = ["title", "year", "genre", "cast_hint", "plot_hint", "tagline_text"];
  const missing = expected.filter((h) => !headers.includes(h));
  if (missing.length) {
    console.error("Unexpected headers; missing:", missing.join(", "));
    process.exit(1);
  }

  const outHeaders = ["title", "year", "genre", "cast_hint", "director", "plot_hint", "tagline_text"];
  const betweenMs = 260;

  /** @type {string[]} */
  const outLines = [outHeaders.join(",")];

  let noDirector = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const title = row.title ?? "";
    const year = row.year ?? "";

    let director = "";
    try {
      director = await fetchDirectors(title, year, token.trim());
    } catch (e) {
      console.warn(`TMDB error for "${title}" (${year}): ${e.message}`);
    }

    if (!director.trim()) {
      console.warn(`No director — ${title}`);
      noDirector.push(title);
    }

    const line = [
      escapeCsvCell(row.title),
      escapeCsvCell(row.year),
      escapeCsvCell(row.genre),
      escapeCsvCell(row.cast_hint),
      escapeCsvCell(director),
      escapeCsvCell(row.plot_hint),
      escapeCsvCell(row.tagline_text),
    ].join(",");

    outLines.push(line);

    console.log(`${i + 1}/${rows.length} — ${title} → ${director || "(empty)"}`);
    if (i < rows.length - 1) await delay(betweenMs);
  }

  fs.writeFileSync(OUTPUT_CSV, outLines.join("\n") + "\n", "utf8");
  console.log("\nWrote:", OUTPUT_CSV);
  if (noDirector.length) {
    console.log(`Titles with empty director (${noDirector.length}):`, noDirector.join("; "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
