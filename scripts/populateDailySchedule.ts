/**
 * Assign one playable movie per calendar day for 100 consecutive days starting **tomorrow**
 * (machine local timezone): tomorrow through tomorrow + 99. Upserts into public.daily_schedule.
 *
 * Usage (from repo root):
 *   npx tsx scripts/populateDailySchedule.ts
 *
 * Required env (same as other scripts; loads .env if present):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

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

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data: movies, error: listError } = await supabase
    .from("movies")
    .select("id")
    .eq("is_playable", true)
    .order("title", { ascending: true });

  if (listError) {
    console.error("Failed to list movies:", listError.message);
    process.exit(1);
  }
  const ids = (movies ?? []).map((m) => m.id as string);
  if (ids.length < 100) {
    console.error(
      `Need at least 100 playable movies (is_playable = true), ordered by title. Found ${ids.length}. Approve/playable more titles in admin (or import), then re-run this script.`
    );
    process.exit(1);
  }

  const days = 100;
  const start = addDays(new Date(), 1);
  const rows = ids.slice(0, days).map((movie_id, i) => ({
    scheduled_date: localDateKey(addDays(start, i)),
    movie_id,
  }));

  const { error: upsertError } = await supabase.from("daily_schedule").upsert(rows, {
    onConflict: "scheduled_date",
  });

  if (upsertError) {
    console.error("Upsert failed:", upsertError.message);
    process.exit(1);
  }

  console.log(`Upserted ${rows.length} daily_schedule rows.`);
  console.log(`First: ${rows[0]!.scheduled_date} → ${rows[0]!.movie_id}`);
  console.log(`Last:  ${rows[rows.length - 1]!.scheduled_date} → ${rows[rows.length - 1]!.movie_id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
