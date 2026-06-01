import Link from "next/link";
import { FONT_PLAYFAIR } from "@/lib/fontStacks";

interface TaglinesWordmarkProps {
  asLink?: boolean;
}

const wordmark = (
  <p
    className="leading-none"
    style={{ fontFamily: FONT_PLAYFAIR, fontSize: 21, fontWeight: 700 }}
  >
    <span style={{ color: "var(--foreground)" }}>Tag</span>
    <span style={{ color: "var(--gold)" }}>lines</span>
  </p>
);

/** Shared Taglines wordmark — Playfair 21px / 700, matches portal header. */
export function TaglinesWordmark({ asLink = false }: TaglinesWordmarkProps) {
  if (asLink) {
    return (
      <Link
        href="/"
        className="cursor-pointer no-underline transition-opacity duration-150 ease-out hover:opacity-90 active:opacity-80"
      >
        {wordmark}
      </Link>
    );
  }

  return wordmark;
}
