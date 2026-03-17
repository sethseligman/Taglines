"use server";

import type { DbMovie, DbTagline, DbAcceptedAlias, DbDailySchedule } from "@/types/database";
import { createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/adminAuth";

async function requireAdmin() {
  const ok = await isAdmin();
  if (!ok) throw new Error("Unauthorized");
}

export async function adminCreateMovie(payload: {
  title: string;
  year: number;
  genre: string;
  cast_hint: string;
  plot_hint: string;
}): Promise<{ id: string } | { error: string }> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("movies")
    .insert({
      title: payload.title,
      year: payload.year,
      genre: payload.genre,
      cast_hint: payload.cast_hint,
      plot_hint: payload.plot_hint,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function adminUpdateMovie(
  id: string,
  payload: Partial<Pick<DbMovie, "title" | "year" | "genre" | "cast_hint" | "plot_hint" | "poster_url" | "poster_path" | "status" | "is_playable">>
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { error } = await supabase.from("movies").update(payload).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function adminDeleteMovie(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { error } = await supabase.from("movies").delete().eq("id", id);
  return error ? { error: error.message } : {};
}

export async function adminSetTaglines(movieId: string, taglines: { tagline_text: string; is_primary: boolean }[]): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();
  await supabase.from("taglines").delete().eq("movie_id", movieId);
  if (taglines.length) {
    const rows = taglines.map((t) => ({ movie_id: movieId, tagline_text: t.tagline_text, is_primary: t.is_primary }));
    const { error } = await supabase.from("taglines").insert(rows);
    if (error) return { error: error.message };
  }
  return {};
}

export async function adminSetAliases(movieId: string, aliases: string[]): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();
  await supabase.from("accepted_aliases").delete().eq("movie_id", movieId);
  const trimmed = [...new Set(aliases.map((a) => a.trim()).filter(Boolean))];
  if (trimmed.length) {
    const rows = trimmed.map((alias) => ({ movie_id: movieId, alias }));
    const { error } = await supabase.from("accepted_aliases").insert(rows);
    if (error) return { error: error.message };
  }
  return {};
}

export async function adminSetDailyMovie(scheduledDate: string, movieId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { data: movie } = await supabase.from("movies").select("is_playable").eq("id", movieId).single();
  if (!movie?.is_playable) {
    return { error: "Only playable movies can be scheduled." };
  }
  const { error } = await supabase.from("daily_schedule").upsert(
    { scheduled_date: scheduledDate, movie_id: movieId },
    { onConflict: "scheduled_date" }
  );
  return error ? { error: error.message } : {};
}

export async function adminRemoveDailyMovie(scheduledDate: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { error } = await supabase.from("daily_schedule").delete().eq("scheduled_date", scheduledDate);
  return error ? { error: error.message } : {};
}
