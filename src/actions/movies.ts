"use server";

import type { Movie } from "@/types/movie";
import type { DbMovie, DbTagline, DbAcceptedAlias, DbDailySchedule } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { movieFromDb, type MovieRow } from "@/lib/movieFromDb";

const hasSupabase = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/** Get daily movie for a date (YYYY-MM-DD). Returns null if not configured or no Supabase. */
export async function getDailyMovie(dateKey: string): Promise<{ movie: Movie; dateKey: string } | null> {
  if (!hasSupabase) return null;
  const supabase = await createClient();
  const { data: schedule } = await supabase
    .from("daily_schedule")
    .select("movie_id")
    .eq("scheduled_date", dateKey)
    .single();
  if (!schedule?.movie_id) return null;
  const row = await fetchMovieRow(supabase, schedule.movie_id);
  if (!row) return null;
  return { movie: movieFromDb(row), dateKey };
}

/** Get a random movie for practice. Returns null if no Supabase or no movies. */
export async function getRandomPracticeMovie(): Promise<Movie | null> {
  if (!hasSupabase) return null;
  const supabase = await createClient();
  const { data: ids } = await supabase.from("movies").select("id");
  if (!ids?.length) return null;
  const randomId = ids[Math.floor(Math.random() * ids.length)]!.id;
  const row = await fetchMovieRow(supabase, randomId);
  return row ? movieFromDb(row) : null;
}

async function fetchMovieRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  movieId: string
): Promise<MovieRow | null> {
  const { data: movie, error: movieError } = await supabase
    .from("movies")
    .select("*")
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
  const { data: movies } = await supabase.from("movies").select("*").order("title");
  if (!movies?.length) return [];
  const rows: MovieRow[] = [];
  for (const m of movies as DbMovie[]) {
    const row = await fetchMovieRow(supabase, m.id);
    if (row) rows.push(row);
  }
  return rows;
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
