import { GameScreen } from "@/components/GameScreen";
import { SplashModal } from "@/components/SplashModal";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-background">
      <GameScreen />
      <SplashModal />
    </div>
  );
}
