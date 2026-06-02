"use client";

import { usePathname } from "next/navigation";
import { MainMenu } from "@/components/MainMenu";
import { TaglinesWordmark } from "@/components/ui/TaglinesWordmark";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const menu =
    pathname === "/play" ? <MainMenu mode="daily" /> : <MainMenu portalMode />;

  return (
    <>
      <header
        className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-3 pt-5 md:px-6 md:pt-6"
        style={{
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          background: "transparent",
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
