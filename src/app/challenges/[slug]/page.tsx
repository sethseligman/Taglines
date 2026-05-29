import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPublishedChallengeBySlug,
  getPublishedChallengeLegMovies,
} from "@/actions/challenges";
import { ChallengeRunScreen } from "@/components/challenge/ChallengeRunScreen";

export const dynamic = "force-dynamic";

export default async function ChallengeRunPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const challenge = await getPublishedChallengeBySlug(slug);

  if (!challenge) {
    notFound();
  }

  const legs = await getPublishedChallengeLegMovies(challenge.id);

  if (legs.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <p className="font-serif text-xl text-foreground">Challenge unavailable</p>
        <p className="mt-2 text-sm text-muted">No playable movies are configured yet.</p>
        <Link href="/" className="mt-6 text-sm text-gold hover:text-gold/90">
          ← Back to portal
        </Link>
      </div>
    );
  }

  return <ChallengeRunScreen challenge={challenge} legs={legs} />;
}
