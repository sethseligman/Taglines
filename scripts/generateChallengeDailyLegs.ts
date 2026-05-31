/**
 * Generate one day's legs for all published daily_pool challenges.
 *
 * Usage (from repo root):
 *   npx tsx scripts/generateChallengeDailyLegs.ts
 *   npx tsx scripts/generateChallengeDailyLegs.ts --today
 *   npx tsx scripts/generateChallengeDailyLegs.ts --today --slug=80s-movies
 *   npx tsx scripts/generateChallengeDailyLegs.ts --date=2026-05-27
 *
 * Default target date is tomorrow (UTC). Loads .env if present.
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  generateChallengeDailyLegs,
  getTodayDateKey,
  getTomorrowDateKey,
} from "../src/lib/generateChallengeDailyLegs";

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

function parseArgs(argv: string[]): { targetDate?: string; challengeSlug?: string } {
  let targetDate: string | undefined;
  let challengeSlug: string | undefined;

  for (const arg of argv) {
    if (arg === "--today") {
      targetDate = getTodayDateKey();
      continue;
    }
    if (arg.startsWith("--date=")) {
      targetDate = arg.slice("--date=".length);
      continue;
    }
    if (arg.startsWith("--slug=")) {
      challengeSlug = arg.slice("--slug=".length);
      continue;
    }
  }

  return { targetDate, challengeSlug };
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const targetDate = args.targetDate ?? getTomorrowDateKey();

  const summary = await generateChallengeDailyLegs({
    targetDate,
    challengeSlug: args.challengeSlug,
  });

  console.log(`Target date: ${summary.targetDate}`);
  console.log(
    `Generated: ${summary.generatedCount}, skipped: ${summary.skippedCount}, errors: ${summary.errorCount}`
  );

  for (const result of summary.results) {
    console.log("");
    console.log(`${result.slug} (${result.title}) — ${result.status}`);
    if (result.rowsInserted !== undefined) {
      console.log(`  rows inserted: ${result.rowsInserted}`);
    }
    if (result.movieIds?.length) {
      console.log(`  movie IDs: ${result.movieIds.join(", ")}`);
    }
    if (result.error) {
      console.error(`  error: ${result.error}`);
    }
  }

  if (summary.errorCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
