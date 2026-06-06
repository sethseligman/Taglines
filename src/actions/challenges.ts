"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/adminAuth";
import {
  generateChallengeDailyLegs,
  getTodayDateKey,
} from "@/lib/generateChallengeDailyLegs";
import type { Movie } from "@/types/movie";
import type { ChallengeType, DbChallenge } from "@/types/challenges";
import { movieFromDb, type MovieRow } from "@/lib/movieFromDb";
import type { DbMovie } from "@/types/database";

async function requireAdmin() {
  const ok = await isAdmin();
  if (!ok) throw new Error("Unauthorized");
}

export interface ChallengeMovieRow {
  id: string;
  movie_id: string;
  position: number;
  title: string;
  year: number;
  is_playable: boolean;
}

export interface ChallengeInput {
  title: string;
  slug: string;
  eyebrow: string | null;
  type: ChallengeType;
  leg_count: number;
}

export interface PublishChallengeResult {
  ok?: boolean;
  error?: string;
  blockingMovies?: { title: string; year: number }[];
  poolCount?: number;
}

const DAILY_POOL_MIN = 30;
/** Staging positions during reorder/shuffle (must stay > 0 per DB check). */
const TEMP_POSITION_BASE = 100_000;

function movieFromJoin(
  movies: { title: string; year: number; is_playable: boolean } | { title: string; year: number; is_playable: boolean }[] | null
): { title: string; year: number; is_playable: boolean } | null {
  if (!movies) return null;
  return Array.isArray(movies) ? (movies[0] ?? null) : movies;
}

export async function getChallenges(): Promise<DbChallenge[]> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DbChallenge[];
}

/** Published challenges for the portal (anon RLS). */
export async function getPublishedChallenges(): Promise<DbChallenge[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("is_published", true)
    .order("portal_sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("getPublishedChallenges:", error.message);
    return [];
  }
  return (data ?? []) as DbChallenge[];
}

export interface PublishedChallengeLeg {
  movieId: string;
  position: number;
  movie: Movie;
}

/** Published challenge by slug (portal / run). */
export async function getPublishedChallengeBySlug(slug: string): Promise<DbChallenge | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as DbChallenge;
}

async function fetchMovieRowForChallenge(
  supabase: Awaited<ReturnType<typeof createClient>>,
  movieId: string
): Promise<MovieRow | null> {
  const { data: movie, error: movieError } = await supabase
    .from("movies")
    .select(
      "id, title, year, genre, cast_hint, plot_hint, poster_url, poster_path, is_playable, hint_1, hint_2, hint_3, hint_4"
    )
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

const CHALLENGE_MOVIE_SELECT =
  "id, title, year, genre, cast_hint, plot_hint, poster_url, poster_path, is_playable, hint_1, hint_2, hint_3, hint_4";

async function fetchMovieRowsByIdsForChallenge(
  supabase: Awaited<ReturnType<typeof createClient>>,
  movieIds: string[]
): Promise<Map<string, MovieRow>> {
  const uniqueIds = [...new Set(movieIds)];
  if (!uniqueIds.length) return new Map();

  const [{ data: movies, error: movieError }, { data: taglines }, { data: aliasRows }] =
    await Promise.all([
      supabase.from("movies").select(CHALLENGE_MOVIE_SELECT).in("id", uniqueIds),
      supabase
        .from("taglines")
        .select("movie_id, tagline_text, is_primary")
        .in("movie_id", uniqueIds),
      supabase.from("accepted_aliases").select("movie_id, alias").in("movie_id", uniqueIds),
    ]);

  if (movieError || !movies?.length) return new Map();

  const taglinesByMovie = new Map<string, { tagline_text: string; is_primary: boolean }[]>();
  for (const t of taglines ?? []) {
    const movieId = t.movie_id as string;
    const list = taglinesByMovie.get(movieId) ?? [];
    list.push({
      tagline_text: t.tagline_text as string,
      is_primary: t.is_primary as boolean,
    });
    taglinesByMovie.set(movieId, list);
  }

  const aliasesByMovie = new Map<string, string[]>();
  for (const a of aliasRows ?? []) {
    const movieId = a.movie_id as string;
    const list = aliasesByMovie.get(movieId) ?? [];
    list.push(a.alias as string);
    aliasesByMovie.set(movieId, list);
  }

  const rowsById = new Map<string, MovieRow>();
  for (const movie of movies) {
    const id = movie.id as string;
    rowsById.set(id, {
      ...(movie as DbMovie),
      taglines: taglinesByMovie.get(id) ?? [],
      aliases: aliasesByMovie.get(id) ?? [],
    });
  }
  return rowsById;
}

/** Ordered playable legs for a published challenge (anon RLS). */
export async function getPublishedChallengeLegMovies(
  challengeId: string
): Promise<PublishedChallengeLeg[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("challenge_movies")
    .select("movie_id, position")
    .eq("challenge_id", challengeId)
    .order("position", { ascending: true });
  if (error || !data?.length) return [];

  const movieIds = data.map((row) => row.movie_id as string);
  const movieRowsById = await fetchMovieRowsByIdsForChallenge(supabase, movieIds);

  const legs: PublishedChallengeLeg[] = [];
  for (const row of data) {
    const movieId = row.movie_id as string;
    const movieRow = movieRowsById.get(movieId);
    if (!movieRow?.is_playable) continue;
    legs.push({
      movieId,
      position: row.position as number,
      movie: movieFromDb(movieRow),
    });
  }
  return legs;
}

/** Today's scheduled legs for a published daily_pool challenge (anon RLS). */
export async function getPublishedDailyPoolLegs(
  challengeId: string,
  dateKey: string
): Promise<PublishedChallengeLeg[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("challenge_daily_legs")
    .select("movie_id, position")
    .eq("challenge_id", challengeId)
    .eq("scheduled_date", dateKey)
    .order("position", { ascending: true });
  if (error || !data?.length) return [];

  const movieIds = data.map((row) => row.movie_id as string);
  const movieRowsById = await fetchMovieRowsByIdsForChallenge(supabase, movieIds);

  const legs: PublishedChallengeLeg[] = [];
  for (const row of data) {
    const movieId = row.movie_id as string;
    const movieRow = movieRowsById.get(movieId);
    if (!movieRow?.is_playable) continue;
    legs.push({
      movieId,
      position: row.position as number,
      movie: movieFromDb(movieRow),
    });
  }
  return legs;
}

export async function getChallengeMovies(challengeId: string): Promise<ChallengeMovieRow[]> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("challenge_movies")
    .select("id, movie_id, position, movies(title, year, is_playable)")
    .eq("challenge_id", challengeId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const movie = movieFromJoin(
      row.movies as { title: string; year: number; is_playable: boolean } | { title: string; year: number; is_playable: boolean }[] | null
    );
    return {
      id: row.id as string,
      movie_id: row.movie_id as string,
      position: row.position as number,
      title: movie?.title ?? "Unknown",
      year: movie?.year ?? 0,
      is_playable: movie?.is_playable ?? false,
    };
  });
}

export async function createChallenge(data: ChallengeInput): Promise<{ id: string } | { error: string }> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { data: created, error } = await supabase
    .from("challenges")
    .insert({
      title: data.title.trim(),
      slug: data.slug.trim(),
      eyebrow: data.eyebrow?.trim() || null,
      type: data.type,
      leg_count: data.leg_count,
      is_published: false,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: created.id };
}

export async function updateChallenge(
  id: string,
  data: ChallengeInput
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("challenges")
    .update({
      title: data.title.trim(),
      slug: data.slug.trim(),
      eyebrow: data.eyebrow?.trim() || null,
      type: data.type,
      leg_count: data.leg_count,
    })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

async function validatePublishGate(
  challengeId: string,
  type: ChallengeType
): Promise<PublishChallengeResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("challenge_movies")
    .select("movie_id, movies(title, year, is_playable)")
    .eq("challenge_id", challengeId);
  if (error) return { error: error.message };

  const rows = data ?? [];
  const notPlayable = rows
    .map((row) => {
      const movie = movieFromJoin(
        row.movies as { title: string; year: number; is_playable: boolean } | { title: string; year: number; is_playable: boolean }[] | null
      );
      if (!movie || movie.is_playable) return null;
      return { title: movie.title, year: movie.year };
    })
    .filter((m): m is { title: string; year: number } => m !== null);

  if (type === "daily_pool") {
    const count = rows.length;
    if (count < DAILY_POOL_MIN) {
      return {
        error: `Daily pool challenges need at least ${DAILY_POOL_MIN} movies (currently ${count}).`,
        poolCount: count,
        blockingMovies: notPlayable,
      };
    }
  }

  if (notPlayable.length > 0) {
    return {
      error: "Some movies in this challenge are not playable.",
      blockingMovies: notPlayable,
      poolCount: rows.length,
    };
  }

  if (rows.length === 0) {
    return { error: "Add at least one movie before publishing." };
  }

  return { ok: true };
}

function shufflePositions(count: number): number[] {
  const positions = Array.from({ length: count }, (_, i) => i + 1);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j]!, positions[i]!];
  }
  return positions;
}

export interface ShuffledMovieOrder {
  title: string;
  year: number;
  position: number;
}

/** Randomize leg order (positions 1..n). Used at publish and via admin reshuffle. */
export async function shuffleChallengeMoviePositions(
  challengeId: string
): Promise<{ error?: string; order?: ShuffledMovieOrder[] }> {
  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from("challenge_movies")
    .select("id, movie_id, position, movies(title, year)")
    .eq("challenge_id", challengeId)
    .order("position", { ascending: true });
  if (error) return { error: error.message };
  if (!rows?.length) return { error: "No movies in challenge." };

  const shuffled = shufflePositions(rows.length);

  for (let i = 0; i < rows.length; i++) {
    const { error: phase1 } = await supabase
      .from("challenge_movies")
      .update({ position: TEMP_POSITION_BASE + i })
      .eq("id", rows[i]!.id as string);
    if (phase1) return { error: phase1.message };
  }

  for (let i = 0; i < rows.length; i++) {
    const { error: phase2 } = await supabase
      .from("challenge_movies")
      .update({ position: shuffled[i] })
      .eq("id", rows[i]!.id as string);
    if (phase2) return { error: phase2.message };
  }

  const order: ShuffledMovieOrder[] = rows.map((row, i) => {
    const movie = movieFromJoin(
      row.movies as { title: string; year: number; is_playable: boolean } | { title: string; year: number; is_playable: boolean }[] | null
    );
    return {
      title: movie?.title ?? "Unknown",
      year: movie?.year ?? 0,
      position: shuffled[i]!,
    };
  });
  order.sort((a, b) => a.position - b.position);
  return { order };
}

export async function reshuffleChallengeMovies(
  challengeId: string
): Promise<{ error?: string; order?: ShuffledMovieOrder[] }> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { data: challenge, error } = await supabase
    .from("challenges")
    .select("is_published")
    .eq("id", challengeId)
    .single();
  if (error || !challenge) return { error: error?.message ?? "Challenge not found." };
  if (!challenge.is_published) {
    return { error: "Only published challenges can be reshuffled from admin." };
  }
  return shuffleChallengeMoviePositions(challengeId);
}

export async function publishChallenge(id: string): Promise<PublishChallengeResult> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { data: challenge, error: fetchError } = await supabase
    .from("challenges")
    .select("type, slug")
    .eq("id", id)
    .single();
  if (fetchError || !challenge) return { error: fetchError?.message ?? "Challenge not found." };

  const gate = await validatePublishGate(id, challenge.type as ChallengeType);
  if (!gate.ok) return gate;

  const shuffle = await shuffleChallengeMoviePositions(id);
  if (shuffle.error) return { error: shuffle.error };

  const { error } = await supabase.from("challenges").update({ is_published: true }).eq("id", id);
  if (error) return { error: error.message };

  if (challenge.type === "daily_pool") {
    const legs = await generateChallengeDailyLegs({
      targetDate: getTodayDateKey(),
      challengeSlug: challenge.slug as string,
      supabase,
    });
    if (legs.errorCount > 0) {
      const failed = legs.results.find((r) => r.status === "error");
      return {
        error: failed?.error ?? "Challenge published but today's daily legs could not be generated.",
      };
    }
  }

  return { ok: true };
}

export async function unpublishChallenge(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { error } = await supabase.from("challenges").update({ is_published: false }).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function addMovieToChallenge(
  challengeId: string,
  movieId: string,
  position?: number
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { data: movie, error: movieError } = await supabase
    .from("movies")
    .select("id, is_playable")
    .eq("id", movieId)
    .single();
  if (movieError || !movie) return { error: movieError?.message ?? "Movie not found." };
  if (!movie.is_playable) return { error: "Only playable movies can be added to a challenge." };

  let nextPosition = position;
  if (!nextPosition) {
    const { data: existing } = await supabase
      .from("challenge_movies")
      .select("position")
      .eq("challenge_id", challengeId)
      .order("position", { ascending: false })
      .limit(1);
    nextPosition = existing?.[0]?.position ? existing[0].position + 1 : 1;
  }

  const { error } = await supabase.from("challenge_movies").insert({
    challenge_id: challengeId,
    movie_id: movieId,
    position: nextPosition,
  });
  return error ? { error: error.message } : {};
}

export async function removeMovieFromChallenge(
  challengeId: string,
  movieId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("challenge_movies")
    .delete()
    .eq("challenge_id", challengeId)
    .eq("movie_id", movieId);
  if (error) return { error: error.message };

  const remaining = await getChallengeMovies(challengeId);
  if (remaining.length > 0) {
    return reorderChallengeMovies(
      challengeId,
      remaining.map((m) => m.movie_id)
    );
  }
  return {};
}

export async function reorderChallengeMovies(
  challengeId: string,
  orderedMovieIds: string[]
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();

  for (let i = 0; i < orderedMovieIds.length; i++) {
    const { error } = await supabase
      .from("challenge_movies")
      .update({ position: TEMP_POSITION_BASE + i })
      .eq("challenge_id", challengeId)
      .eq("movie_id", orderedMovieIds[i]);
    if (error) return { error: error.message };
  }

  for (let i = 0; i < orderedMovieIds.length; i++) {
    const { error } = await supabase
      .from("challenge_movies")
      .update({ position: i + 1 })
      .eq("challenge_id", challengeId)
      .eq("movie_id", orderedMovieIds[i]);
    if (error) return { error: error.message };
  }

  return {};
}
