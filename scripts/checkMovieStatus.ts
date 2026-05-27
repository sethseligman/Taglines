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

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const sb = createClient(url, key);
  const count = async (
    label: string,
    build: () => ReturnType<ReturnType<typeof sb.from>["select"]>
  ) => {
    const { count: n, error } = await build();
    if (error) throw new Error(`${label}: ${error.message}`);
    return n ?? 0;
  };
  const total = await count("total", () =>
    sb.from("movies").select("*", { count: "exact", head: true })
  );
  const pending = await count("pending", () =>
    sb.from("movies").select("*", { count: "exact", head: true }).eq("status", "pending_review")
  );
  const approved = await count("approved", () =>
    sb.from("movies").select("*", { count: "exact", head: true }).eq("status", "approved")
  );
  const playable = await count("playable", () =>
    sb.from("movies").select("*", { count: "exact", head: true }).eq("is_playable", true)
  );
  const withHints = await count("withHints", () =>
    sb.from("movies").select("*", { count: "exact", head: true }).not("hint_1", "is", null)
  );
  const pendingWithHints = await count("pendingWithHints", () =>
    sb
      .from("movies")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_review")
      .not("hint_1", "is", null)
  );
  const approvedNotPlayable = await count("approvedNotPlayable", () =>
    sb
      .from("movies")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("is_playable", false)
  );
  console.log({
    total,
    pending,
    approved,
    playable,
    withHints,
    pendingWithHints,
    approvedNotPlayable,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
