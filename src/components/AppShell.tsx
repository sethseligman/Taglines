"use client";

import { usePathname } from "next/navigation";
import { MainMenu } from "@/components/MainMenu";
import { TaglinesWordmark } from "@/components/ui/TaglinesWordmark";
import { GameShellProvider, useGameShell } from "@/lib/gameShellContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <GameShellProvider>
      <AppShellInner>{children}</AppShellInner>
    </GameShellProvider>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { gameLocked } = useGameShell();

  const menu =
    pathname === "/play" ? (
      <MainMenu mode="daily" gameLocked={gameLocked} />
    ) : (
      <MainMenu portalMode gameLocked={false} />
    );

  const headerBackground = pathname.startsWith("/challenges/")
    ? "transparent"
    : "#0D0D0D";

  return (
    <>
      <header
        className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-3 pt-5 md:px-6 md:pt-6"
        style={{
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          background: headerBackground,
        }}
      >
        <div className="flex items-center justify-between">
          <TaglinesWordmark asLink />
          {menu}
        </div>
      </header>
      {children}
    </>
  );
}
