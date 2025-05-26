"use client";
import type { ReactNode } from 'react';
import { GameProvider } from '@/context/GameContext';
import { GameTitle } from '@/components/GameTitle';
import { useParams } from 'next/navigation'; // To get gameId for GameProvider

export default function GameLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  // Ensure gameId is a string, even if it comes as string[] from params
  const gameId = Array.isArray(params.gameId) ? params.gameId[0] : params.gameId;

  return (
    <GameProvider gameIdFromParams={gameId}>
      <div className="flex flex-col items-center min-h-screen bg-background p-2 sm:p-4">
        <GameTitle />
        <main className="w-full max-w-4xl flex-grow flex flex-col">
          {children}
        </main>
         <footer className="mt-8 text-center text-sm text-muted-foreground">
          <p>Remember, trust no one.</p>
        </footer>
      </div>
    </GameProvider>
  );
}
