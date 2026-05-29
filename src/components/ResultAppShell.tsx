"use client";

import type { ReactNode } from "react";
import { GamePlayHeader } from "@/components/game/GamePlayHeader";

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
        <main className="flex flex-1 flex-col items-center justify-start px-5 py-4 md:px-8">
          <GamePlayHeader headerMenu={headerMenu} relaxedVisual={relaxedVisual} />
          {children}
        </main>
      </div>
    </div>
  );
}
