import { NextRequest, NextResponse } from "next/server";
import { generateChallengeDailyLegs, getTomorrowDateKey } from "@/lib/generateChallengeDailyLegs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const summary = await generateChallengeDailyLegs({
      targetDate: getTomorrowDateKey(),
    });

    return NextResponse.json({
      ok: summary.errorCount === 0,
      targetDate: summary.targetDate,
      generatedCount: summary.generatedCount,
      skippedCount: summary.skippedCount,
      errorCount: summary.errorCount,
      results: summary.results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
