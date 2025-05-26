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
  const { gameState, localPlayerId, dispatch } = useGame();
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Redirect if game state is not properly loaded or user is not part of the game
  useEffect(() => {
    if (isClient && gameState) {
      if (gameState.status === "lobby" && gameId) {
        // If somehow ended up on game page while game is in lobby, redirect to lobby
        router.push(`/lobby/${gameId}`);
        return;
      }
      if (!localPlayerId || !gameState.players.find(p => p.id === localPlayerId)) {
        // If local player is not in the game, redirect to home.
        toast({ title: "Not in game", description: "You are not part of this game session.", variant: "destructive"});
        router.push('/');
      }
    } else if (isClient && !gameState && gameId) {
      // Attempt to load or if no game state exists for this ID, redirect.
      // This is a simplified check. A robust solution needs backend validation.
      const storedGame = localStorage.getItem(`dm_gameState_${gameId}`);
      if (!storedGame) {
        toast({ title: "Game not found", description: "This game session does not exist or has ended.", variant: "destructive"});
        router.push('/');
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
     // Should be caught by useEffect, but as a safeguard
    return <p>Error: Player data not found.</p>;
  }

  switch (gameState.status) {
    case 'role-reveal':
      return <RoleRevealScreen player={localPlayer} targetWord={gameState.targetWord} onContinue={() => dispatch({ type: 'SET_STATUS', payload: 'playing' })} />;
    case 'playing':
    case 'meeting': // GameplayScreen might handle sub-states like 'meeting'
    case 'accusation':
      return <GameplayScreen />;
    case 'finished':
      return <GameOverScreen winner={gameState.winner} gameLog={gameState.gameLog} localPlayer={localPlayer} players={gameState.players} />;
    default:
      // This case includes 'lobby' or any unexpected status.
      // If it's 'lobby', the useEffect should redirect.
      // For others, show loading or an error.
      return (
        <div className="flex flex-col items-center justify-center flex-grow">
          <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
          <p className="text-xl text-muted-foreground">Preparing your game...</p>
          <p className="text-sm text-muted-foreground">Current status: {gameState.status}</p>
        </div>
      );
  }
}
