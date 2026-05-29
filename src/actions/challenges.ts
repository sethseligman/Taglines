"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/adminAuth";
import type { ChallengeType, DbChallenge } from "@/types/challenges";

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

export async function publishChallenge(id: string): Promise<PublishChallengeResult> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { data: challenge, error: fetchError } = await supabase
    .from("challenges")
    .select("type")
    .eq("id", id)
    .single();
  if (fetchError || !challenge) return { error: fetchError?.message ?? "Challenge not found." };

  const gate = await validatePublishGate(id, challenge.type as ChallengeType);
  if (!gate.ok) return gate;

  const { error } = await supabase.from("challenges").update({ is_published: true }).eq("id", id);
  return error ? { error: error.message } : { ok: true };
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
      .update({ position: -(i + 1) })
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
