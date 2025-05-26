
"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGame } from '@/context/GameContext';
import RoleRevealScreen from './components/RoleRevealScreen';
import GameplayScreen from './components/GameplayScreen';
import GameOverScreen from './components/GameOverScreen';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const gameId = Array.isArray(params.gameId) ? params.gameId[0] : params.gameId;
  const { gameState, localPlayerId, acknowledgeRole } = useGame(); // Added acknowledgeRole
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient && gameState) {
      if (gameState.status === "lobby" && gameId) {
        router.push(`/lobby/${gameId}`);
        return;
      }
      if (!localPlayerId || !gameState.players.find(p => p.id === localPlayerId)) {
        toast({ title: "Not in game", variant: "destructive"});
        router.push('/');
      }
    } else if (isClient && !gameState && gameId) {
      const storedGame = typeof window !== 'undefined' ? localStorage.getItem(`dm_gameState_${gameId}`) : null; // Check if needed
      if (!storedGame) { // This check is less relevant with Firestore but kept for robustness
        // toast({ title: "Game not found", variant: "destructive"}); // Already handled by context
        // router.push('/');
      }
    }
  }, [isClient, gameState, localPlayerId, router, gameId, toast]);


  if (!isClient || !gameState || !localPlayerId || !gameState.players.find(p => p.id === localPlayerId)) {
    return (
      <div className="flex flex-col items-center justify-center flex-grow">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-xl text-muted-foreground">Loading Game...</p>
      </div>
    );
  }

  const localPlayer = gameState.players.find(p => p.id === localPlayerId);
  if (!localPlayer) {
    return <p>Error: Player data not found.</p>;
  }

  switch (gameState.status) {
    case 'role-reveal':
      return <RoleRevealScreen player={localPlayer} targetWord={gameState.targetWord} onContinue={acknowledgeRole} />;
    case 'discussion':
    case 'word-elimination':
    case 'word-lock-in-attempt': // Should be handled within GameplayScreen or lead to new state
    case 'post-guess-reveal':
      return <GameplayScreen />;
    case 'finished':
      return <GameOverScreen 
                winner={gameState.winner} 
                winningReason={gameState.winningReason} 
                gameLog={gameState.gameLog} 
                localPlayer={localPlayer} 
                players={gameState.players} 
             />;
    default:
      return (
        <div className="flex flex-col items-center justify-center flex-grow">
          <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
          <p className="text-xl text-muted-foreground">Preparing your game...</p>
          <p className="text-sm text-muted-foreground">Current status: {gameState.status}</p>
        </div>
      );
  }
}
