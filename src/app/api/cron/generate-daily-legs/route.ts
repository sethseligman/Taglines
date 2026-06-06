import { NextRequest, NextResponse } from "next/server";
import {
  generateChallengeDailyLegs,
  getTodayDateKey,
  getTomorrowDateKey,
} from "@/lib/generateChallengeDailyLegs";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Primary job: pre-generate tomorrow's legs (runs at midnight UTC).
    const tomorrow = await generateChallengeDailyLegs({
      targetDate: getTomorrowDateKey(),
    });

    // Backfill today for any newly published daily_pool that has no legs yet.
    const today = await generateChallengeDailyLegs({
      targetDate: getTodayDateKey(),
    });

    const errorCount = tomorrow.errorCount + today.errorCount;

    return NextResponse.json({
      ok: errorCount === 0,
      tomorrow: {
        targetDate: tomorrow.targetDate,
        generatedCount: tomorrow.generatedCount,
        skippedCount: tomorrow.skippedCount,
        errorCount: tomorrow.errorCount,
        results: tomorrow.results,
      },
      today: {
        targetDate: today.targetDate,
        generatedCount: today.generatedCount,
        skippedCount: today.skippedCount,
        errorCount: today.errorCount,
        results: today.results,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
