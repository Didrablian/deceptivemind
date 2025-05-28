"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HiddenWordGameProvider, useHiddenWordGame } from '@/context/HiddenWordGameContext';
import { useToast } from '@/hooks/use-toast';
import { calculateRoleDistribution } from '@/lib/hiddenWordTypes';
import { 
  Search, 
  Users, 
  Settings, 
  MessageCircle, 
  Copy, 
  Crown, 
  Clock,
  Play,
  Loader2,
  Eye,
  EyeOff,
  Zap,
  Shield,
  Skull
} from 'lucide-react';

function HiddenWordLobbyContent() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { 
    gameState, 
    localPlayerId, 
    isLoading, 
    startGame, 
    sendChatMessage, 
    leaveGame 
  } = useHiddenWordGame();

  const [chatMessage, setChatMessage] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  const gameId = params.gameId as string;
  const localPlayer = gameState?.players.find(p => p.id === localPlayerId);
  const isHost = localPlayer?.isHost;

  useEffect(() => {
    if (gameState?.status === 'role-assignment' || gameState?.status === 'discussion') {
      router.push(`/hidden-word-game/${gameId}`);
    }
  }, [gameState?.status, gameId, router]);

  const handleCopyGameId = () => {
    navigator.clipboard.writeText(gameId);
    toast({ title: "Copied!", description: "Game ID copied to clipboard" });
  };

  const handleSendMessage = () => {
    if (chatMessage.trim()) {
      sendChatMessage(chatMessage.trim());
      setChatMessage('');
    }
  };

  const handleStartGame = async () => {
    setIsStarting(true);
    await startGame();
    setIsStarting(false);
  };

  const handleLeaveGame = async () => {
    await leaveGame();
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!gameState) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-center text-destructive">Game Not Found</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="mb-4">The game you're looking for doesn't exist.</p>
          <Button onClick={() => router.push('/')} variant="outline">
            Back to Home
          </Button>
        </CardContent>
      </Card>
    );
  }

  const roleDistribution = calculateRoleDistribution(gameState.players.length);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Search className="h-8 w-8 text-accent" />
          <h1 className="text-3xl font-bold">The Hidden Word</h1>
        </div>
        <div className="flex items-center justify-center gap-4">
          <Badge variant="secondary" className="text-lg px-4 py-2">
            Game ID: {gameId}
          </Badge>
          <Button variant="outline" size="sm" onClick={handleCopyGameId}>
            <Copy className="h-4 w-4 mr-1" />
            Copy
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Players Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Players ({gameState.players.length}/{gameState.maxPlayers})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {gameState.players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    player.id === localPlayerId ? 'bg-primary/10 border-primary' : 'bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {player.isHost && <Crown className="h-4 w-4 text-yellow-500" />}
                    <span className="font-medium">{player.name}</span>
                    {player.id === localPlayerId && (
                      <Badge variant="secondary" className="text-xs">You</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {gameState.players.length < gameState.minPlayers && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  Need at least {gameState.minPlayers - gameState.players.length} more player(s) to start.
                </p>
              </div>
            )}

            {/* Role Distribution */}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-semibold mb-2 text-blue-800">Role Distribution</h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <Shield className="h-3 w-3 text-green-600" />
                  <span>Villagers: {roleDistribution.villagers}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Skull className="h-3 w-3 text-red-600" />
                  <span>Imposters: {roleDistribution.imposters}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-purple-600" />
                  <span>Jester: {roleDistribution.jester}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Game Info & Controls */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Game Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Discussion Phase:</span>
                <span className="font-medium">{gameState.discussionDuration / 60} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Interrogation Phase:</span>
                <span className="font-medium">{gameState.interrogationDuration / 60} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Voting Phase:</span>
                <span className="font-medium">{gameState.votingDuration}s</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Player Range:</span>
                <span className="font-medium">{gameState.minPlayers}-{gameState.maxPlayers}</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              {isHost && (
                <Button 
                  onClick={handleStartGame}
                  className="w-full"
                  disabled={gameState.players.length < gameState.minPlayers || isStarting}
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Start Game
                    </>
                  )}
                </Button>
              )}
              
              <Button variant="outline" onClick={handleLeaveGame} className="w-full">
                Leave Game
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Chat Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Chat
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64 mb-4">
              <div className="space-y-2">
                {gameState.gameLog.map((log, index) => (
                  <div key={index} className="text-sm p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">{log}</span>
                  </div>
                ))}
                {gameState.chatMessages.map((message) => (
                  <div key={message.id} className="text-sm">
                    <span className="font-medium text-primary">{message.playerName}:</span>{' '}
                    {message.text}
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            <div className="flex gap-2">
              <Input
                placeholder="Type a message..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <Button onClick={handleSendMessage} size="sm">
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Game Rules */}
      <Card>
        <CardHeader>
          <CardTitle>How to Play - Social Deduction</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Roles */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Roles
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 mt-0.5 text-green-600" />
                  <div>
                    <div className="font-medium text-green-700">Villagers</div>
                    <div className="text-muted-foreground">Know the secret word. Eliminate all imposters to win.</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Skull className="h-4 w-4 mt-0.5 text-red-600" />
                  <div>
                    <div className="font-medium text-red-700">Imposters</div>
                    <div className="text-muted-foreground">Don't know the word. Blend in and eliminate villagers.</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Zap className="h-4 w-4 mt-0.5 text-purple-600" />
                  <div>
                    <div className="font-medium text-purple-700">Jester</div>
                    <div className="text-muted-foreground">Doesn't know the word. Wins by getting executed.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Phases */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Game Phases
              </h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">1. Discussion:</span> Talk about the secret word (don't say it!)</div>
                <div><span className="font-medium">2. Interrogation:</span> Make accusations and ask yes/no questions</div>
                <div><span className="font-medium">3. Voting:</span> Vote to execute someone</div>
                <div><span className="font-medium">4. Night Phase:</span> Imposters eliminate a player</div>
              </div>
            </div>

            {/* Victory */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Victory Conditions
              </h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium text-green-700">Villagers win:</span> All imposters eliminated</div>
                <div><span className="font-medium text-red-700">Imposters win:</span> Equal/outnumber villagers</div>
                <div><span className="font-medium text-purple-700">Jester wins:</span> Gets executed (solo victory)</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function HiddenWordLobbyPage() {
  const params = useParams();
  const gameId = params.gameId as string;

  return (
    <HiddenWordGameProvider gameIdFromParams={gameId}>
      <HiddenWordLobbyContent />
    </HiddenWordGameProvider>
  );
} 