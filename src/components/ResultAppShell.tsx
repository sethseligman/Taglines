"use client";

import type { ReactNode } from "react";

export interface ResultAppShellProps {
  headerMenu: ReactNode | null;
  relaxedVisual: boolean;
  children: ReactNode;
}

/** Seated result frame: radial bg, persistent wordmark header, main slot for end sequence + result body. */
export function ResultAppShell({ headerMenu, relaxedVisual, children }: ResultAppShellProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#080808] text-foreground">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 200px 500px at 50% -5%, rgba(201,169,110,0.04) 0%, transparent 70%)",
        }}
      />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header
          className={`w-full shrink-0 px-5 md:px-8 ${
            relaxedVisual ? "pb-10 pt-6 md:pb-3 md:pt-5" : "pb-9 pt-5"
          }`}
        >
          <div className="mx-auto flex w-full max-w-lg items-center justify-between">
            <a
              href="https://www.taglines.app"
              className="cursor-pointer no-underline transition-opacity duration-150 ease-out hover:opacity-90 active:opacity-80"
            >
              <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
                <span>Tag</span>
                <span className="text-gold">lines</span>
              </h1>
            </a>
            {headerMenu}
          </div>
        </header>
        <main className="flex flex-1 flex-col items-center justify-start px-5 py-4 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
