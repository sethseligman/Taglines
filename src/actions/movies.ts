"use server";

import { randomInt } from "node:crypto";
import { unstable_noStore } from "next/cache";
import type { Movie } from "@/types/movie";
import type { DbMovie, DbDailySchedule } from "@/types/database";
import type { SuggestionCatalogItem } from "@/types/suggestion";
import { logDailyFallback, logPracticeFallback } from "@/lib/debug";
import { createClient } from "@/lib/supabase/server";
import { movieFromDb, type MovieRow } from "@/lib/movieFromDb";
import { normalizeForAutocompleteMatch, normalizeForComparison } from "@/lib/answerNormalize";
import { getPrecisionSuggestions } from "@/lib/autocompleteMatch";
import suggestionCatalog from "@/data/suggestionCatalog.json";

const hasSupabase = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const AUTOCOMPLETE_CACHE_MS = 5 * 60 * 1000;
let autocompleteCatalogCache: SuggestionCatalogItem[] | null = null;
let autocompleteCatalogCacheAt = 0;

/** Get daily movie for a date (YYYY-MM-DD). Returns null if not configured or no Supabase. */
export async function getDailyMovie(dateKey: string): Promise<{ movie: Movie; dateKey: string } | null> {
  if (!hasSupabase) {
    logDailyFallback("Supabase not configured", dateKey);
    return null;
  }
  try {
    const supabase = await createClient();
    const { data: schedule, error: scheduleError } = await supabase
      .from("daily_schedule")
      .select("movie_id")
      .eq("scheduled_date", dateKey)
      .single();
    if (scheduleError || !schedule?.movie_id) {
      logDailyFallback("no movie scheduled", dateKey);
      return null;
    }
    const row = await fetchMovieRow(supabase, schedule.movie_id);
    if (!row || !row.is_playable) {
      logDailyFallback(row ? "scheduled movie not playable" : "scheduled movie not found", dateKey);
      return null;
    }
    return { movie: movieFromDb(row), dateKey };
  } catch (e) {
    logDailyFallback("fetch failed", dateKey);
    return null;
  }
}

/** Get a random movie for practice. Returns null if no Supabase or no movies. */
export async function getRandomPracticeMovie(): Promise<Movie | null> {
  unstable_noStore();
  if (!hasSupabase) {
    logPracticeFallback("Supabase not configured");
    return null;
  }
  try {
    const supabase = await createClient();
    const { data: ids } = await supabase.from("movies").select("id").eq("is_playable", true);
    if (!ids?.length) {
      logPracticeFallback("no playable movies in database");
      return null;
    }
    // Use crypto RNG so selection varies per request (Math.random() can be deterministic in serverless)
    const index = randomInt(0, ids.length);
    const randomId = ids[index]!.id;
    const row = await fetchMovieRow(supabase, randomId);
    return row ? movieFromDb(row) : null;
  } catch {
    logPracticeFallback("fetch failed");
    return null;
  }
}

async function fetchMovieRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  movieId: string
): Promise<MovieRow | null> {
  const { data: movie, error: movieError } = await supabase
    .from("movies")
    .select("id, title, year, genre, cast_hint, plot_hint, poster_url, poster_path, is_playable, hint_1, hint_2, hint_3, hint_4")
    .eq("id", movieId)
    .single();
  if (movieError || !movie) return null;
  const { data: taglines } = await supabase
    .from("taglines")
    .select("tagline_text, is_primary")
    .eq("movie_id", movieId);
  const { data: aliasRows } = await supabase
    .from("accepted_aliases")
    .select("alias")
    .eq("movie_id", movieId);
  return {
    ...(movie as DbMovie),
    taglines: taglines ?? [],
    aliases: (aliasRows ?? []).map((a: { alias: string }) => a.alias),
  };
}

/** Fetch full movie row by id (for admin). */
export async function getMovieById(id: string): Promise<MovieRow | null> {
  if (!hasSupabase) return null;
  const supabase = await createClient();
  return fetchMovieRow(supabase, id);
}

/** List all movies (for admin and practice fallback). */
export async function listMovies(): Promise<MovieRow[]> {
  if (!hasSupabase) return [];
  const supabase = await createClient();

  const [{ data: movies }, { data: allTaglines }, { data: allAliases }] = await Promise.all([
    supabase
      .from("movies")
      .select(
        "id, title, year, genre, cast_hint, plot_hint, poster_url, poster_path, status, is_playable, hint_1, hint_2, hint_3, hint_4"
      )
      .order("title"),
    supabase.from("taglines").select("movie_id, tagline_text, is_primary"),
    supabase.from("accepted_aliases").select("movie_id, alias"),
  ]);

  if (!movies?.length) return [];

  const taglinesByMovie = new Map<string, { tagline_text: string; is_primary: boolean }[]>();
  for (const t of allTaglines ?? []) {
    const list = taglinesByMovie.get(t.movie_id) ?? [];
    list.push({ tagline_text: t.tagline_text, is_primary: t.is_primary });
    taglinesByMovie.set(t.movie_id, list);
  }

  const aliasesByMovie = new Map<string, string[]>();
  for (const a of allAliases ?? []) {
    const list = aliasesByMovie.get(a.movie_id) ?? [];
    list.push(a.alias);
    aliasesByMovie.set(a.movie_id, list);
  }

  return (movies as DbMovie[]).map((m) => ({
    ...m,
    taglines: taglinesByMovie.get(m.id) ?? [],
    aliases: aliasesByMovie.get(m.id) ?? [],
  }));
}

/** Get schedule entries (for admin). */
export async function getSchedule(limit = 30): Promise<DbDailySchedule[]> {
  if (!hasSupabase) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_schedule")
    .select("*")
    .order("scheduled_date", { ascending: true })
    .limit(limit);
  return (data ?? []) as DbDailySchedule[];
}

async function getSampleTitles(): Promise<string[]> {
  const { SAMPLE_MOVIES } = await import("@/data/movies");
  const set = new Set<string>();
  for (const m of SAMPLE_MOVIES) {
    set.add(m.title);
    m.acceptedAnswers.forEach((a) => set.add(a));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

async function getPlayableSuggestionSeed(): Promise<SuggestionCatalogItem[]> {
  if (!hasSupabase) {
    const { SAMPLE_MOVIES } = await import("@/data/movies");
    return SAMPLE_MOVIES.map((m) => ({
      tmdbId: 0,
      title: m.title,
      year: m.year,
      normalizedTitle: normalizeForComparison(m.title),
      popularity: 0,
    }));
  }
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("movies")
      .select("title, year")
      .eq("is_playable", true)
      .order("title");
    return (data ?? [])
      .filter((m): m is { title: string; year: number } => !!m?.title)
      .map((m) => ({
        tmdbId: 0,
        title: m.title,
        year: Number.isFinite(m.year) ? m.year : 0,
        normalizedTitle: normalizeForComparison(m.title),
        popularity: 0,
      }));
  } catch {
    const fallbackTitles = await getSampleTitles();
    return fallbackTitles.map((title) => ({
      tmdbId: 0,
      title,
      year: 0,
      normalizedTitle: normalizeForComparison(title),
      popularity: 0,
    }));
  }
}

function mergeUniqueSuggestions(
  base: SuggestionCatalogItem[],
  required: SuggestionCatalogItem[]
): SuggestionCatalogItem[] {
  const map = new Map<string, SuggestionCatalogItem>();
  for (const item of base) {
    map.set(`${item.normalizedTitle}::${item.year}`, item);
  }
  for (const item of required) {
    const key = `${item.normalizedTitle}::${item.year}`;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

/** Existing playable-catalog fallback for autocomplete if suggestion catalog is unavailable. */
async function getPlayableAutocompleteTitles(): Promise<string[]> {
  const { logAutocompleteFallback } = await import("@/lib/debug");
  if (!hasSupabase) {
    logAutocompleteFallback("Supabase not configured");
    return getSampleTitles();
  }
  try {
    const supabase = await createClient();
    const { data: movies } = await supabase.from("movies").select("id").eq("is_playable", true).order("title");
    if (!movies?.length) {
      logAutocompleteFallback("no playable movies in database");
      return getSampleTitles();
    }
    const set = new Set<string>();
    for (const m of movies as { id: string }[]) {
      const row = await fetchMovieRow(supabase, m.id);
      if (row) {
        set.add(row.title);
        row.aliases?.forEach((a) => set.add(a));
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  } catch {
    logAutocompleteFallback("fetch failed");
    return getSampleTitles();
  }
}

/** Large, local suggestion catalog (TMDB-derived) for autocomplete UI only. */
export async function getAutocompleteSuggestions(): Promise<SuggestionCatalogItem[]> {
  const now = Date.now();
  if (autocompleteCatalogCache && now - autocompleteCatalogCacheAt < AUTOCOMPLETE_CACHE_MS) {
    return autocompleteCatalogCache;
  }
  const playableSeed = await getPlayableSuggestionSeed();
  const items = Array.isArray(suggestionCatalog.items)
    ? (suggestionCatalog.items as SuggestionCatalogItem[])
    : [];
  if (items.length === 0) {
    const fallbackTitles = await getPlayableAutocompleteTitles();
    const fallbackItems = fallbackTitles.map((title) => ({
      tmdbId: 0,
      title,
      year: 0,
      normalizedTitle: normalizeForComparison(title),
      popularity: 0,
    }));
    const mergedFallback = mergeUniqueSuggestions(fallbackItems, playableSeed);
    autocompleteCatalogCache = mergedFallback;
    autocompleteCatalogCacheAt = now;
    return mergedFallback;
  }
  const merged = mergeUniqueSuggestions(items, playableSeed);
  autocompleteCatalogCache = merged;
  autocompleteCatalogCacheAt = now;
  return merged;
}

/** Server-side autocomplete query over local suggestion catalog. */
export async function searchAutocompleteSuggestions(query: string): Promise<SuggestionCatalogItem[]> {
  const trimmed = query.trim();
  if (normalizeForAutocompleteMatch(trimmed).length < 2) return [];
  const candidates = await getAutocompleteSuggestions();
  return getPrecisionSuggestions(trimmed, candidates);
}
