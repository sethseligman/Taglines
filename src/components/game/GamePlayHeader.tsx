import type { ReactNode } from "react";
import Link from "next/link";

interface GamePlayHeaderProps {
  headerMenu: ReactNode;
  relaxedVisual?: boolean;
}

/** Shared play-screen header: Taglines wordmark left, menu right (matches GameScreen). */
export function GamePlayHeader({ headerMenu, relaxedVisual = true }: GamePlayHeaderProps) {
  return (
    <header
      className={`w-full shrink-0 ${
        relaxedVisual ? "pb-10 pt-6 md:pb-3 md:pt-5" : "pb-9 pt-5"
      }`}
      style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto flex w-full max-w-lg items-center justify-between">
        <Link
          href="/"
          className="cursor-pointer no-underline transition-opacity duration-150 ease-out hover:opacity-90 active:opacity-80"
        >
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            <span>Tag</span>
            <span className="text-gold">lines</span>
          </h1>
        </Link>
        {headerMenu}
      </div>
    </header>
  );
}
