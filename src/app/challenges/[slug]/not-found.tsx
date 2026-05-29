import Link from "next/link";

export default function ChallengeNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <p className="font-serif text-xl text-foreground">Challenge not found</p>
      <Link href="/" className="mt-6 text-sm text-gold hover:text-gold/90">
        ← Back to portal
      </Link>
    </div>
  );
}
