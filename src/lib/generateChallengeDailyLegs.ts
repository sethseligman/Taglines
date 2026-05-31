import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface GenerateChallengeDailyLegsOptions {
  /** YYYY-MM-DD (UTC); defaults to tomorrow UTC. */
  targetDate?: string;
  /** Limit to one challenge slug (e.g. manual admin run). */
  challengeSlug?: string;
  supabase?: SupabaseClient;
}

export interface ChallengeDailyLegsResult {
  challengeId: string;
  slug: string;
  title: string;
  status: "skipped" | "generated" | "error";
  targetDate: string;
  rowsInserted?: number;
  movieIds?: string[];
  error?: string;
}

export interface GenerateChallengeDailyLegsSummary {
  targetDate: string;
  results: ChallengeDailyLegsResult[];
  generatedCount: number;
  skippedCount: number;
  errorCount: number;
}

export function getTodayDateKey(from = new Date()): string {
  return from.toISOString().slice(0, 10);
}

export function getTomorrowDateKey(from = new Date()): string {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1))
    .toISOString()
    .slice(0, 10);
}

function createServiceSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key);
}

/** Fisher–Yates partial shuffle — truly random, no duplicates. */
export function pickRandomIds(pool: string[], count: number): string[] {
  if (count <= 0) return [];
  if (pool.length < count) {
    throw new Error(`Pool has ${pool.length} movies but ${count} are required`);
  }
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, count);
}

async function generateForChallenge(
  supabase: SupabaseClient,
  challenge: { id: string; slug: string; title: string; leg_count: number },
  targetDate: string
): Promise<ChallengeDailyLegsResult> {
  const base: ChallengeDailyLegsResult = {
    challengeId: challenge.id,
    slug: challenge.slug,
    title: challenge.title,
    status: "skipped",
    targetDate,
  };

  const { count: existingCount, error: existingError } = await supabase
    .from("challenge_daily_legs")
    .select("*", { count: "exact", head: true })
    .eq("challenge_id", challenge.id)
    .eq("scheduled_date", targetDate);

  if (existingError) {
    return { ...base, status: "error", error: existingError.message };
  }
  if ((existingCount ?? 0) > 0) {
    return { ...base, status: "skipped", rowsInserted: 0 };
  }

  const { data: poolRows, error: poolError } = await supabase
    .from("challenge_movies")
    .select("movie_id")
    .eq("challenge_id", challenge.id);

  if (poolError) {
    return { ...base, status: "error", error: poolError.message };
  }

  const poolIds = (poolRows ?? []).map((row) => row.movie_id as string);
  if (poolIds.length < challenge.leg_count) {
    return {
      ...base,
      status: "error",
      error: `Pool has ${poolIds.length} movies but leg_count is ${challenge.leg_count}`,
    };
  }

  let selected: string[];
  try {
    selected = pickRandomIds(poolIds, challenge.leg_count);
  } catch (err) {
    return {
      ...base,
      status: "error",
      error: err instanceof Error ? err.message : "Random selection failed",
    };
  }

  const rows = selected.map((movie_id, index) => ({
    challenge_id: challenge.id,
    scheduled_date: targetDate,
    position: index + 1,
    movie_id,
  }));

  const { error: insertError } = await supabase.from("challenge_daily_legs").insert(rows);
  if (insertError) {
    return { ...base, status: "error", error: insertError.message };
  }

  return {
    ...base,
    status: "generated",
    rowsInserted: rows.length,
    movieIds: selected,
  };
}

export async function generateChallengeDailyLegs(
  options: GenerateChallengeDailyLegsOptions = {}
): Promise<GenerateChallengeDailyLegsSummary> {
  const supabase = options.supabase ?? createServiceSupabase();
  const targetDate = options.targetDate ?? getTomorrowDateKey();

  let query = supabase
    .from("challenges")
    .select("id, slug, title, leg_count")
    .eq("type", "daily_pool")
    .eq("is_published", true);

  if (options.challengeSlug) {
    query = query.eq("slug", options.challengeSlug);
  }

  const { data: challenges, error: listError } = await query.order("portal_sort_order", {
    ascending: true,
    nullsFirst: false,
  });

  if (listError) {
    throw new Error(listError.message);
  }

  const results: ChallengeDailyLegsResult[] = [];
  for (const challenge of challenges ?? []) {
    results.push(
      await generateForChallenge(
        supabase,
        {
          id: challenge.id as string,
          slug: challenge.slug as string,
          title: challenge.title as string,
          leg_count: challenge.leg_count as number,
        },
        targetDate
      )
    );
  }

  return {
    targetDate,
    results,
    generatedCount: results.filter((r) => r.status === "generated").length,
    skippedCount: results.filter((r) => r.status === "skipped").length,
    errorCount: results.filter((r) => r.status === "error").length,
  };
}
