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

export interface ImportMovieEntry {
  /** TMDB search query (or ignored when tmdbId is set). */
  title: string;
  /** Disambiguates remakes and short titles in TMDB search. */
  year?: number;
  /** Stored catalog title when it should differ from TMDB (e.g. remakes sharing a name). */
  catalogTitle?: string;
  /** Bypass title search when the TMDB id is known. */
  tmdbId?: number;
}

function missingEnvError(): ImportResult {
  return {
    outcome: "error",
    message: "Missing TMDB_ACCESS_TOKEN, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY.",
  };
}

function getImportClients() {
  const tmdbToken = process.env.TMDB_ACCESS_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!tmdbToken || !supabaseUrl || !supabaseServiceKey) return null;
  return {
    headers: { Authorization: `Bearer ${tmdbToken}` },
    supabase: createClient(supabaseUrl, supabaseServiceKey),
  };
}

async function fetchTmdbMovie(
  movieId: number,
  headers: Record<string, string>
): Promise<{ details: TMDBMovieDetails; credits: TMDBCredits } | ImportResult> {
  const detailsRes = await fetch(`${TMDB_BASE}/movie/${movieId}?language=en-US`, { headers });
  if (!detailsRes.ok) {
    return { outcome: "error", message: `TMDB movie details failed: ${detailsRes.status}` };
  }
  const details = (await detailsRes.json()) as TMDBMovieDetails;

  const creditsRes = await fetch(`${TMDB_BASE}/movie/${movieId}/credits?language=en-US`, { headers });
  const credits: TMDBCredits = creditsRes.ok ? await creditsRes.json() : {};

  return { details, credits };
}

async function insertMovieFromTmdb(
  supabase: ReturnType<typeof createClient>,
  details: TMDBMovieDetails,
  credits: TMDBCredits,
  catalogTitle?: string
): Promise<ImportResult> {
  const tagline = cleanTagline(details.tagline ?? "");
  if (!tagline) {
    return { outcome: "skipped", reason: "TMDB tagline is empty or cleaned to empty." };
  }

  const year = getYear(details.release_date);
  if (!year) {
    return { outcome: "skipped", reason: "No valid release year." };
  }

  const storedTitle = (catalogTitle ?? details.title).trim();
  const normalizedNewTitle = normalizeTitleForDedup(storedTitle);
  const { data: existingRows } = await supabase.from("movies").select("id, title, year");
  const existing = (existingRows ?? []).find(
    (row: { id: string; title: string; year: number }) =>
      row.year === year && normalizeTitleForDedup(row.title) === normalizedNewTitle
  );
  if (existing) {
    return { outcome: "skipped", reason: `Movie already exists (id=${existing.id}).` };
  }

  const genre = getGenre(details);
  const castHint = getCastHint(credits);
  const plotHint = (details.overview ?? "").trim().slice(0, 1000);
  const posterPath = details.poster_path?.trim()
    ? details.poster_path!.startsWith("/")
      ? details.poster_path
      : `/${details.poster_path}`
    : null;

  const { data: insertedMovie, error: movieErr } = await supabase
    .from("movies")
    .insert({
      title: storedTitle,
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

  const { error: aliasErr } = await supabase.from("accepted_aliases").insert({
    movie_id: movieUuid,
    alias: storedTitle,
  });
  if (aliasErr && aliasErr.code !== "23505") {
    return { outcome: "error", message: `Insert alias failed: ${aliasErr.message}` };
  }

  return { outcome: "inserted", id: movieUuid, title: storedTitle, year };
}

/** Import one movie by TMDB movie id (bypasses ambiguous title search). */
export async function importMovieByTmdbId(
  tmdbId: number,
  catalogTitle?: string
): Promise<ImportResult> {
  const clients = getImportClients();
  if (!clients) return missingEnvError();

  const fetched = await fetchTmdbMovie(tmdbId, clients.headers);
  if ("outcome" in fetched) return fetched;

  return insertMovieFromTmdb(clients.supabase, fetched.details, fetched.credits, catalogTitle);
}

/** Import one movie from TMDB into Supabase. Caller must have env and loadEnv() already run. */
export async function importMovieEntry(entry: ImportMovieEntry): Promise<ImportResult> {
  const clients = getImportClients();
  if (!clients) return missingEnvError();

  let movieId = entry.tmdbId;
  if (!movieId) {
    const searchUrl = new URL(`${TMDB_BASE}/search/movie`);
    searchUrl.searchParams.set("query", entry.title);
    searchUrl.searchParams.set("language", "en-US");
    if (entry.year) searchUrl.searchParams.set("year", String(entry.year));

    const searchRes = await fetch(searchUrl.toString(), { headers: clients.headers });
    if (!searchRes.ok) {
      return { outcome: "error", message: `TMDB search failed: ${searchRes.status}` };
    }
    const searchData = (await searchRes.json()) as { results?: TMDBSearchResult[] };
    const results = searchData.results ?? [];
    if (results.length === 0) {
      return { outcome: "skipped", reason: "No TMDB results found." };
    }
    const best =
      entry.year != null
        ? results.find((r) => getYear(r.release_date) === entry.year) ?? results[0]!
        : results[0]!;
    movieId = best.id;
  }

  const fetched = await fetchTmdbMovie(movieId, clients.headers);
  if ("outcome" in fetched) return fetched;

  return insertMovieFromTmdb(
    clients.supabase,
    fetched.details,
    fetched.credits,
    entry.catalogTitle
  );
}

/**
 * Import one movie from TMDB into Supabase. Caller must have env and loadEnv() already run.
 */
export async function importOneMovie(titleArg: string, year?: number): Promise<ImportResult> {
  return importMovieEntry({ title: titleArg, year });
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
