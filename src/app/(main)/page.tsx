
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { GameProvider, useGame } from '@/context/GameContext'; // GameProvider wraps HomePageContent
import { BrainCircuit, Loader2 } from 'lucide-react';

function HomePageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { createGame, joinGame, localPlayerId, setLocalPlayerId: setContextLocalPlayerId } = useGame(); // Get functions from context

  const [username, setUsername] = useState('');
  const [gameIdToJoin, setGameIdToJoin] = useState('');
  const [isClient, setIsClient] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const storedUsername = localStorage.getItem('dm_username');
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUsername = e.target.value;
    setUsername(newUsername);
    if (isClient) {
      localStorage.setItem('dm_username', newUsername);
    }
  };
  
  const validateInputs = (isCreatingGame: boolean): boolean => {
    if (!username.trim()) {
      toast({ title: "Username Required", description: "Please enter a username.", variant: "destructive" });
      return false;
    }
    if (username.trim().length < 3 || username.trim().length > 15) {
      toast({ title: "Invalid Username", description: "Username must be 3-15 characters.", variant: "destructive" });
      return false;
    }
    if (!isCreatingGame && !gameIdToJoin.trim()) {
      toast({ title: "Game ID Required", description: "Please enter a Game ID to join.", variant: "destructive" });
      return false;
    }
    if(!isCreatingGame && gameIdToJoin.trim().length !== 6){
      toast({ title: "Invalid Game ID", description: "Game ID must be 6 characters long.", variant: "destructive" });
      return false;
    }
    if (!localPlayerId && isClient) { // Ensure localPlayerId is set before actions
        toast({ title: "Initializing...", description: "Please wait a moment.", variant: "default" });
        // Attempt to re-trigger localPlayerId initialization if needed, though context should handle it.
        // This check is more for user feedback.
        return false; 
    }
    return true;
  };

  const handleCreateGame = async () => {
    if (!validateInputs(true) || isCreating) return;
    setIsCreating(true);
    
    const newGameId = await createGame(username);
    if (newGameId) {
      router.push(`/lobby/${newGameId}`);
      toast({ title: "Game Created!", description: `Game ID: ${newGameId}. Share this with your friends!` });
    } else {
      // Error toast is handled by createGame in context
    }
    setIsCreating(false);
  };

  const handleJoinGame = async () => {
    if (!validateInputs(false) || isJoining) return;
    setIsJoining(true);

    const success = await joinGame(gameIdToJoin.toUpperCase(), username);
    if (success) {
      router.push(`/lobby/${gameIdToJoin.toUpperCase()}`);
      toast({ title: "Joining Game...", description: `Attempting to join game ID: ${gameIdToJoin.toUpperCase()}` });
    } else {
      // Error toast handled by joinGame in context
    }
    setIsJoining(false);
  };

  if (!isClient) {
    // Render nothing or a minimal loader on the server/initial client render before hydration
    return <div className="flex justify-center items-center p-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
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
            <Button onClick={handleCreateGame} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isCreating || !localPlayerId}>
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isCreating ? 'Creating...' : 'Create Game'}
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
            <Button onClick={handleJoinGame} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isJoining || !localPlayerId}>
              {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isJoining ? 'Joining...' : 'Join Game'}
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

// Wrap HomePageContent with GameProvider here if it's intended to be self-contained for the homepage context
// However, GameProvider is usually in a layout. If gameIdFromParams is not needed here,
// GameProvider can be initialized without it.
export default function HomePage() {
  return (
    <GameProvider> 
      <HomePageContent />
    </GameProvider>
  );
}
