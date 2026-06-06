/**
 * Parse and reformat Sports_hint_edit.csv (Excel-exported, inconsistent quoting).
 *
 * Usage: npx tsx scripts/formatSportsHintEdit.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

interface MovieHints {
  title: string;
  year: number;
  hint_1: string;
  hint_2: string;
  hint_3: string;
  hint_4: string;
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function unwrapLine(line: string): string {
  let s = line.trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s;
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

function normalizeExcelQuotes(s: string): string {
  return s.replace(/""/g, '"');
}

/** Fix known Excel export typos on raw inner string (before "" → " normalization). */
function fixKnownTypos(rawInner: string): string {
  return rawInner
    // Missing closing quote before next hint: .,""Next → .",""Next
    .replace(/\.,""/g, '.",""')
    // Missing closing quote before unquoted next hint: hockey?,A → hockey?","A
    .replace(/\?,([A-Z])/g, '?","$1');
}

function splitByYear(s: string): { title: string; year: number; rest: string } | null {
  const m = s.match(/,(\d{4}),/);
  if (!m || m.index === undefined) return null;
  return {
    title: s.slice(0, m.index).trim(),
    year: parseInt(m[1]!, 10),
    rest: s.slice(m.index + m[0].length),
  };
}

function toMovie(cols: string[]): MovieHints | null {
  if (cols.length !== 6) return null;
  const [title, yearStr, h1, h2, h3, h4] = cols;
  if (!/^\d{4}$/.test(yearStr ?? "")) return null;
  if (![h1, h2, h3, h4].every((h) => h?.trim())) return null;
  return {
    title: title!,
    year: parseInt(yearStr!, 10),
    hint_1: h1!,
    hint_2: h2!,
    hint_3: h3!,
    hint_4: h4!,
  };
}

function colsFromNormalized(normalized: string): string[] {
  let cols = parseCsvLine(normalized);
  if (cols.length === 6) return cols;

  const byYear = splitByYear(normalized);
  if (byYear) {
    cols = [byYear.title, String(byYear.year), ...parseCsvLine(byYear.rest)];
  }
  return cols;
}

function parseRow(rawInner: string): MovieHints | null {
  // Try raw first (handles most rows; unquoted hints are fine)
  let normalized = normalizeExcelQuotes(rawInner);
  let movie = toMovie(colsFromNormalized(normalized));
  if (movie) return movie;

  // Retry with typo fixes applied before quote normalization
  normalized = normalizeExcelQuotes(fixKnownTypos(rawInner));
  movie = toMovie(colsFromNormalized(normalized));
  if (movie) return movie;

  return null;
}

function main(): void {
  const inPath = resolve(process.cwd(), "Sports_hint_edit.csv");
  const outPath = resolve(process.cwd(), "Sports_hint_edit_FORMATTED.csv");
  const reviewPath = resolve(process.cwd(), "Sports_hint_edit_NEEDS_REVIEW.txt");

  const raw = readFileSync(inPath, "utf8");
  const physicalLines = raw.split(/\r?\n/).filter((l) => l.trim());

  const parsed: MovieHints[] = [];
  const review: string[] = [];

  for (let idx = 1; idx < physicalLines.length; idx++) {
    const lineNum = idx + 1;
    const inner = unwrapLine(physicalLines[idx]!);
    const row = parseRow(inner);

    if (!row) {
      const normalized = normalizeExcelQuotes(inner);
      const colCount = parseCsvLine(normalized).length;
      const split = splitByYear(normalized);
      review.push(
        `Line ${lineNum}: Could not parse into 6 columns`,
        `  Title (best guess): ${split?.title ?? parseCsvLine(normalized)[0] ?? "?"}`,
        `  Columns found (full-line parse): ${colCount}`,
        `  Fix: wrap every hint in quotes; check for missing "" before comma between hints`,
        `  Common typo: ending a hint with .," instead of .",""`,
        `  Snippet: ${inner.slice(0, 220)}...`,
        ``
      );
      continue;
    }

    parsed.push(row);
  }

  const header = "title,year,hint_1,hint_2,hint_3,hint_4";
  const rows = parsed.map((m) =>
    [
      m.title.includes(",") ? escapeCsv(m.title) : m.title,
      String(m.year),
      escapeCsv(m.hint_1),
      escapeCsv(m.hint_2),
      escapeCsv(m.hint_3),
      escapeCsv(m.hint_4),
    ].join(",")
  );

  writeFileSync(outPath, header + "\n" + rows.join("\n") + "\n");

  const report = [
    "SPORTS HINT EDIT — FORMAT REPORT",
    "================================",
    "",
    `Input data rows: ${physicalLines.length - 1}`,
    `Parsed OK: ${parsed.length}`,
    `Needs manual review: ${physicalLines.length - 1 - parsed.length}`,
    `Expected: 191`,
    "",
    parsed.length === 191 ? "✓ All 191 movies parsed." : `⚠ Missing ${191 - parsed.length} movie(s).`,
    "",
    "HOW TO FIX FLAGGED ROWS:",
    "- Each row must have exactly: title, year, hint_1, hint_2, hint_3, hint_4",
    "- Wrap EVERY hint in double quotes",
    '- Internal quotes inside a hint become doubled: ""like this""',
    '- Between hints use: "," (quote-comma-quote)',
    "- Do NOT wrap the entire row in outer quotes",
    "",
    "--- ROWS NEEDING MANUAL FIX ---",
    "",
    ...review,
  ];

  writeFileSync(reviewPath, report.join("\n"));

  console.log(`Parsed: ${parsed.length}/191`);
  console.log(`Needs review: ${physicalLines.length - 1 - parsed.length}`);
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${reviewPath}`);
}

main();
