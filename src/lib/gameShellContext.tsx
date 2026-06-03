"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface GameShellState {
  gameLocked: boolean;
  setGameLocked: (locked: boolean) => void;
}

export const GameShellContext = createContext<GameShellState | null>(null);

export function GameShellProvider({ children }: { children: ReactNode }) {
  const [gameLocked, setGameLockedState] = useState(false);
  const setGameLocked = useCallback((locked: boolean) => {
    setGameLockedState(locked);
  }, []);

  const value = useMemo(
    () => ({ gameLocked, setGameLocked }),
    [gameLocked, setGameLocked]
  );

  return (
    <GameShellContext.Provider value={value}>{children}</GameShellContext.Provider>
  );
}

export function useGameShell(): GameShellState {
  const context = useContext(GameShellContext);
  if (!context) {
    throw new Error("useGameShell must be used within a GameShellProvider");
  }
  return context;
}
