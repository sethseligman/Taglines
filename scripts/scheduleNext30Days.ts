/**
 * One-off: upsert 30 rows into public.daily_schedule (fixed dates + titles from product spec).
 *
 * Usage (from repo root):
 *   npx tsx scripts/scheduleNext30Days.ts
 *
 * Required env (loads .env from project root if present; same as other scripts):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function loadEnv(): void {
  const root = resolve(process.cwd(), ".env");
  if (!existsSync(root)) return;
  const content = readFileSync(root, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1]!.trim();
      const val = m[2]!.trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  });
}

const SCHEDULE: ReadonlyArray<{ scheduled_date: string; title: string; year: number }> = [
  { scheduled_date: "2026-05-11", title: "Star Wars", year: 1977 },
  { scheduled_date: "2026-05-12", title: "The Hangover", year: 2009 },
  { scheduled_date: "2026-05-13", title: "Jaws", year: 1975 },
  { scheduled_date: "2026-05-14", title: "Mean Girls", year: 2004 },
  { scheduled_date: "2026-05-15", title: "The Empire Strikes Back", year: 1980 },
  { scheduled_date: "2026-05-16", title: "Rocky", year: 1976 },
  { scheduled_date: "2026-05-17", title: "Inception", year: 2010 },
  { scheduled_date: "2026-05-18", title: "Ferris Bueller's Day Off", year: 1986 },
  { scheduled_date: "2026-05-19", title: "The Godfather", year: 1972 },
  { scheduled_date: "2026-05-20", title: "Mrs. Doubtfire", year: 1993 },
  { scheduled_date: "2026-05-21", title: "Raiders of the Lost Ark", year: 1981 },
  { scheduled_date: "2026-05-22", title: "Legally Blonde", year: 2001 },
  { scheduled_date: "2026-05-23", title: "The Sixth Sense", year: 1999 },
  { scheduled_date: "2026-05-24", title: "Shrek", year: 2001 },
  { scheduled_date: "2026-05-25", title: "Saving Private Ryan", year: 1998 },
  { scheduled_date: "2026-05-26", title: "Ghostbusters", year: 1984 },
  { scheduled_date: "2026-05-27", title: "The Breakfast Club", year: 1985 },
  { scheduled_date: "2026-05-28", title: "Top Gun", year: 1986 },
  { scheduled_date: "2026-05-29", title: "Gladiator", year: 2000 },
  { scheduled_date: "2026-05-30", title: "E.T. the Extra-Terrestrial", year: 1982 },
  { scheduled_date: "2026-05-31", title: "Frozen", year: 2013 },
  { scheduled_date: "2026-06-01", title: "Fight Club", year: 1999 },
  { scheduled_date: "2026-06-02", title: "Groundhog Day", year: 1993 },
  { scheduled_date: "2026-06-03", title: "The Avengers", year: 2012 },
  { scheduled_date: "2026-06-04", title: "Back to the Future", year: 1985 },
  { scheduled_date: "2026-06-05", title: "Se7en", year: 1995 },
  { scheduled_date: "2026-06-06", title: "The Shining", year: 1980 },
  { scheduled_date: "2026-06-07", title: "Toy Story 2", year: 1999 },
  { scheduled_date: "2026-06-08", title: "Superbad", year: 2007 },
  { scheduled_date: "2026-06-09", title: "The Dark Knight Rises", year: 2012 },
];

async function main(): Promise<void> {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const resolved: Array<{ scheduled_date: string; movie_id: string; title: string; year: number }> = [];

  for (let i = 0; i < SCHEDULE.length; i++) {
    const row = SCHEDULE[i]!;
    const n = i + 1;
    const { data, error } = await supabase
      .from("movies")
      .select("id")
      .eq("title", row.title)
      .eq("year", row.year)
      .maybeSingle();

    if (error) {
      console.error(`Lookup failed for "${row.title}" (${row.year}):`, error.message);
      process.exit(1);
    }
    if (!data?.id) {
      console.error(`Movie not found in DB (aborting, no writes): "${row.title}" (${row.year})`);
      process.exit(1);
    }

    const movie_id = data.id as string;
    console.log(`${n}/30 — ${row.scheduled_date} — ${row.title} (${row.year}) → movie_id=${movie_id}`);
    resolved.push({ scheduled_date: row.scheduled_date, movie_id, title: row.title, year: row.year });
  }

  const upsertRows = resolved.map((r) => ({ scheduled_date: r.scheduled_date, movie_id: r.movie_id }));

  const { error: upsertError } = await supabase.from("daily_schedule").upsert(upsertRows, {
    onConflict: "scheduled_date",
  });

  if (upsertError) {
    console.error("Upsert failed:", upsertError.message);
    process.exit(1);
  }

  console.log("");
  console.log(`Summary: upserted ${upsertRows.length} daily_schedule rows (${SCHEDULE[0]!.scheduled_date} … ${SCHEDULE[SCHEDULE.length - 1]!.scheduled_date}).`);

  const dates = SCHEDULE.map((r) => r.scheduled_date);
  const { data: verify, error: verifyError } = await supabase
    .from("daily_schedule")
    .select("scheduled_date, movie_id, movies(title, year)")
    .in("scheduled_date", dates)
    .order("scheduled_date", { ascending: true });

  if (verifyError) {
    console.error("Verification query failed:", verifyError.message);
    process.exit(1);
  }

  console.log("");
  console.log("Verification — all 30 rows in DB:");
  for (const r of verify ?? []) {
    const rel = r.movies as { title: string; year: number } | { title: string; year: number }[] | null;
    const m = Array.isArray(rel) ? rel[0] : rel;
    const title = m?.title ?? "?";
    const year = m?.year ?? "?";
    console.log(`  ${r.scheduled_date}  ${title} (${year})  movie_id=${r.movie_id}`);
  }
  if ((verify ?? []).length !== 30) {
    console.warn(`Expected 30 verification rows, got ${(verify ?? []).length}.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
