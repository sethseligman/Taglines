"use client";

import { useEffect, type ReactNode } from "react";

export interface ResultAppShellProps {
  children: ReactNode;
}

/** Seated result frame: radial bg and main slot for end sequence + result body. */
export function ResultAppShell({ children }: ResultAppShellProps) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

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
        <main className="flex flex-1 flex-col items-center justify-start px-5 py-4 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
