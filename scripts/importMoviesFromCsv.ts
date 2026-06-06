/**
 * Import movies from a CSV with manual taglines (bypasses TMDB tagline requirement).
 *
 * Usage:
 *   npx tsx scripts/importMoviesFromCsv.ts
 *   npx tsx scripts/importMoviesFromCsv.ts "scripts/HINT GENERATOR/movies_sports_missing_taglines.csv"
 *   npx tsx scripts/importMoviesFromCsv.ts --dry-run
 *
 * CSV columns: title, year, genre, cast_hint, director, plot_hint, tagline_text
 * Rows with an empty tagline_text are skipped.
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

interface CsvMovieRow {
  title: string;
  year: number;
  genre: string;
  cast_hint: string;
  plot_hint: string;
  tagline_text: string;
}

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

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeTitleForDedup(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[''’.,\-:;!?()\[\]{}"\/\\@#$%^&*+=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readCsv(filePath: string): CsvMovieRow[] {
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV is empty or has no data rows");

  const headers = parseCsvLine(lines[0]!);
  const titleIdx = headers.indexOf("title");
  const yearIdx = headers.indexOf("year");
  const genreIdx = headers.indexOf("genre");
  const castIdx = headers.indexOf("cast_hint");
  const plotIdx = headers.indexOf("plot_hint");
  const taglineIdx = headers.indexOf("tagline_text");
  if (titleIdx < 0 || yearIdx < 0 || taglineIdx < 0) {
    throw new Error("CSV must include title, year, and tagline_text columns");
  }

  const rows: CsvMovieRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    const title = cols[titleIdx] ?? "";
    const year = parseInt(cols[yearIdx] ?? "", 10);
    if (!title || !Number.isFinite(year)) continue;
    rows.push({
      title,
      year,
      genre: genreIdx >= 0 ? cols[genreIdx] ?? "" : "",
      cast_hint: castIdx >= 0 ? cols[castIdx] ?? "" : "",
      plot_hint: plotIdx >= 0 ? (cols[plotIdx] ?? "").slice(0, 1000) : "",
      tagline_text: cols[taglineIdx] ?? "",
    });
  }
  return rows;
}

async function main(): Promise<void> {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");
  const fileArg = process.argv.find((a) => a.endsWith(".csv"));
  const filePath = resolve(
    process.cwd(),
    fileArg ?? "scripts/HINT GENERATOR/movies_sports_missing_taglines.csv"
  );
  const rows = readCsv(filePath);
  const supabase = createClient(url, key);

  console.log(`${dryRun ? "[dry-run] " : ""}Reading ${rows.length} row(s) from ${filePath}\n`);

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const label = `${row.title} (${row.year})`;
    if (!row.tagline_text.trim()) {
      skipped++;
      console.log(`[skip] ${label}: tagline_text is empty`);
      continue;
    }

    const { data: existingRows } = await supabase.from("movies").select("id, title, year");
    const exists = (existingRows ?? []).find(
      (m: { id: string; title: string; year: number }) =>
        m.year === row.year && normalizeTitleForDedup(m.title) === normalizeTitleForDedup(row.title)
    );
    if (exists) {
      skipped++;
      console.log(`[skip] ${label}: already exists (id=${exists.id})`);
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would insert ${label}`);
      inserted++;
      continue;
    }

    const { data: movie, error: movieErr } = await supabase
      .from("movies")
      .insert({
        title: row.title.trim(),
        year: row.year,
        genre: row.genre.trim(),
        cast_hint: row.cast_hint.trim(),
        plot_hint: row.plot_hint.trim(),
        status: "pending_review",
        is_playable: false,
      })
      .select("id")
      .single();

    if (movieErr || !movie) {
      console.error(`[error] ${label}: ${movieErr?.message ?? "insert failed"}`);
      process.exit(1);
    }

    const movieId = movie.id as string;
    const { error: taglineErr } = await supabase.from("taglines").insert({
      movie_id: movieId,
      tagline_text: row.tagline_text.trim(),
      is_primary: true,
    });
    if (taglineErr) {
      console.error(`[error] ${label}: tagline insert failed — ${taglineErr.message}`);
      process.exit(1);
    }

    const { error: aliasErr } = await supabase.from("accepted_aliases").insert({
      movie_id: movieId,
      alias: row.title.trim(),
    });
    if (aliasErr && aliasErr.code !== "23505") {
      console.error(`[error] ${label}: alias insert failed — ${aliasErr.message}`);
      process.exit(1);
    }

    inserted++;
    console.log(`[inserted] ${label}`);
  }

  console.log(`\nInserted: ${inserted}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
