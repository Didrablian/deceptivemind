
"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGame } from '@/context/GameContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Play, Copy, LogOut } from 'lucide-react';

const MAX_PLAYERS = 5;

export default function LobbyPage() {
  const router = useRouter();
  const params = useParams();
  const gameId = Array.isArray(params.gameId) ? params.gameId[0] : params.gameId;
  const { gameState, localPlayerId, isLoading, startGameAI, leaveGame } = useGame();
  const { toast } = useToast();
  const [isStartingGame, setIsStartingGame] = useState(false);

  // Redirect to game page if game status changes from lobby
  useEffect(() => {
    if (gameState && gameState.status !== "lobby" && gameState.status !== "finished" /* allow staying if game just finished */) {
      router.push(`/game/${gameState.gameId}`);
    }
  }, [gameState, router]);

  const handleStartGame = async () => {
    if (!gameState || !localPlayerId || gameState.hostId !== localPlayerId) {
      toast({ title: "Not Host", description: "Only the host can start the game.", variant: "destructive" });
      return;
    }
    if (gameState.players.length !== MAX_PLAYERS) {
      toast({ title: "Not Enough Players", description: `Need ${MAX_PLAYERS} players to start. Currently ${gameState.players.length}.`, variant: "destructive" });
      return;
    }
    setIsStartingGame(true);
    await startGameAI(); // This function now handles toasts for success/failure
    setIsStartingGame(false); // startGameAI will change status, useEffect will redirect
  };

  const copyGameId = () => {
    if (!gameId) return;
    navigator.clipboard.writeText(gameId)
      .then(() => toast({ title: "Game ID Copied!", description: `${gameId} copied to clipboard.` }))
      .catch(() => toast({ title: "Copy Failed", description: "Could not copy Game ID.", variant: "destructive" }));
  };
  
  const handleLeaveLobby = async () => {
    await leaveGame(); // leaveGame will update Firestore
    router.push('/');
    toast({ title: "Left Lobby", description: "You have left the game lobby." });
  };

  if (isLoading || !gameState && gameId) { // if gameId exists but gameState is null, it's loading or not found
    return (
      <div className="flex flex-col items-center justify-center flex-grow">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-xl text-muted-foreground">Loading Lobby...</p>
      </div>
    );
  }

  if (!gameState) {
     // This can happen if gameIdFromParams was undefined, or Firestore listener found no doc
    return (
      <div className="flex flex-col items-center justify-center flex-grow">
        <p className="text-xl text-destructive">Lobby not found or error loading game.</p>
        <Button onClick={() => router.push('/')} className="mt-4">Go Home</Button>
      </div>
    );
  }
  
  // If game has started and user is trying to access lobby directly
  if (gameState.status !== 'lobby') {
    router.push(`/game/${gameId}`);
    return (
        <div className="flex flex-col items-center justify-center flex-grow">
            <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
            <p className="text-xl text-muted-foreground">Redirecting to game...</p>
        </div>
    );
  }


  const canStart = gameState.players.length === MAX_PLAYERS && localPlayerId === gameState.hostId;

  return (
    <Card className="w-full flex-grow flex flex-col shadow-xl">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-3xl">Game Lobby</CardTitle>
          <Button variant="outline" size="sm" onClick={handleLeaveLobby} className="text-destructive border-destructive hover:bg-destructive/10">
            <LogOut className="mr-2 h-4 w-4" /> Leave
          </Button>
        </div>
        <CardDescription>
          Waiting for players to join. Game ID: <Badge variant="secondary" className="text-lg cursor-pointer" onClick={copyGameId}>{gameId} <Copy className="ml-2 h-4 w-4"/></Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold flex items-center"><Users className="mr-2 h-6 w-6 text-primary" />Players ({gameState.players.length}/{MAX_PLAYERS})</h3>
          {gameState.players.length < MAX_PLAYERS && (
            <div className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Waiting for {MAX_PLAYERS - gameState.players.length} more players...
            </div>
          )}
        </div>
        <ScrollArea className="h-64 border rounded-md p-4 bg-background/50">
          {gameState.players.length > 0 ? (
            <ul className="space-y-3">
              {gameState.players.map((player) => (
                <li key={player.id} className="flex items-center justify-between p-3 bg-card rounded-lg shadow">
                  <span className="font-medium text-lg text-foreground">{player.name}</span>
                  <div>
                    {player.isHost && <Badge variant="default" className="bg-accent text-accent-foreground mr-2">Host</Badge>}
                    {player.id === localPlayerId && <Badge variant="outline">You</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-muted-foreground py-10">No players yet. Share the Game ID!</p>
          )}
        </ScrollArea>
      </CardContent>
      <CardFooter className="border-t pt-6">
        <Button 
          onClick={handleStartGame} 
          disabled={!canStart || isStartingGame} 
          className="w-full text-lg py-6 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isStartingGame ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Play className="mr-2 h-5 w-5" />
          )}
          {isStartingGame ? 'Starting Game...' : `Start Game (${gameState.players.length}/${MAX_PLAYERS})`}
        </Button>
      </CardFooter>
    </Card>
  );
}
