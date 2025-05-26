"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGame } from '@/context/GameContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { Player } from '@/lib/types';
import { Loader2, Users, Play, Copy, LogOut } from 'lucide-react';
import { generateWordsAndClues as callGenerateWordsAndCluesAI } from '@/ai/flows/generate-words-and-clues';
import { assignRolesAndClues } from '@/lib/gameUtils';

const MAX_PLAYERS = 5;

export default function LobbyPage() {
  const router = useRouter();
  const params = useParams();
  const gameId = Array.isArray(params.gameId) ? params.gameId[0] : params.gameId;
  const { gameState, dispatch, localPlayerId } = useGame();
  const { toast } = useToast();
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Effect for new player joining (workaround for no backend)
  useEffect(() => {
    if (isClient && gameId && localPlayerId && gameState) {
      const joiningPlayerData = localStorage.getItem(`dm_joining_player_${gameId}`);
      if (joiningPlayerData) {
        try {
          const joiningPlayer = JSON.parse(joiningPlayerData) as Player;
          // Only add if it's the current local player trying to join
          // and they are not already in the player list
          if (joiningPlayer.id === localPlayerId && !gameState.players.find(p => p.id === localPlayerId)) {
            if (gameState.players.length < MAX_PLAYERS) {
              dispatch({ type: 'ADD_PLAYER', payload: joiningPlayer });
              toast({ title: "Joined Lobby", description: `Welcome, ${joiningPlayer.name}!` });
            } else {
              toast({ title: "Lobby Full", description: "This lobby is already full.", variant: "destructive" });
              router.push('/'); // Redirect if lobby is full
            }
          }
        } catch (e) {
          console.error("Error parsing joining player data", e);
        } finally {
          localStorage.removeItem(`dm_joining_player_${gameId}`);
        }
      }
    }
  }, [isClient, gameId, localPlayerId, gameState, dispatch, toast, router]);


  const handleStartGame = async () => {
    if (!gameState || gameState.players.length !== MAX_PLAYERS) {
      toast({ title: "Not enough players", description: `Need ${MAX_PLAYERS} players to start. Currently ${gameState?.players.length || 0}.`, variant: "destructive" });
      return;
    }
    if (localPlayerId !== gameState.hostId) {
      toast({ title: "Only host can start", description: "Only the game host can start the game.", variant: "destructive" });
      return;
    }

    setIsStartingGame(true);
    try {
      toast({ title: "Starting Game...", description: "Generating words and clues with AI..." });
      const aiData = await callGenerateWordsAndCluesAI({ numberOfWords: 9 });
      if (!aiData || !aiData.words || aiData.words.length === 0) {
        throw new Error("AI failed to generate words.");
      }
      
      const { updatedPlayers, gameWords } = assignRolesAndClues(gameState.players, aiData);
      
      dispatch({
        type: 'START_GAME',
        payload: {
          words: gameWords,
          targetWord: aiData.targetWord,
          playersWithRoles: updatedPlayers,
        }
      });
      
      router.push(`/game/${gameId}`);
    } catch (error) {
      console.error("Failed to start game:", error);
      toast({ title: "Error Starting Game", description: (error as Error).message || "Could not start the game. Please try again.", variant: "destructive" });
      setIsStartingGame(false);
    }
  };

  const copyGameId = () => {
    if (!gameId) return;
    navigator.clipboard.writeText(gameId)
      .then(() => toast({ title: "Game ID Copied!", description: `${gameId} copied to clipboard.` }))
      .catch(() => toast({ title: "Copy Failed", description: "Could not copy Game ID.", variant: "destructive" }));
  };
  
  const handleLeaveLobby = () => {
    if (localPlayerId && gameState) {
      // If host leaves, in a real app, you'd handle host migration or game dissolution.
      // For this demo, if host leaves, other players might be stuck.
      // We'll just remove the player locally and redirect.
      dispatch({ type: 'REMOVE_PLAYER', payload: localPlayerId });
    }
    router.push('/');
    toast({ title: "Left Lobby", description: "You have left the game lobby." });
  };

  if (!isClient || !gameState) {
    return (
      <div className="flex flex-col items-center justify-center flex-grow">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-xl text-muted-foreground">Loading Lobby...</p>
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
            <p className="text-center text-muted-foreground py-10">No players yet. Be the first to join!</p>
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
