/**
 * Remove TMDB wrong-match rows from the bulk import and insert the correct films by TMDB id.
 *
 * Usage:
 *   npx tsx scripts/fixMisimportedMovies.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { importMovieByTmdbId } from "./importMovie";

function loadEnv(): void {
  const root = resolve(process.cwd(), ".env");
  if (!existsSync(root)) return;
  readFileSync(root, "utf8").split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) return;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  });
}

/** Wrong rows created when TMDB search returned a sequel/reboot/other film. */
const WRONG_MOVIE_IDS = [
  "70f57eaa-e90f-48fb-890a-8224245f020d", // The Crucifix: Blood of the Exorcist (wanted The Exorcist — already in DB)
  "79455942-24d1-4dd5-959d-0ea78ff46a6f", // Predator: Badlands
  "c6700143-0a84-451b-aad0-85a8cd3d2510", // Beetlejuice Beetlejuice (1988 original already in DB)
  "f67d3fe0-edd1-4a99-b44d-8d38740fce44", // Tom Clancy's Jack Ryan: Ghost War
  "d687b355-35c7-4035-93f5-0e72113c6d6e", // Lee Cronin's The Mummy
  "a59d2a15-ef79-47c2-8d93-888cff1b49da", // Scream 7
  "67d1446c-0008-4d6a-ba26-01ce3729687b", // Balls Up
  "8cbedab1-0a17-4452-b9e8-d938c5fcb6f1", // Greenland 2: Migration
  "3ef1710b-ed5f-4e10-a842-4bbe609f33b8", // 10 Plus 10
  "1e3ed9fe-8087-42fb-991e-3a55e22ac3c7", // Five Nights at Freddy's 2
  "7bf49144-6aa7-44be-814b-bce5a811d0df", // How to Train Your Dragon (2025 live-action)
];

/** Correct TMDB movie ids for titles that were missing or mis-imported. */
const CORRECT_TMDB_IDS: { label: string; tmdbId: number }[] = [
  { label: "Predator (1987)", tmdbId: 106 },
  { label: "Ghost (1990)", tmdbId: 251 },
  { label: "The Mummy (1999)", tmdbId: 564 },
  { label: "Scream (1996)", tmdbId: 4232 },
  { label: "Up (2009)", tmdbId: 14160 },
  { label: "Zootopia (2016)", tmdbId: 269149 },
  { label: "Migration (2023)", tmdbId: 940551 },
  { label: "10 (1979)", tmdbId: 9051 },
  { label: "Five Nights at Freddy's (2023)", tmdbId: 507089 },
  { label: "How to Train Your Dragon (2010)", tmdbId: 10191 },
];

async function main(): Promise<void> {
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase env vars.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log("Deleting wrong TMDB matches...\n");
  let deleted = 0;
  for (const id of WRONG_MOVIE_IDS) {
    const { data: row } = await supabase.from("movies").select("title, year").eq("id", id).maybeSingle();
    if (!row) {
      console.log(`  skip delete (not found): ${id}`);
      continue;
    }

    const { error } = await supabase.from("movies").delete().eq("id", id);
    if (error) {
      console.error(`  FAILED delete ${row.title} (${row.year}): ${error.message}`);
      process.exit(1);
    }
    deleted++;
    console.log(`  deleted: ${row.title} (${row.year})`);
  }

  console.log(`\nDeleted ${deleted} wrong rows.\n`);
  console.log("Importing correct films by TMDB id...\n");

  let inserted = 0;
  let skipped = 0;
  for (const { label, tmdbId } of CORRECT_TMDB_IDS) {
    process.stdout.write(`  ${label} (tmdb ${tmdbId}) ... `);
    const result = await importMovieByTmdbId(tmdbId);
    if (result.outcome === "inserted") {
      inserted++;
      console.log(`inserted (${result.title} ${result.year})`);
    } else if (result.outcome === "skipped") {
      skipped++;
      console.log(`skipped: ${result.reason}`);
    } else {
      console.log(`error: ${result.message}`);
      process.exit(1);
    }
  }

  console.log("\n---");
  console.log(`Deleted: ${deleted}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (already present): ${skipped}`);
  console.log("\nNote: Jurassic World Rebirth and Zootopia 2 were kept — they are valid list entries.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
