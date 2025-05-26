
"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGame } from '@/context/GameContext';
import RoleRevealScreen from './components/RoleRevealScreen';
import GameplayScreen from './components/GameplayScreen';
import GameOverScreen from './components/GameOverScreen';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';


export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const gameId = Array.isArray(params.gameId) ? params.gameId[0] : params.gameId;
  const { gameState, localPlayerId, acknowledgeRole, isLoading: isGameContextLoading } = useGame();
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient && gameState) {
      if (gameState.status === "lobby" && gameId) {
        // If we land on game page but game is in lobby, redirect to lobby
        // This can happen if URL is manually changed or due to race conditions
        router.push(`/lobby/${gameId}`);
        return;
      }
      // Ensure player is still part of the game
      if (!localPlayerId || !gameState.players.find(p => p.id === localPlayerId)) {
        // Player might have been removed or game ended and they are no longer part of it.
        // Redirect to home if not already there or in a lobby.
        if (gameId && !router.pathname?.startsWith('/lobby/') && router.pathname !== '/') {
          toast({ title: "Session Ended", description: "You are no longer in this game.", variant: "default"});
          router.push('/');
        }
      }
    } else if (isClient && !isGameContextLoading && !gameState && gameId) {
      // Game doesn't exist or user isn't part of it, or it ended and was deleted
       if (!router.pathname?.startsWith('/lobby/') && router.pathname !== '/') {
        toast({ title: "Game Not Found", description: "The game session may have ended or does not exist.", variant: "destructive"});
        router.push('/');
      }
    }
  }, [isClient, gameState, localPlayerId, router, gameId, toast, isGameContextLoading]);


  if (!isClient || isGameContextLoading || !gameState || !localPlayerId || !gameState.players.find(p => p.id === localPlayerId)) {
    return (
      <div className="flex flex-col items-center justify-center flex-grow">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-xl text-muted-foreground">Loading Game...</p>
         {gameId && <p className="text-sm text-muted-foreground">Game ID: {gameId}</p>}
      </div>
    );
  }

  const localPlayer = gameState.players.find(p => p.id === localPlayerId);
  if (!localPlayer) { 
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
                gameState={gameState}
                localPlayer={localPlayer}
                gameId={gameState.gameId}
                isHost={localPlayer.id === gameState.hostId}
             />;
    case 'lobby': // Should be handled by useEffect redirect, but as a fallback
        router.push(`/lobby/${gameId}`); // Redirect to lobby if somehow still here
        return (  <div className="flex flex-col items-center justify-center flex-grow">
                    <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
                    <p className="text-xl text-muted-foreground">Redirecting to lobby...</p>
                </div>);
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
