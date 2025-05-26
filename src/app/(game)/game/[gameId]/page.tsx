
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
  const { gameState, localPlayerId, acknowledgeRole } = useGame();
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
        // Player might have been removed or game ended differently
        // Only redirect if not already on home page or lobby
        if (gameId && !router.pathname?.startsWith('/lobby/') && router.pathname !== '/') {
          // toast({ title: "Disconnected", description: "You are no longer in this game session.", variant: "default"});
          // router.push('/');
        }
      }
    } else if (isClient && !gameState && gameId) {
      // Game doesn't exist or user isn't part of it, or it ended and was deleted
       if (!router.pathname?.startsWith('/lobby/') && router.pathname !== '/') {
        // toast({ title: "Game Not Found", description: "The game session may have ended or does not exist.", variant: "destructive"});
        // router.push('/');
      }
    }
  }, [isClient, gameState, localPlayerId, router, gameId, toast]);


  if (!isClient || !gameState || !localPlayerId || !gameState.players.find(p => p.id === localPlayerId)) {
    return (
      <div className="flex flex-col items-center justify-center flex-grow">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-xl text-muted-foreground">Loading Game...</p>
         {gameId && <p className="text-sm text-muted-foreground">Game ID: {gameId}</p>}
      </div>
    );
  }

  const localPlayer = gameState.players.find(p => p.id === localPlayerId);
  if (!localPlayer) { // Should be caught by above, but as a safeguard
    return (
        <div className="flex flex-col items-center justify-center flex-grow">
            <p className="text-destructive text-lg">Error: Your player data could not be found in this game.</p>
            <Button onClick={() => router.push('/')} className="mt-4">Go Home</Button>
        </div>
    );
  }

  switch (gameState.status) {
    case 'role-reveal':
      return <RoleRevealScreen player={localPlayer} targetWord={gameState.targetWord} onContinue={acknowledgeRole} />;
    case 'discussion':
    case 'word-elimination':
    case 'word-lock-in-attempt': 
    case 'post-guess-reveal':
      return <GameplayScreen />;
    case 'finished':
      return <GameOverScreen 
                winner={gameState.winner} 
                winningReason={gameState.winningReason} 
                gameLog={gameState.gameLog} 
                localPlayer={localPlayer} 
                players={gameState.players}
                gameId={gameState.gameId}
                isHost={localPlayer.id === gameState.hostId}
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
