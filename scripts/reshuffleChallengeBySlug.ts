/**
 * One-time admin utility: reshuffle challenge_movies positions for a published challenge.
 * Usage: npx tsx scripts/reshuffleChallengeBySlug.ts indiana-jones
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env optional if vars already exported
  }
}

loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const slug = process.argv[2] ?? "indiana-jones";

function shufflePositions(count: number): number[] {
  const positions = Array.from({ length: count }, (_, i) => i + 1);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j]!, positions[i]!];
  }
  return positions;
}

async function main() {
  const supabase = createClient(url!, key!);

  const { data: challenge, error: cErr } = await supabase
    .from("challenges")
    .select("id, title, slug, is_published")
    .eq("slug", slug)
    .single();
  if (cErr || !challenge) {
    console.error("Challenge not found:", cErr?.message);
    process.exit(1);
  }
  if (!challenge.is_published) {
    console.error("Challenge is not published.");
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .from("challenge_movies")
    .select("id, position, movies(title, year)")
    .eq("challenge_id", challenge.id)
    .order("position", { ascending: true });
  if (error || !rows?.length) {
    console.error("No movies:", error?.message);
    process.exit(1);
  }

  const TEMP_POSITION_BASE = 100_000;
  const shuffled = shufflePositions(rows.length);

  for (let i = 0; i < rows.length; i++) {
    await supabase.from("challenge_movies").update({ position: TEMP_POSITION_BASE + i }).eq("id", rows[i]!.id);
  }
  for (let i = 0; i < rows.length; i++) {
    await supabase.from("challenge_movies").update({ position: shuffled[i] }).eq("id", rows[i]!.id);
  }

  const order = rows
    .map((row, i) => {
      const movie = row.movies as { title: string; year: number } | { title: string; year: number }[] | null;
      const m = Array.isArray(movie) ? movie[0] : movie;
      return { position: shuffled[i]!, title: m?.title ?? "?", year: m?.year ?? 0 };
    })
    .sort((a, b) => a.position - b.position);

  console.log(`Reshuffled "${challenge.title}" (${slug}):`);
  for (const item of order) {
    console.log(`  ${item.position}. ${item.title} (${item.year})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
