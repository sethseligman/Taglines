import { getPublishedChallenges } from "@/actions/challenges";
import { getDailyMovie } from "@/actions/movies";
import { PortalScreen } from "@/components/portal/PortalScreen";
import { getTodayKey } from "@/data/movies";

export const dynamic = "force-dynamic";

export default async function Home() {
  const dateKey = getTodayKey();
  const [dailyPayload, challenges] = await Promise.all([
    getDailyMovie(dateKey),
    getPublishedChallenges(),
  ]);

  const dailyTagline = dailyPayload?.movie.officialTagline ?? null;

  return (
    <div className="relative min-h-screen bg-background">
      <PortalScreen
        dateKey={dateKey}
        dailyTagline={dailyTagline}
        challenges={challenges}
      />
    </div>
  );
}
