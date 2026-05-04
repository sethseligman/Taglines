/**
 * Bulk-load AI hints into movies.hint_1..hint_4 from JSON or CSV.
 *
 * Usage:
 *   npx tsx scripts/loadHints.ts
 *   npx tsx scripts/loadHints.ts "scripts/HINT GENERATOR/taglines_hints_output.csv"
 *
 * Default source: scripts/hints.json
 * CSV columns: title, year, hint_1, hint_2, hint_3, hint_4
 *
 * Required env (loads .env from project root if present):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

interface HintRow {
  title: string;
  year: number;
  hint_1: string;
  hint_2: string;
  hint_3: string;
  hint_4: string;
}

function loadEnv(): void {
  const root = resolve(process.cwd(), ".env");
  if (!existsSync(root)) return;
  const content = readFileSync(root, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) return;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^["']|["']$/g, "");
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

function readHintsFromCsv(filePath: string): HintRow[] {
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("CSV is empty or has no data rows");
  }
  const headers = parseCsvLine(lines[0]!);
  const titleIdx = headers.indexOf("title");
  const yearIdx = headers.indexOf("year");
  const h1 = headers.indexOf("hint_1");
  const h2 = headers.indexOf("hint_2");
  const h3 = headers.indexOf("hint_3");
  const h4 = headers.indexOf("hint_4");
  if (titleIdx < 0 || yearIdx < 0 || h1 < 0 || h2 < 0 || h3 < 0 || h4 < 0) {
    throw new Error(
      "CSV must include columns: title, year, hint_1, hint_2, hint_3, hint_4"
    );
  }

  const out: HintRow[] = [];
  for (let lineNum = 1; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;
    if (!line.trim()) continue;
    const values = parseCsvLine(line);
    const yearNum = Number(values[yearIdx]);
    const row: Partial<HintRow> = {
      title: values[titleIdx]?.replace(/^"|"$/g, "") ?? "",
      year: yearNum,
      hint_1: values[h1] ?? "",
      hint_2: values[h2] ?? "",
      hint_3: values[h3] ?? "",
      hint_4: values[h4] ?? "",
    };
    const idx = lineNum + 1;
    if (!row.title?.trim()) throw new Error(`Row ${idx}: missing title`);
    if (!Number.isFinite(yearNum)) throw new Error(`Row ${idx}: invalid year`);
    for (const k of ["hint_1", "hint_2", "hint_3", "hint_4"] as const) {
      if (typeof row[k] !== "string") {
        throw new Error(`Row ${idx}: missing '${k}'`);
      }
    }
    out.push({
      title: row.title.trim(),
      year: yearNum,
      hint_1: row.hint_1!.trim(),
      hint_2: row.hint_2!.trim(),
      hint_3: row.hint_3!.trim(),
      hint_4: row.hint_4!.trim(),
    });
  }
  return out;
}

function readHintsFromJson(): HintRow[] {
  const hintsPath = resolve(process.cwd(), "scripts", "hints.json");
  if (!existsSync(hintsPath)) {
    throw new Error(`Missing hints file at ${hintsPath}`);
  }

  const raw = readFileSync(hintsPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  // Accept either:
  // 1) [ ...rows ]
  // 2) { movies: [ ...rows ] }
  const rows: unknown =
    Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { movies?: unknown[] }).movies)
        ? (parsed as { movies: unknown[] }).movies
        : null;

  if (!Array.isArray(rows)) {
    throw new Error("Invalid hints.json shape. Expected an array or { movies: [...] }.");
  }

  return rows.map((row, i) => {
    const idx = i + 1;
    if (!row || typeof row !== "object") {
      throw new Error(`Row ${idx}: expected an object`);
    }
    const r = row as Partial<HintRow>;
    if (!r.title || typeof r.title !== "string") {
      throw new Error(`Row ${idx}: missing/invalid 'title'`);
    }
    if (!Number.isFinite(r.year)) {
      throw new Error(`Row ${idx}: missing/invalid 'year'`);
    }
    for (const k of ["hint_1", "hint_2", "hint_3", "hint_4"] as const) {
      if (typeof r[k] !== "string") {
        throw new Error(`Row ${idx}: missing/invalid '${k}'`);
      }
    }
    return {
      title: r.title.trim(),
      year: Number(r.year),
      hint_1: (r.hint_1 as string).trim(),
      hint_2: (r.hint_2 as string).trim(),
      hint_3: (r.hint_3 as string).trim(),
      hint_4: (r.hint_4 as string).trim(),
    };
  });
}

function readHintsFile(): HintRow[] {
  const arg = process.argv[2];
  if (arg) {
    const p = resolve(process.cwd(), arg);
    if (!existsSync(p)) {
      throw new Error(`File not found: ${p}`);
    }
    if (p.toLowerCase().endsWith(".csv")) {
      return readHintsFromCsv(p);
    }
    throw new Error("When passing an argument, use a path to a .csv file (or omit for hints.json)");
  }
  return readHintsFromJson();
}

async function main(): Promise<void> {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const rows = readHintsFile();
  if (rows.length === 0) {
    console.log("No rows found in scripts/hints.json");
    return;
  }

  const supabase = createClient(url, key);
  console.log(`Loading hints for ${rows.length} movie(s)...`);

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const n = i + 1;

    const { data: matches, error: selectErr } = await supabase
      .from("movies")
      .select("id,title,year")
      .eq("title", row.title)
      .eq("year", row.year);

    if (selectErr) {
      failed++;
      console.log(
        `[${n}/${rows.length}] FAIL ${row.title} (${row.year}) -> select error: ${selectErr.message}`
      );
      continue;
    }

    if (!matches || matches.length === 0) {
      failed++;
      console.log(`[${n}/${rows.length}] FAIL ${row.title} (${row.year}) -> no movie match`);
      continue;
    }

    if (matches.length > 1) {
      failed++;
      console.log(
        `[${n}/${rows.length}] FAIL ${row.title} (${row.year}) -> multiple matches (${matches.length})`
      );
      continue;
    }

    const movieId = matches[0]!.id as string;
    const { error: updateErr } = await supabase
      .from("movies")
      .update({
        hint_1: row.hint_1,
        hint_2: row.hint_2,
        hint_3: row.hint_3,
        hint_4: row.hint_4,
      })
      .eq("id", movieId);

    if (updateErr) {
      failed++;
      console.log(
        `[${n}/${rows.length}] FAIL ${row.title} (${row.year}) -> update error: ${updateErr.message}`
      );
      continue;
    }

    ok++;
    console.log(`[${n}/${rows.length}] OK   ${row.title} (${row.year})`);
  }

  console.log("\n---");
  console.log(`Success: ${ok}`);
  console.log(`Failed:  ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
