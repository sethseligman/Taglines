/**
 * Import all starter movies from scripts/starterMovies.ts.
 * Uses the same logic as importMovie.ts; skips duplicates and empty taglines.
 *
 * Usage:
 *   npx tsx scripts/importMovieList.ts
 *
 * Requires same env as importMovie.ts (TMDB_ACCESS_TOKEN, Supabase URL + service key).
 * Loads .env from project root. Adds a short delay between requests to be nice to TMDB.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { importOneMovie } from "./importMovie";
import { STARTER_MOVIES } from "./starterMovies";

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

const DELAY_MS = 400;

async function main(): Promise<void> {
  console.log(`Importing ${STARTER_MOVIES.length} movies from starter list...\n`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < STARTER_MOVIES.length; i++) {
    const title = STARTER_MOVIES[i]!;
    const n = i + 1;
    process.stdout.write(`[${n}/${STARTER_MOVIES.length}] ${title} ... `);

    const result = await importOneMovie(title);

    if (result.outcome === "inserted") {
      inserted++;
      console.log(`inserted (${result.title} ${result.year})`);
    } else if (result.outcome === "skipped") {
      skipped++;
      console.log(`skipped: ${result.reason}`);
    } else {
      errors++;
      console.log(`error: ${result.message}`);
    }

    if (i < STARTER_MOVIES.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log("\n---");
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
