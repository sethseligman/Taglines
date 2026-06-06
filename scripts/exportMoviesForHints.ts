/**
 * Export movies from Supabase into the hint generator input CSV format.
 *
 * Usage:
 *   npx tsx scripts/exportMoviesForHints.ts
 *   npx tsx scripts/exportMoviesForHints.ts --all
 *
 * Default: only movies missing hint_1 (still need generation).
 * Output: scripts/HINT GENERATOR/movies_for_hints.csv
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

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

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function main(): Promise<void> {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const includeAll = process.argv.includes("--all");
  const supabase = createClient(url, key);

  let query = supabase
    .from("movies")
    .select("id, title, year, genre, cast_hint, plot_hint, hint_1")
    .order("title");

  if (!includeAll) {
    query = query.is("hint_1", null);
  }

  const { data: movies, error } = await query;
  if (error) {
    console.error("Failed to fetch movies:", error.message);
    process.exit(1);
  }
  if (!movies?.length) {
    console.log(includeAll ? "No movies found." : "All movies already have hint_1 — nothing to export.");
    return;
  }

  const movieIds = movies.map((m) => m.id as string);
  const taglineByMovie = new Map<string, string>();
  const CHUNK = 100;
  for (let i = 0; i < movieIds.length; i += CHUNK) {
    const chunk = movieIds.slice(i, i + CHUNK);
    const { data: taglines, error: taglineErr } = await supabase
      .from("taglines")
      .select("movie_id, tagline_text, is_primary")
      .in("movie_id", chunk)
      .eq("is_primary", true);
    if (taglineErr) {
      console.error("Failed to fetch taglines:", taglineErr.message);
      process.exit(1);
    }
    for (const t of taglines ?? []) {
      taglineByMovie.set(t.movie_id as string, t.tagline_text as string);
    }
  }

  const header = "title,year,genre,cast_hint,director,plot_hint,tagline_text\n";
  const rows: string[] = [];
  let skippedNoTagline = 0;

  for (const m of movies) {
    const tagline = taglineByMovie.get(m.id as string)?.trim();
    if (!tagline) {
      skippedNoTagline++;
      continue;
    }
    rows.push(
      [
        escapeCsv(String(m.title)),
        m.year,
        escapeCsv(String(m.genre ?? "")),
        escapeCsv(String(m.cast_hint ?? "")),
        "",
        escapeCsv(String(m.plot_hint ?? "")),
        escapeCsv(tagline),
      ].join(",")
    );
  }

  const outArg = process.argv.find((a) => a.startsWith("--output="));
  const outPath = outArg
    ? resolve(process.cwd(), outArg.slice("--output=".length))
    : resolve(process.cwd(), "scripts/HINT GENERATOR/movies_for_hints.csv");
  writeFileSync(outPath, header + rows.join("\n") + "\n");

  console.log(`Exported ${rows.length} movie(s) to ${outPath}`);
  if (skippedNoTagline) {
    console.log(`Skipped ${skippedNoTagline} without a primary tagline.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
