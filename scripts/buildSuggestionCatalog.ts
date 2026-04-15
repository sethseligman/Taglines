/**
 * Build a local TMDB-backed suggestion catalog for autocomplete.
 *
 * Usage:
 *   npx tsx scripts/buildSuggestionCatalog.ts
 *
 * Required env:
 *   TMDB_ACCESS_TOKEN=...
 *
 * Optional env:
 *   TMDB_SUGGESTION_TARGET=5000
 *   TMDB_MAX_PAGES=250
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeForComparison } from "../src/lib/answerNormalize";
import type { SuggestionCatalogItem } from "../src/types/suggestion";

interface TmdbDiscoverResult {
  results: TmdbMovie[];
  total_pages: number;
}

interface TmdbMovie {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  adult?: boolean;
  popularity?: number;
  vote_count?: number;
}

const OUTPUT_PATH = resolve(process.cwd(), "src/data/suggestionCatalog.json");
const TARGET_COUNT = Number.parseInt(process.env.TMDB_SUGGESTION_TARGET ?? "5000", 10);
const MAX_PAGES = Number.parseInt(process.env.TMDB_MAX_PAGES ?? "250", 10);
const MIN_RELEASE_YEAR = Number.parseInt(process.env.TMDB_MIN_RELEASE_YEAR ?? "1950", 10);
const MIN_VOTE_COUNT = Number.parseInt(process.env.TMDB_MIN_VOTE_COUNT ?? "200", 10);
const PER_PAGE = 20;

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

function parseYear(releaseDate?: string): number {
  if (!releaseDate || releaseDate.length < 4) return 0;
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  if (!Number.isFinite(year)) return 0;
  if (year < 1888 || year > 2100) return 0;
  return year;
}

function parseIsoDate(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isUsableMovie(m: TmdbMovie): boolean {
  const title = (m.title ?? "").trim();
  if (!title) return false;
  if (m.adult) return false;
  if (title.length < 2 || title.length > 140) return false;
  if (!m.release_date) return false;
  const release = parseIsoDate(m.release_date);
  if (!release) return false;
  const today = new Date();
  if (release.getTime() > today.getTime()) return false;
  const year = parseYear(m.release_date);
  if (!year || year < MIN_RELEASE_YEAR) return false;
  if ((m.vote_count ?? 0) < MIN_VOTE_COUNT) return false;
  return true;
}

function dedupeKey(item: SuggestionCatalogItem): string {
  return `${item.normalizedTitle}::${item.year}`;
}

async function fetchDiscoverPage(page: number): Promise<TmdbDiscoverResult> {
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Missing TMDB_ACCESS_TOKEN");
  }

  const params = new URLSearchParams({
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    page: String(page),
    sort_by: "vote_count.desc",
    "primary_release_date.gte": `${MIN_RELEASE_YEAR}-01-01`,
    primary_release_date_lte: new Date().toISOString().slice(0, 10),
    "vote_count.gte": String(MIN_VOTE_COUNT),
  });

  const url = `https://api.themoviedb.org/3/discover/movie?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`TMDB discover failed for page ${page}: ${res.status}`);
  }
  return (await res.json()) as TmdbDiscoverResult;
}

async function main(): Promise<void> {
  loadEnv();
  const out = new Map<string, SuggestionCatalogItem>();
  const byTmdbId = new Set<number>();

  let page = 1;
  let totalPages = MAX_PAGES;

  while (page <= Math.min(totalPages, MAX_PAGES) && out.size < TARGET_COUNT) {
    process.stdout.write(`Fetching TMDB discover page ${page}...\n`);
    const data = await fetchDiscoverPage(page);
    totalPages = Math.min(data.total_pages ?? MAX_PAGES, MAX_PAGES);

    for (const m of data.results ?? []) {
      if (!isUsableMovie(m)) continue;
      if (!m.id || byTmdbId.has(m.id)) continue;

      const title = m.title!.trim();
      const normalizedTitle = normalizeForComparison(title);
      if (!normalizedTitle) continue;

      const item: SuggestionCatalogItem = {
        tmdbId: m.id,
        title,
        year: parseYear(m.release_date),
        normalizedTitle,
        popularity: Number.isFinite(m.popularity) ? Number(m.popularity) : 0,
        originalTitle: m.original_title?.trim() || undefined,
      };

      const key = dedupeKey(item);
      if (out.has(key)) continue;
      out.set(key, item);
      byTmdbId.add(m.id);
    }

    page += 1;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
  }

  const items = Array.from(out.values())
    .sort((a, b) => {
      if (b.popularity !== a.popularity) return b.popularity - a.popularity;
      if (b.year !== a.year) return b.year - a.year;
      return a.title.localeCompare(b.title, "en", { sensitivity: "base" });
    })
    .slice(0, TARGET_COUNT);

  const payload = {
    version: 1,
    source: "tmdb",
    generatedAt: new Date().toISOString(),
    total: items.length,
    items,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Wrote ${items.length} suggestions to src/data/suggestionCatalog.json (target ${TARGET_COUNT}, page size ${PER_PAGE}).\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
