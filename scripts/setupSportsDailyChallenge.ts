/**
 * Create or refresh the Sports Movies daily_pool challenge (5 legs/day).
 * Loads the approved pool from scripts/sportsChallengePool.ts.
 *
 * Usage:
 *   npx tsx scripts/setupSportsDailyChallenge.ts
 *   npx tsx scripts/setupSportsDailyChallenge.ts --force-pool   # replace challenge_movies
 *   npx tsx scripts/setupSportsDailyChallenge.ts --dry-run
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  generateChallengeDailyLegs,
  getTodayDateKey,
  getTomorrowDateKey,
} from "../src/lib/generateChallengeDailyLegs";
import { SPORTS_CHALLENGE_POOL } from "./sportsChallengePool";

const SLUG = "sports-movies";
const LEG_COUNT = 5;
const TEMP_POSITION_BASE = 100_000;

function loadEnv(): void {
  const root = resolve(process.cwd(), ".env");
  if (!existsSync(root)) return;
  readFileSync(root, "utf8")
    .split("\n")
    .forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) return;
      const key = m[1]!.trim();
      const val = m[2]!.trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    });
}

function shufflePositions(count: number): number[] {
  const positions = Array.from({ length: count }, (_, i) => i + 1);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j]!, positions[i]!];
  }
  return positions;
}

async function main(): Promise<void> {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const dryRun = process.argv.includes("--dry-run");
  const forcePool = process.argv.includes("--force-pool");
  const supabase = createClient(url, key);

  const poolIds = [...new Set(SPORTS_CHALLENGE_POOL.map((m) => m.movie_id))];
  console.log(`Sports challenge pool: ${poolIds.length} movies, ${LEG_COUNT} legs/day`);

  if (poolIds.length < 30) {
    throw new Error(`Pool needs at least 30 movies for daily_pool (have ${poolIds.length})`);
  }

  // Verify all pool movies are playable
  const { data: poolMovies, error: poolErr } = await supabase
    .from("movies")
    .select("id, title, year, is_playable, status")
    .in("id", poolIds);
  if (poolErr) throw poolErr;

  const notPlayable = (poolMovies ?? []).filter((m) => !m.is_playable || m.status !== "approved");
  if (notPlayable.length) {
    throw new Error(
      `Pool has ${notPlayable.length} non-playable movie(s): ${notPlayable
        .slice(0, 5)
        .map((m) => `${m.title} (${m.year})`)
        .join(", ")}`
    );
  }

  let { data: challenge } = await supabase
    .from("challenges")
    .select("id, slug, is_published")
    .eq("slug", SLUG)
    .maybeSingle();

  const challengeMeta = {
    slug: SLUG,
    title: "Sports Movies",
    eyebrow: "Sports",
    type: "daily_pool" as const,
    leg_count: LEG_COUNT,
    portal_sort_order: 3,
    art_config: { backgroundUrl: "/images/challenges/sports-movies.jpg" },
    is_published: true,
  };

  if (!challenge) {
    if (dryRun) {
      console.log("[dry-run] Would create challenge", challengeMeta);
    } else {
      const { data: created, error } = await supabase
        .from("challenges")
        .insert(challengeMeta)
        .select("id, slug, is_published")
        .single();
      if (error) throw error;
      challenge = created;
      console.log("Created challenge:", SLUG);
    }
  } else if (!dryRun) {
    const { error } = await supabase.from("challenges").update(challengeMeta).eq("id", challenge.id);
    if (error) throw error;
    console.log("Updated challenge metadata:", SLUG);
  }

  const challengeId = challenge?.id;
  if (!challengeId) {
    console.log("[dry-run] Stopping before pool/legs (no challenge id).");
    return;
  }

  const { count: existingPoolCount } = await supabase
    .from("challenge_movies")
    .select("*", { count: "exact", head: true })
    .eq("challenge_id", challengeId);

  const needsPool = forcePool || (existingPoolCount ?? 0) === 0;
  if (needsPool) {
    if (dryRun) {
      console.log(`[dry-run] Would insert ${poolIds.length} movies into challenge_movies`);
    } else {
      await supabase.from("challenge_movies").delete().eq("challenge_id", challengeId);
      const positions = shufflePositions(poolIds.length);
      const rows = poolIds.map((movie_id, i) => ({
        challenge_id: challengeId,
        movie_id,
        position: positions[i]!,
      }));
      const CHUNK = 100;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabase.from("challenge_movies").insert(rows.slice(i, i + CHUNK));
        if (error) throw error;
      }
      console.log(`Loaded ${rows.length} movies into challenge pool`);
    }
  } else {
    console.log(`Pool already has ${existingPoolCount} movies (use --force-pool to replace)`);
  }

  for (const targetDate of [getTodayDateKey(), getTomorrowDateKey()]) {
    if (dryRun) {
      console.log(`[dry-run] Would generate daily legs for ${targetDate}`);
      continue;
    }
    const summary = await generateChallengeDailyLegs({
      targetDate,
      challengeSlug: SLUG,
      supabase,
    });
    const result = summary.results[0];
    console.log(
      `${targetDate}: ${result?.status ?? "n/a"}` +
        (result?.rowsInserted ? ` (${result.rowsInserted} legs)` : "")
    );
    if (result?.error) throw new Error(result.error);
  }

  if (!dryRun) {
    const { data: todayLegs } = await supabase
      .from("challenge_daily_legs")
      .select("position, movies(title, year)")
      .eq("challenge_id", challengeId)
      .eq("scheduled_date", getTodayDateKey())
      .order("position");
    console.log(`\nToday's ${LEG_COUNT} legs (${getTodayDateKey()}):`);
    for (const leg of todayLegs ?? []) {
      const movie = leg.movies as { title: string; year: number } | { title: string; year: number }[] | null;
      const m = Array.isArray(movie) ? movie[0] : movie;
      console.log(`  ${leg.position}. ${m?.title} (${m?.year})`);
    }
  }

  console.log("\nDone. Portal: /challenges/sports-movies");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
