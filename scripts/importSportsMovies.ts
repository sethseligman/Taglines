/**
 * Batch-import missing sports films from scripts/sportsMoviesMissing.ts.
 *
 * Usage:
 *   npx tsx scripts/importSportsMovies.ts --dry-run
 *   npx tsx scripts/importSportsMovies.ts
 *   npx tsx scripts/importSportsMovies.ts --from 50
 *
 * Requires same env as importMovie.ts.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { importMovieEntry, type ImportResult } from "./importMovie";
import { SPORTS_MOVIES_MISSING } from "./sportsMoviesMissing";

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

function parseFromArg(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith("--from="));
  if (!arg) return 0;
  const n = parseInt(arg.slice("--from=".length), 10);
  return Number.isFinite(n) && n > 0 ? n - 1 : 0;
}

function label(entry: (typeof SPORTS_MOVIES_MISSING)[number]): string {
  const title = entry.catalogTitle ?? entry.title;
  return entry.year ? `${title} (${entry.year})` : title;
}

async function main(): Promise<void> {
  loadEnv();

  const dryRun = process.argv.includes("--dry-run");
  const startIndex = parseFromArg(process.argv);
  const entries = SPORTS_MOVIES_MISSING.slice(startIndex);

  console.log(
    `${dryRun ? "[dry-run] " : ""}Importing ${entries.length} sports film(s)` +
      (startIndex > 0 ? ` starting at #${startIndex + 1}` : "") +
      "...\n"
  );

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const skippedRows: string[] = [];
  const errorRows: string[] = [];

  const DELAY_MS = 400;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const n = startIndex + i + 1;
    const name = label(entry);
    process.stdout.write(`[${n}/${SPORTS_MOVIES_MISSING.length}] ${name} ... `);

    if (dryRun) {
      console.log("would import");
      continue;
    }

    const result: ImportResult = await importMovieEntry(entry);

    if (result.outcome === "inserted") {
      inserted++;
      console.log(`inserted (${result.title} ${result.year})`);
    } else if (result.outcome === "skipped") {
      skipped++;
      skippedRows.push(`${name}: ${result.reason}`);
      console.log(`skipped: ${result.reason}`);
    } else {
      errors++;
      errorRows.push(`${name}: ${result.message}`);
      console.log(`error: ${result.message}`);
    }

    if (i < entries.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  if (!dryRun) {
    console.log("\n---");
    console.log(`Inserted: ${inserted}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    if (skippedRows.length) {
      console.log("\nSkipped details:");
      skippedRows.forEach((row) => console.log(`  - ${row}`));
    }
    if (errorRows.length) {
      console.log("\nError details:");
      errorRows.forEach((row) => console.log(`  - ${row}`));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
