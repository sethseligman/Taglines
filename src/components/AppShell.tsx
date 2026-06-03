"use client";

import { usePathname } from "next/navigation";
import { MainMenu } from "@/components/MainMenu";
import { SplashModal } from "@/components/SplashModal";
import { TaglinesWordmark } from "@/components/ui/TaglinesWordmark";
import { GameShellProvider, useGameShell } from "@/lib/gameShellContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <GameShellProvider>
      <AppShellHeader>{children}</AppShellHeader>
    </GameShellProvider>
  );
}

function AppShellHeader({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { gameLocked } = useGameShell();

  const headerBackground = pathname.startsWith("/challenges/")
    ? "transparent"
    : "#0D0D0D";

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 w-full px-5 pb-3 md:px-6"
        style={{
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          background: headerBackground,
        }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between">
          <TaglinesWordmark asLink />
          <MainMenu gameLocked={gameLocked} />
        </div>
      </header>
      <div
        aria-hidden
        className="pointer-events-none pb-3"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
      >
        <div className="h-7" />
      </div>
      {children}
      <SplashModal />
    </>
  );
}
