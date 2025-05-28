"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { GameProvider, useGame } from '@/context/GameContext';
import { HiddenWordGameProvider, useHiddenWordGame } from '@/context/HiddenWordGameContext';
import { BrainCircuit, Loader2, BookOpen, Search, Users, Coins, CreditCard, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const GameCard = ({ 
  title, 
  description, 
  icon: Icon, 
  bgColor, 
  textColor, 
  onClick, 
  comingSoon = false 
}: {
  title: string;
  description: string;
  icon: any;
  bgColor: string;
  textColor: string;
  onClick: () => void;
  comingSoon?: boolean;
}) => (
  <Card className={`${bgColor} border-2 hover:scale-105 transition-transform cursor-pointer ${comingSoon ? 'opacity-50' : ''}`} onClick={comingSoon ? undefined : onClick}>
    <CardHeader>
      <CardTitle className={`flex items-center gap-3 ${textColor}`}>
        <Icon className="h-8 w-8" />
        {title}
        {comingSoon && <span className="text-sm bg-yellow-500 text-black px-2 py-1 rounded-full">Coming Soon</span>}
      </CardTitle>
      <CardDescription className={textColor}>{description}</CardDescription>
    </CardHeader>
    <CardContent>
      <div className={`text-sm ${textColor} opacity-80`}>
        {title === "Deceptive Mind" && "4-8 players • 15-30 min"}
        {title === "The Hidden Word" && "3-6 players • 10-20 min"}
      </div>
      {!comingSoon && (
        <div className="mt-3 pt-3 border-t border-current/20">
          <div className="flex justify-between items-center text-xs">
            <span className="text-green-600 font-medium">Free to Play</span>
            <span className={`${textColor} opacity-60`}>Premium: 50 credits</span>
          </div>
        </div>
      )}
    </CardContent>
  </Card>
);

// Component for Deceptive Mind game actions
function DeceptiveMindActions({ username, setUsername, isClient }: {
  username: string;
  setUsername: (value: string) => void;
  isClient: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { createGame, joinGame, localPlayerId } = useGame();
  const [gameIdToJoin, setGameIdToJoin] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

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
    if (!isCreatingGame && gameIdToJoin.trim().length !== 6) {
      toast({ title: "Invalid Game ID", description: "Game ID must be 6 characters long.", variant: "destructive" });
      return false;
    }
    if (!localPlayerId && isClient) {
      toast({ title: "Initializing...", description: "Please wait a moment.", variant: "default" });
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
    }
    setIsJoining(false);
  };

  return (
    <Tabs defaultValue="create" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="create">Create Game</TabsTrigger>
        <TabsTrigger value="join">Join Game</TabsTrigger>
      </TabsList>
      
      <TabsContent value="create">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="text-primary"/> 
              New Deceptive Mind Session
            </CardTitle>
            <CardDescription>
              Enter your username and start a new game of deception.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username-create">Username</Label>
              <Input 
                id="username-create" 
                placeholder="Your Game Alias" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleCreateGame} 
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" 
              disabled={isCreating || !localPlayerId}
            >
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isCreating ? 'Creating...' : 'Create Game'}
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>
      
      <TabsContent value="join">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="text-accent"/> 
              Join the Game
            </CardTitle>
            <CardDescription>
              Enter your username and the Game ID to join an existing session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username-join">Username</Label>
              <Input 
                id="username-join" 
                placeholder="Your Game Name" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gameId">Game ID</Label>
              <Input 
                id="gameId" 
                placeholder="6-Character Code" 
                value={gameIdToJoin} 
                onChange={(e) => setGameIdToJoin(e.target.value.toUpperCase())} 
                maxLength={6} 
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleJoinGame} 
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" 
              disabled={isJoining || !localPlayerId}
            >
              {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isJoining ? 'Joining...' : 'Join Game'}
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

// Component for Hidden Word game actions
function HiddenWordActions({ username, setUsername, isClient }: {
  username: string;
  setUsername: (value: string) => void;
  isClient: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { createGame, joinGame, localPlayerId } = useHiddenWordGame();
  const [gameIdToJoin, setGameIdToJoin] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

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
    if (!isCreatingGame && gameIdToJoin.trim().length !== 6) {
      toast({ title: "Invalid Game ID", description: "Game ID must be 6 characters long.", variant: "destructive" });
      return false;
    }
    if (!localPlayerId && isClient) {
      toast({ title: "Initializing...", description: "Please wait a moment.", variant: "default" });
      return false;
    }
    return true;
  };

  const handleCreateGame = async () => {
    if (!validateInputs(true) || isCreating) return;
    setIsCreating(true);
    
    const newGameId = await createGame(username);
    if (newGameId) {
      router.push(`/hidden-word-lobby/${newGameId}`);
      toast({ title: "Game Created!", description: `Game ID: ${newGameId}. Share this with your friends!` });
    }
    setIsCreating(false);
  };

  const handleJoinGame = async () => {
    if (!validateInputs(false) || isJoining) return;
    setIsJoining(true);

    const success = await joinGame(gameIdToJoin.toUpperCase(), username);
    if (success) {
      router.push(`/hidden-word-lobby/${gameIdToJoin.toUpperCase()}`);
      toast({ title: "Joining Game...", description: `Attempting to join game ID: ${gameIdToJoin.toUpperCase()}` });
    }
    setIsJoining(false);
  };

  return (
    <Tabs defaultValue="create" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="create">Create Game</TabsTrigger>
        <TabsTrigger value="join">Join Game</TabsTrigger>
      </TabsList>
      
      <TabsContent value="create">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="text-accent"/> 
              New Hidden Word Session
            </CardTitle>
            <CardDescription>
              Enter your username and start a new word guessing game.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username-create">Username</Label>
              <Input 
                id="username-create" 
                placeholder="Your Game Alias" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleCreateGame} 
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" 
              disabled={isCreating || !localPlayerId}
            >
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isCreating ? 'Creating...' : 'Create Game'}
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>
      
      <TabsContent value="join">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="text-primary"/> 
              Join the Game
            </CardTitle>
            <CardDescription>
              Enter your username and the Game ID to join an existing session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username-join">Username</Label>
              <Input 
                id="username-join" 
                placeholder="Your Game Name" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gameId">Game ID</Label>
              <Input 
                id="gameId" 
                placeholder="6-Character Code" 
                value={gameIdToJoin} 
                onChange={(e) => setGameIdToJoin(e.target.value.toUpperCase())} 
                maxLength={6} 
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleJoinGame} 
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" 
              disabled={isJoining || !localPlayerId}
            >
              {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isJoining ? 'Joining...' : 'Join Game'}
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

// Credits/Wallet Component
const CreditsWallet = () => {
  const [credits, setCredits] = useState(1250); // Mock credits balance
  const [showPurchase, setShowPurchase] = useState(false);

  const creditPackages = [
    { amount: 500, price: 1.49, bonus: 0, popular: false },
    { amount: 1200, price: 2.99, bonus: 200, popular: true },
    { amount: 2500, price: 5.99, bonus: 500, popular: false },
    { amount: 5500, price: 11.99, bonus: 1500, popular: false },
  ];

  return (
    <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-500 p-2 rounded-full">
            <Coins className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">Game Credits</h3>
            <p className="text-sm text-yellow-600 dark:text-yellow-300">
              Balance: <span className="font-bold text-lg">{credits.toLocaleString()}</span> credits
            </p>
          </div>
        </div>
        
        <Button 
          onClick={() => setShowPurchase(!showPurchase)}
          variant="outline" 
          size="sm"
          className="border-yellow-300 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-600 dark:text-yellow-300 dark:hover:bg-yellow-900/20"
        >
          <Plus className="h-4 w-4 mr-1" />
          Buy Credits
        </Button>
      </div>

      {showPurchase && (
        <div className="mt-4 pt-4 border-t border-yellow-200 dark:border-yellow-700">
          <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-3">Credit Packages</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {creditPackages.map((pkg, index) => (
              <div 
                key={index}
                className={`relative p-3 rounded-lg border cursor-pointer transition-all hover:scale-105 ${
                  pkg.popular 
                    ? 'border-yellow-400 bg-yellow-100 dark:bg-yellow-900/30' 
                    : 'border-yellow-200 bg-white dark:bg-yellow-950/20'
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                    <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">Popular</span>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-lg font-bold text-yellow-800 mb-1">
                    {pkg.amount.toLocaleString()}
                  </div>
                  {pkg.bonus > 0 && (
                    <div className="text-xs text-green-600 font-medium mb-1">
                      +{pkg.bonus} bonus
                    </div>
                  )}
                  <div className="text-sm text-yellow-600 mb-2">Credits</div>
                  <div className="text-lg font-semibold text-yellow-700">KWD {pkg.price}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-yellow-600 dark:text-yellow-400 text-center">
            <CreditCard className="h-3 w-3 inline mr-1" />
            Credits will be used for premium games, tournaments, and cosmetics in the future
          </div>
        </div>
      )}
    </div>
  );
};

function GamePlatformContent() {
  const [username, setUsername] = useState('');
  const [isClient, setIsClient] = useState(false);
  const [selectedGameType, setSelectedGameType] = useState<'deceptive-mind' | 'hidden-word' | null>(null);
  const [showGameActions, setShowGameActions] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const storedUsername = localStorage.getItem('dm_username');
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  const handleUsernameChange = (newUsername: string) => {
    setUsername(newUsername);
    if (isClient) {
      localStorage.setItem('dm_username', newUsername);
    }
  };

  const handleGameSelect = (gameType: 'deceptive-mind' | 'hidden-word') => {
    setSelectedGameType(gameType);
    setShowGameActions(true);
  };

  if (!isClient) {
    return <div className="flex justify-center items-center p-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!showGameActions) {
    return (
      <div className="space-y-8">
        <CreditsWallet />
        
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Game Platform
          </h1>
          <p className="text-lg text-muted-foreground">Choose your adventure and test your wits</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <GameCard
            title="Deceptive Mind"
            description="A thrilling game of deduction and deception. Work together to eliminate the wrong items while the imposter tries to mislead you."
            icon={BrainCircuit}
            bgColor="bg-gradient-to-br from-primary/20 to-primary/10"
            textColor="text-primary"
            onClick={() => handleGameSelect('deceptive-mind')}
          />
          
          <GameCard
            title="The Hidden Word"
            description="A thrilling social deduction game. Villagers know the secret word, imposters don't. Find the impostors before they eliminate you!"
            icon={Search}
            bgColor="bg-gradient-to-br from-accent/20 to-accent/10"
            textColor="text-accent"
            onClick={() => handleGameSelect('hidden-word')}
          />
        </div>
        
        <div className="text-center">
          <Button 
            variant="outline" 
            onClick={() => setShowGameActions(true)}
            className="min-w-[200px]"
          >
            <Users className="mr-2 h-4 w-4" />
            Join Any Game
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CreditsWallet />
      
      <div className="text-center">
        <Button 
          variant="ghost" 
          onClick={() => setShowGameActions(false)}
          className="mb-4"
        >
          ← Back to Games
        </Button>
        <h2 className="text-2xl font-bold">
          {selectedGameType === 'deceptive-mind' ? 'Deceptive Mind' : 
           selectedGameType === 'hidden-word' ? 'The Hidden Word' : 'Join Any Game'}
        </h2>
      </div>

      {selectedGameType === 'deceptive-mind' && (
        <GameProvider>
          <DeceptiveMindActions 
            username={username} 
            setUsername={handleUsernameChange} 
            isClient={isClient} 
          />
        </GameProvider>
      )}

      {selectedGameType === 'hidden-word' && (
        <HiddenWordGameProvider>
          <HiddenWordActions 
            username={username} 
            setUsername={handleUsernameChange} 
            isClient={isClient} 
          />
        </HiddenWordGameProvider>
      )}

      {!selectedGameType && (
        <div className="text-center p-8 border border-dashed border-muted-foreground/25 rounded-lg">
          <p className="text-muted-foreground">
            Use the join feature to enter a game with any 6-character game ID
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            The game type will be detected automatically
          </p>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return <GamePlatformContent />;
}
