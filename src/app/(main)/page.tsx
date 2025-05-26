
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateShortId, initialGameState } from '@/lib/gameUtils'; // Import initialGameState
import { useToast } from '@/hooks/use-toast';
import { GameProvider, useGame } from '@/context/GameContext';
import type { Player } from '@/lib/types';
import { BrainCircuit } from 'lucide-react';


function HomePageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { dispatch, setLocalPlayerId, gameState } = useGame();

  const [username, setUsername] = useState('');
  const [gameIdToJoin, setGameIdToJoin] = useState('');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const storedUsername = localStorage.getItem('dm_username');
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    if (isClient) {
      localStorage.setItem('dm_username', e.target.value);
    }
  };
  
  const validateInputs = (isCreating: boolean): boolean => {
    if (!username.trim()) {
      toast({ title: "Username Required", description: "Please enter a username.", variant: "destructive" });
      return false;
    }
    if (username.trim().length < 3 || username.trim().length > 15) {
      toast({ title: "Invalid Username", description: "Username must be 3-15 characters.", variant: "destructive" });
      return false;
    }
    if (!isCreating && !gameIdToJoin.trim()) {
      toast({ title: "Game ID Required", description: "Please enter a Game ID to join.", variant: "destructive" });
      return false;
    }
    if(!isCreating && gameIdToJoin.trim().length !== 6){
      toast({ title: "Invalid Game ID", description: "Game ID must be 6 characters long.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleCreateGame = () => {
    if (!validateInputs(true)) return;

    const newGameId = generateShortId();
    const playerId = localPlayerId || generateShortId(8); // Use existing or generate new
    setLocalPlayerId(playerId);

    const hostPlayer: Player = {
      id: playerId,
      name: username,
      role: "Communicator", 
      isHost: true,
      isAlive: true,
    };
    
    if (isClient) {
      // Use initialGameState to create a complete GameState object
      const newGame = initialGameState(newGameId, hostPlayer);
      localStorage.setItem(`dm_gameState_${newGameId}`, JSON.stringify(newGame));
    }

    router.push(`/lobby/${newGameId}`);
    toast({ title: "Game Created!", description: `Game ID: ${newGameId}. Share this with your friends!` });
  };

  const handleJoinGame = () => {
    if (!validateInputs(false)) return;

    const playerId = localPlayerId || generateShortId(8); // Use existing or generate new
    setLocalPlayerId(playerId);

    const joiningPlayer: Player = {
      id: playerId,
      name: username,
      role: "Communicator", 
      isAlive: true,
    };

    if (isClient) {
      localStorage.setItem(`dm_joining_player_${gameIdToJoin}`, JSON.stringify(joiningPlayer));
    }

    router.push(`/lobby/${gameIdToJoin}`);
    toast({ title: "Joining Game...", description: `Attempting to join game ID: ${gameIdToJoin}` });
  };

  if (!isClient) {
    return null; 
  }

  return (
    <Tabs defaultValue="create" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="create">Create Game</TabsTrigger>
        <TabsTrigger value="join">Join Game</TabsTrigger>
      </TabsList>
      <TabsContent value="create">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BrainCircuit className="text-primary"/> New Mastermind Session</CardTitle>
            <CardDescription>Enter your username and start a new game of deception.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username-create">Username</Label>
              <Input id="username-create" placeholder="Your Mastermind Alias" value={username} onChange={handleUsernameChange} />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleCreateGame} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              Create Game
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>
      <TabsContent value="join">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BrainCircuit className="text-accent"/> Join the Intrigue</CardTitle>
            <CardDescription>Enter your username and the Game ID to join an existing session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username-join">Username</Label>
              <Input id="username-join" placeholder="Your Undercover Name" value={username} onChange={handleUsernameChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gameId">Game ID</Label>
              <Input id="gameId" placeholder="6-Character Code" value={gameIdToJoin} onChange={(e) => setGameIdToJoin(e.target.value.toUpperCase())} maxLength={6} />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleJoinGame} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
              Join Game
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

export default function HomePage() {
  return (
    <GameProvider> 
      <HomePageContent />
    </GameProvider>
  );
}
