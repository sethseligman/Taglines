/**
 * Build the approved sports challenge pool from the PDF master list + Supabase.
 *
 * Includes pre-catalog sports films and newly imported titles.
 * Excludes rejected movies and anything not approved + playable.
 *
 * Usage: npx tsx scripts/exportSportsChallengePool.ts
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { SPORTS_MOVIES_MASTER, type SportsMasterEntry } from "./sportsMoviesMaster";

const PAGE = 1000;

interface DbMovieRow {
  id: string;
  title: string;
  year: number;
  status: string;
  is_playable: boolean;
}

export interface SportsChallengePoolEntry {
  movie_id: string;
  title: string;
  year: number;
  category: string;
  list_num: number;
  list_title: string;
  source: "pre_catalog" | "imported";
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

function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[''’.,\-:;!?()\[\]{}"\/\\@#$%^&*+=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleKeys(title: string): string[] {
  const norm = normalizeTitle(title);
  const keys = [norm];
  if (norm.startsWith("the ")) keys.push(norm.slice(4));
  else keys.push(`the ${norm}`);
  return keys;
}

function titlesMatch(a: string, b: string): boolean {
  const keysA = titleKeys(a);
  return titleKeys(b).some((k) => keysA.includes(k));
}

function catalogTitleFor(entry: SportsMasterEntry): string {
  if (entry.catalogTitle) return entry.catalogTitle;
  const parsed = entry.listTitle.match(/^(.+?)\s*[—–-]\s*(\d{4})$/);
  return parsed ? parsed[1]!.trim() : entry.listTitle.trim();
}

function yearFor(entry: SportsMasterEntry): number | undefined {
  if (entry.year !== undefined) return entry.year;
  const parsed = entry.listTitle.match(/[—–-]\s*(\d{4})$/);
  return parsed ? parseInt(parsed[1]!, 10) : undefined;
}

async function fetchAllMovies(supabase: ReturnType<typeof createClient>): Promise<DbMovieRow[]> {
  const rows: DbMovieRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("movies")
      .select("id, title, year, status, is_playable")
      .order("title")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as DbMovieRow[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

function findMatch(entry: SportsMasterEntry, movies: DbMovieRow[]): DbMovieRow | null {
  const title = catalogTitleFor(entry);
  const year = yearFor(entry);

  let candidates = movies.filter((m) => titlesMatch(m.title, title));
  if (year !== undefined) {
    candidates = candidates.filter((m) => m.year === year);
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  // Ambiguous (same title, multiple years, no year on master entry): prefer playable approved
  return (
    candidates.find((m) => m.status === "approved" && m.is_playable) ??
    candidates.find((m) => m.status === "approved") ??
    candidates[0]!
  );
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function main(): Promise<void> {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const supabase = createClient(url, key);
  const movies = await fetchAllMovies(supabase);
  const importedNorm = new Set(
    (await import("./sportsMoviesMissing")).SPORTS_MOVIES_MISSING.map((e) => {
      const t = e.catalogTitle ?? e.title;
      return `${normalizeTitle(t)}|${e.year ?? ""}`;
    })
  );

  const pool: SportsChallengePoolEntry[] = [];
  const rejected: string[] = [];
  const notApproved: string[] = [];
  const notInCatalog: string[] = [];
  const usedIds = new Set<string>();

  for (const entry of SPORTS_MOVIES_MASTER) {
    const match = findMatch(entry, movies);
    if (!match) {
      notInCatalog.push(`#${entry.num} ${entry.listTitle}`);
      continue;
    }
    if (match.status === "rejected") {
      rejected.push(`#${entry.num} ${entry.listTitle} → ${match.title} (${match.year})`);
      continue;
    }
    if (match.status !== "approved" || !match.is_playable) {
      notApproved.push(
        `#${entry.num} ${entry.listTitle} → ${match.title} (${match.year}) [${match.status}, playable=${match.is_playable}]`
      );
      continue;
    }
    if (usedIds.has(match.id)) continue;
    usedIds.add(match.id);

    const key = `${normalizeTitle(match.title)}|${match.year}`;
    pool.push({
      movie_id: match.id,
      title: match.title,
      year: match.year,
      category: entry.category,
      list_num: entry.num,
      list_title: entry.listTitle,
      source: importedNorm.has(key) ? "imported" : "pre_catalog",
    });
  }

  pool.sort((a, b) => a.list_num - b.list_num);

  const csvPath = resolve(process.cwd(), "scripts/sportsChallengePool.csv");
  const tsPath = resolve(process.cwd(), "scripts/sportsChallengePool.ts");
  const reportPath = resolve(process.cwd(), "scripts/sportsChallengePool_report.txt");

  const csvHeader = "list_num,category,title,year,movie_id,source,list_title";
  const csvRows = pool.map((r) =>
    [r.list_num, escapeCsv(r.category), escapeCsv(r.title), r.year, r.movie_id, r.source, escapeCsv(r.list_title)].join(",")
  );
  writeFileSync(csvPath, csvHeader + "\n" + csvRows.join("\n") + "\n");

  const tsBody = pool
    .map(
      (r) =>
        `  { movie_id: "${r.movie_id}", title: ${JSON.stringify(r.title)}, year: ${r.year}, category: ${JSON.stringify(r.category)}, list_num: ${r.list_num}, source: "${r.source}" },`
    )
    .join("\n");

  writeFileSync(
    tsPath,
    `/** Auto-generated by scripts/exportSportsChallengePool.ts — do not edit by hand */\n\nexport interface SportsChallengePoolEntry {\n  movie_id: string;\n  title: string;\n  year: number;\n  category: string;\n  list_num: number;\n  source: "pre_catalog" | "imported";\n}\n\nexport const SPORTS_CHALLENGE_POOL: SportsChallengePoolEntry[] = [\n${tsBody}\n];\n`
  );

  const byCategory = new Map<string, number>();
  for (const r of pool) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);

  const report = [
    "SPORTS CHALLENGE POOL REPORT",
    "============================",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Master list entries: ${SPORTS_MOVIES_MASTER.length}`,
    `Approved + playable in pool: ${pool.length}`,
    `  pre-catalog: ${pool.filter((r) => r.source === "pre_catalog").length}`,
    `  imported: ${pool.filter((r) => r.source === "imported").length}`,
    "",
    "By category:",
    ...[...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cat, n]) => `  ${cat}: ${n}`),
    "",
    `Excluded — rejected (${rejected.length}):`,
    ...rejected.map((l) => `  ${l}`),
    "",
    `Excluded — not approved/playable (${notApproved.length}):`,
    ...(notApproved.length ? notApproved.map((l) => `  ${l}`) : ["  (none)"]),
    "",
    `Not in catalog (${notInCatalog.length}):`,
    ...notInCatalog.map((l) => `  ${l}`),
    "",
  ];
  writeFileSync(reportPath, report.join("\n"));

  console.log(`Pool: ${pool.length} movies (${pool.filter((r) => r.source === "pre_catalog").length} pre-catalog + ${pool.filter((r) => r.source === "imported").length} imported)`);
  console.log(`Rejected excluded: ${rejected.length}`);
  console.log(`Not in catalog: ${notInCatalog.length}`);
  console.log(`Wrote ${csvPath}`);
  console.log(`Wrote ${tsPath}`);
  console.log(`Wrote ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
