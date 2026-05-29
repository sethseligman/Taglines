import Link from "next/link";

export default async function ChallengeRunPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <p className="font-serif text-xl text-foreground">Challenge run coming soon</p>
      <p className="mt-2 text-sm text-muted">
        Phase 3 will build the session for <span className="font-mono">{slug}</span>.
      </p>
      <Link href="/" className="mt-6 text-sm text-gold hover:text-gold/90">
        ← Back to portal
      </Link>
    </div>
  );
}
