import { Suspense } from "react";
import { GameScreen } from "@/components/GameScreen";

export default function PlayPage() {
  return (
    <div className="relative min-h-screen bg-background">
      <Suspense fallback={null}>
        <GameScreen />
      </Suspense>
    </div>
  );
}
