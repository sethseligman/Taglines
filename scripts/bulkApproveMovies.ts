/**
 * Bulk-approve movies in Supabase (status=approved, is_playable=true).
 *
 * Usage:
 *   npx tsx scripts/bulkApproveMovies.ts --dry-run
 *   npx tsx scripts/bulkApproveMovies.ts
 *   npx tsx scripts/bulkApproveMovies.ts --only-with-hints
 *
 * Requires .env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

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

async function main(): Promise<void> {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");
  const onlyWithHints = process.argv.includes("--only-with-hints");

  const supabase = createClient(url, key);

  let countQuery = supabase
    .from("movies")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending_review");

  if (onlyWithHints) {
    countQuery = countQuery.not("hint_1", "is", null);
  }

  const { count, error: countErr } = await countQuery;
  if (countErr) {
    console.error(countErr.message);
    process.exit(1);
  }

  const n = count ?? 0;
  console.log(
    `${dryRun ? "[dry-run] Would approve" : "Approving"} ${n} movie(s)` +
      (onlyWithHints ? " (pending_review with hint_1)" : " (all pending_review)") +
      " → status=approved, is_playable=true"
  );

  if (dryRun || n === 0) return;

  let updateQuery = supabase
    .from("movies")
    .update({ status: "approved", is_playable: true })
    .eq("status", "pending_review");

  if (onlyWithHints) {
    updateQuery = updateQuery.not("hint_1", "is", null);
  }

  const { error: updateErr } = await updateQuery;
  if (updateErr) {
    console.error("Update failed:", updateErr.message);
    process.exit(1);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
