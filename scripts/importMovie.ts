/**
 * Step 3: Import ONE movie from TMDB into Supabase as pending_review.
 *
 * Usage:
 *   npx tsx scripts/importMovie.ts "Movie Title"
 *
 * Required env:
 *   TMDB_ACCESS_TOKEN   - TMDB API v4 Bearer token (create at themoviedb.org)
 *   NEXT_PUBLIC_SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key (for inserts)
 *
 * Loads .env from project root if present.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load .env from project root
function loadEnv(): void {
  const root = resolve(process.cwd(), ".env");
  if (!existsSync(root)) return;
  const content = readFileSync(root, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  });
}
loadEnv();

const TMDB_BASE = "https://api.themoviedb.org/3";

interface TMDBSearchResult {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
}

interface TMDBMovieDetails {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  tagline?: string | null;
  genres?: { id: number; name: string }[];
}

interface TMDBCredits {
  cast?: { name: string; order: number }[];
}

function getYear(releaseDate: string | undefined): number {
  if (!releaseDate) return 0;
  const y = parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(y) && y >= 1800 && y <= 2100 ? y : 0;
}

function getGenre(details: TMDBMovieDetails): string {
  const names = (details.genres ?? []).map((g) => g.name).filter(Boolean);
  return names.length ? names.slice(0, 3).join(", ") : "";
}

function getCastHint(credits: TMDBCredits): string {
  const cast = (credits.cast ?? [])
    .sort((a, b) => a.order - b.order)
    .slice(0, 3)
    .map((c) => c.name)
    .filter(Boolean);
  return cast.join(", ");
}

/** Normalize title for duplicate detection: lowercase, trim, remove punctuation, collapse whitespace. */
function normalizeTitleForDedup(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[''’.,\-:;!?()\[\]{}"\/\\@#$%^&*+=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clean tagline: trim, collapse internal whitespace, strip surrounding quotes. Returns empty if nothing left. */
function cleanTagline(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ");
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export type ImportResult =
  | { outcome: "inserted"; id: string; title: string; year: number }
  | { outcome: "skipped"; reason: string }
  | { outcome: "error"; message: string };

/**
 * Import one movie from TMDB into Supabase. Caller must have env and loadEnv() already run.
 */
export async function importOneMovie(titleArg: string): Promise<ImportResult> {
  const tmdbToken = process.env.TMDB_ACCESS_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!tmdbToken || !supabaseUrl || !supabaseServiceKey) {
    return {
      outcome: "error",
      message: "Missing TMDB_ACCESS_TOKEN, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const headers = { Authorization: `Bearer ${tmdbToken}` };
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const searchRes = await fetch(
    `${TMDB_BASE}/search/movie?query=${encodeURIComponent(titleArg)}&language=en-US`,
    { headers }
  );
  if (!searchRes.ok) {
    return { outcome: "error", message: `TMDB search failed: ${searchRes.status}` };
  }
  const searchData = (await searchRes.json()) as { results?: TMDBSearchResult[] };
  const results = searchData.results ?? [];
  if (results.length === 0) {
    return { outcome: "skipped", reason: "No TMDB results found." };
  }

  const best = results[0]!;
  const movieId = best.id;

  const detailsRes = await fetch(
    `${TMDB_BASE}/movie/${movieId}?language=en-US`,
    { headers }
  );
  if (!detailsRes.ok) {
    return { outcome: "error", message: `TMDB movie details failed: ${detailsRes.status}` };
  }
  const details = (await detailsRes.json()) as TMDBMovieDetails;

  const creditsRes = await fetch(
    `${TMDB_BASE}/movie/${movieId}/credits?language=en-US`,
    { headers }
  );
  const credits: TMDBCredits = creditsRes.ok ? await creditsRes.json() : {};

  const tagline = cleanTagline(details.tagline ?? "");
  if (!tagline) {
    return { outcome: "skipped", reason: "TMDB tagline is empty or cleaned to empty." };
  }

  const year = getYear(details.release_date);
  if (!year) {
    return { outcome: "skipped", reason: "No valid release year." };
  }

  const normalizedNewTitle = normalizeTitleForDedup(details.title);
  const { data: existingRows } = await supabase.from("movies").select("id, title, year");
  const isDuplicate = (existingRows ?? []).some(
    (row: { id: string; title: string; year: number }) =>
      row.year === year && normalizeTitleForDedup(row.title) === normalizedNewTitle
  );
  if (isDuplicate) {
    const existing = (existingRows ?? []).find(
      (row: { id: string; title: string; year: number }) =>
        row.year === year && normalizeTitleForDedup(row.title) === normalizedNewTitle
    );
    return { outcome: "skipped", reason: `Movie already exists (id=${existing?.id ?? "?"}).` };
  }

  const genre = getGenre(details);
  const castHint = getCastHint(credits);
  const plotHint = (details.overview ?? "").trim().slice(0, 1000);
  const posterPath = details.poster_path?.trim() ? (details.poster_path!.startsWith("/") ? details.poster_path : `/${details.poster_path}`) : null;

  const { data: insertedMovie, error: movieErr } = await supabase
    .from("movies")
    .insert({
      title: details.title.trim(),
      year,
      genre,
      cast_hint: castHint,
      plot_hint: plotHint,
      poster_path: posterPath,
      status: "pending_review",
      is_playable: false,
    })
    .select("id")
    .single();

  if (movieErr || !insertedMovie) {
    return { outcome: "error", message: movieErr?.message ?? "Insert movie failed." };
  }

  const movieUuid = insertedMovie.id;

  const { error: taglineErr } = await supabase.from("taglines").insert({
    movie_id: movieUuid,
    tagline_text: tagline,
    is_primary: true,
  });
  if (taglineErr) {
    return { outcome: "error", message: `Insert tagline failed: ${taglineErr.message}` };
  }

  const canonicalTitle = details.title.trim();
  const { error: aliasErr } = await supabase.from("accepted_aliases").insert({
    movie_id: movieUuid,
    alias: canonicalTitle,
  });
  if (aliasErr && aliasErr.code !== "23505") {
    return { outcome: "error", message: `Insert alias failed: ${aliasErr.message}` };
  }

  return { outcome: "inserted", id: movieUuid, title: canonicalTitle, year };
}

async function main(): Promise<void> {
  const titleArg = process.argv.slice(2).join(" ").trim();
  if (!titleArg) {
    console.error("Usage: npx tsx scripts/importMovie.ts \"Movie Title\"");
    process.exit(1);
  }

  loadEnv();
  const result = await importOneMovie(titleArg);

  if (result.outcome === "error") {
    console.error(result.message);
    process.exit(1);
  }
  if (result.outcome === "skipped") {
    console.log("Skipping:", result.reason);
    process.exit(0);
  }
  console.log("Done.");
  console.log(`  movies.id: ${result.id}`);
  console.log(`  title: ${result.title} (${result.year})`);
  console.log(`  status: pending_review, is_playable: false`);
}

// Only run CLI when this file is the entry script (not when imported by importMovieList.ts)
if (process.argv[1]?.endsWith("importMovie.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
