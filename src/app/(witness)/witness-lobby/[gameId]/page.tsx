"use client";

import React, { use, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWitnessGame } from '@/context/WitnessGameContext';
import { useRouter } from 'next/navigation';
import { Copy, Users, Clock, Eye, Shield, Target, Gavel, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function WitnessLobbyPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const { gameState, localPlayer, isHost, startGame } = useWitnessGame();
  const router = useRouter();
  const { toast } = useToast();

  // Auto-redirect when game starts
  useEffect(() => {
    if (gameState && gameState.phase !== 'waiting' && gameState.phase !== 'finished') {
      router.push(`/witness-game/${gameId}`);
    }
  }, [gameState?.phase, router, gameId]);

  const copyGameId = () => {
    navigator.clipboard.writeText(gameId);
    toast({ title: "Copied!", description: "Game ID copied to clipboard" });
  };

  const handleStartGame = async () => {
    if (gameState && gameState.players.length >= 4) {
      await startGame();
      router.push(`/witness-game/${gameId}`);
    }
  };

  if (!gameState) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center">Loading game...</div>
      </div>
    );
  }

  const canStart = gameState.players.length >= 4 && gameState.players.length <= 10;

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-purple-800 dark:text-purple-300">
          🔍 Witness Game Lobby
        </h1>
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm text-muted-foreground">Game ID:</span>
          <Badge variant="outline" className="font-mono text-lg px-3 py-1">
            {gameId}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyGameId}
            className="h-8 w-8 p-0"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Players List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Players ({gameState.players.length}/10)
            </CardTitle>
            <CardDescription>
              Need 4-10 players to start
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {gameState.players.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    player.id === localPlayer?.id 
                      ? 'bg-purple-100 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-700' 
                      : 'bg-muted'
                  }`}
                >
                  <span className="font-medium">{player.name}</span>
                  <div className="flex items-center gap-2">
                    {index === 0 && (
                      <Badge variant="secondary" className="text-xs">
                        Host
                      </Badge>
                    )}
                    {player.id === localPlayer?.id && (
                      <Badge variant="outline" className="text-xs">
                        You
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {isHost && (
              <div className="mt-4 pt-4 border-t">
                <Button
                  onClick={handleStartGame}
                  disabled={!canStart}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  {canStart ? (
                    <>
                      Start Game <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    `Need ${4 - gameState.players.length} more players`
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Game Rules & Roles */}
        <div className="lg:col-span-2 space-y-6">
          {/* Game Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Game Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">3</div>
                  <div className="text-sm text-muted-foreground">Stages</div>
                </div>
                <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">5:30</div>
                  <div className="text-sm text-muted-foreground">Minutes</div>
                </div>
                <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">4-10</div>
                  <div className="text-sm text-muted-foreground">Players</div>
                </div>
              </div>
              
              <div className="mt-4 space-y-2">
                <h4 className="font-semibold">Stages:</h4>
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">1</Badge>
                    <span>Location Guess (2:00 min)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">2</Badge>
                    <span>Weapon Guess (2:00 min)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">3</Badge>
                    <span>Suspect Identification (1:30 min)</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Roles */}
          <Card>
            <CardHeader>
              <CardTitle>Player Roles</CardTitle>
              <CardDescription>
                Roles are randomly assigned when the game starts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="p-3 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Gavel className="h-4 w-4 text-blue-600" />
                      <span className="font-semibold text-blue-800 dark:text-blue-300">Judge</span>
                      <Badge variant="outline" className="text-xs">1 player</Badge>
                    </div>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Controls the game flow, selects answers each round. Doesn't know the words.
                    </p>
                  </div>

                  <div className="p-3 border border-green-200 dark:border-green-800 rounded-lg bg-green-50 dark:bg-green-950/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Eye className="h-4 w-4 text-green-600" />
                      <span className="font-semibold text-green-800 dark:text-green-300">Witness</span>
                      <Badge variant="outline" className="text-xs">1 player</Badge>
                    </div>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Knows both words. Must help the team without being too obvious.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="p-3 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-red-600" />
                      <span className="font-semibold text-red-800 dark:text-red-300">Suspect(s)</span>
                      <Badge variant="outline" className="text-xs">1-2 players</Badge>
                    </div>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      Know both words. Try to mislead the team and identify the Witness.
                    </p>
                  </div>

                  <div className="p-3 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-950/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-gray-600" />
                      <span className="font-semibold text-gray-800 dark:text-gray-300">Detective(s)</span>
                      <Badge variant="outline" className="text-xs">Remaining</Badge>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Don't know the words. Must deduce based on discussion and help find suspects.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Win Conditions */}
          <Card>
            <CardHeader>
              <CardTitle>Victory Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <h4 className="font-semibold text-green-800 dark:text-green-300 mb-1">
                    🏆 Team Victory
                  </h4>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Both Location and Weapon are guessed correctly AND the Witness is not exposed by the Suspects.
                  </p>
                </div>
                
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <h4 className="font-semibold text-red-800 dark:text-red-300 mb-1">
                    💀 Suspects Victory
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Either Location OR Weapon is guessed incorrectly, OR the Suspects successfully identify the Witness.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 