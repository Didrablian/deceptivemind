"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateShortId } from '@/lib/gameUtils';
import { useToast } from '@/hooks/use-toast';
import { GameProvider, useGame } from '@/context/GameContext'; // Import GameProvider
import type { Player } from '@/lib/types';
import { BrainCircuit } from 'lucide-react';


function HomePageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { dispatch, setLocalPlayerId, gameState } = useGame(); // Use useGame hook

  const [username, setUsername] = useState('');
  const [gameIdToJoin, setGameIdToJoin] = useState('');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Attempt to retrieve username from local storage
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
    const playerId = generateShortId(8); // Unique ID for the player
    setLocalPlayerId(playerId);

    const hostPlayer: Player = {
      id: playerId,
      name: username,
      role: "Communicator", // Placeholder, will be assigned properly
      isHost: true,
      isAlive: true,
    };
    
    // Initialize game state via context
    // This is a simplified version. Ideally, backend confirms game creation.
    // For now, we'll set it up locally and navigate.
    // The GameProvider in (game)/layout.tsx will pick up this gameId.
    
    // Storing a minimal game setup intention for the lobby to pick up
    if (isClient) {
      const initialLobbyState = {
        gameId: newGameId,
        players: [hostPlayer],
        status: "lobby",
        hostId: hostPlayer.id,
      };
      localStorage.setItem(`dm_gameState_${newGameId}`, JSON.stringify(initialLobbyState));
    }

    router.push(`/lobby/${newGameId}`);
    toast({ title: "Game Created!", description: `Game ID: ${newGameId}. Share this with your friends!` });
  };

  const handleJoinGame = () => {
    if (!validateInputs(false)) return;

    const playerId = generateShortId(8);
    setLocalPlayerId(playerId);

    const joiningPlayer: Player = {
      id: playerId,
      name: username,
      role: "Communicator", // Placeholder
      isAlive: true,
    };

    // For demo: We assume the gameId exists. In a real app, you'd validate this gameId.
    // The lobby page will handle adding this player to the existing game state loaded from localStorage.
    if (isClient) {
       // A signal for the lobby to add this player. This is a workaround for no backend.
      localStorage.setItem(`dm_joining_player_${gameIdToJoin}`, JSON.stringify(joiningPlayer));
    }


    router.push(`/lobby/${gameIdToJoin}`);
    toast({ title: "Joining Game...", description: `Attempting to join game ID: ${gameIdToJoin}` });
  };

  if (!isClient) {
    return null; // Or a loading spinner
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


// Wrap HomePageContent with GameProvider so useGame can be used
export default function HomePage() {
  return (
    // The GameProvider here is mainly for setLocalPlayerId. 
    // The main game state management will be in (game)/layout.tsx's GameProvider.
    <GameProvider> 
      <HomePageContent />
    </GameProvider>
  );
}
