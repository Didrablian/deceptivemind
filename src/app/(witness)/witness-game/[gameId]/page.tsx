"use client";

import React, { use, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useWitnessGame } from '@/context/WitnessGameContext';
import { WitnessPlayer } from '@/lib/witnessTypes';
import { 
  Clock, 
  Eye, 
  Shield, 
  Target, 
  Gavel, 
  MapPin, 
  Sword, 
  Users,
  CheckCircle,
  XCircle,
  Crown
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function WitnessGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const { 
    gameState, 
    localPlayer, 
    selectWord, 
    selectSuspect, 
    voteWitness, 
    timeRemaining,
    isHost,
    restartGame
  } = useWitnessGame();
  const router = useRouter();

  // Redirect to lobby when game restarts
  useEffect(() => {
    if (gameState && gameState.phase === 'waiting' && gameState.players.every(p => p.role === null || p.role === undefined)) {
      router.push(`/witness-lobby/${gameId}`);
    }
  }, [gameState?.phase, gameState?.players, router, gameId]);

  if (!gameState || !localPlayer) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center">Loading game...</div>
      </div>
    );
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'judge': return <Gavel className="h-4 w-4" />;
      case 'witness': return <Eye className="h-4 w-4" />;
      case 'suspect': return <Target className="h-4 w-4" />;
      case 'detective': return <Shield className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'judge': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'witness': return 'text-green-600 bg-green-50 border-green-200';
      case 'suspect': return 'text-red-600 bg-red-50 border-red-200';
      case 'detective': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getPhaseDescription = () => {
    switch (gameState.phase) {
      case 'location-prep': return localPlayer.role === 'judge' ? 'Study locations and select when ready' : 'Study the Location words silently';
      case 'location-discussion': return localPlayer.role === 'judge' ? 'Listen to discussion and select the location' : 'Discuss which location it could be';
      case 'location-voting': return localPlayer.role === 'judge' ? 'Select the Location' : 'Judge is selecting the Location';
      case 'weapon-prep': return localPlayer.role === 'judge' ? 'Study weapons and select when ready' : 'Study the Weapon words silently';
      case 'weapon-discussion': return localPlayer.role === 'judge' ? 'Listen to discussion and select the weapon' : 'Discuss which weapon it could be';
      case 'weapon-voting': return localPlayer.role === 'judge' ? 'Select the Weapon' : 'Judge is selecting the Weapon';
      case 'suspect-discussion': return localPlayer.role === 'judge' ? 'Listen to discussion and select the suspect' : 'Discuss who you think is the Suspect';
      case 'suspect-voting': return 'Judge is selecting the Suspect';
      case 'reveal': return 'Game Over - Results revealed';
      case 'finished': return 'Game Finished';
      default: return 'Waiting...';
    }
  };

  const canPlayerKnowWords = (role: string) => {
    return role === 'witness' || role === 'suspect';
  };

  const shouldShowWords = () => {
    const knowsWords = canPlayerKnowWords(localPlayer.role || '');
    const isDiscussion = gameState.phase.includes('discussion') || gameState.phase.includes('prep');
    return knowsWords && isDiscussion;
  };

  const currentWords = gameState.phase.includes('location') 
    ? gameState.locationWords 
    : gameState.weaponWords;

  const correctWord = gameState.phase.includes('location')
    ? gameState.correctLocation
    : gameState.correctWeapon;

  const timeProgress = timeRemaining > 0 && gameState.phase !== 'reveal' && gameState.phase !== 'finished' ? (timeRemaining / 90) * 100 : 0;

  // Reset timer for game over phases
  const displayTimeRemaining = (gameState.phase === 'reveal' || gameState.phase === 'finished') ? 0 : timeRemaining;

  return (
    <div className="container mx-auto p-4 space-y-4">
      {/* Header with Timer and Phase */}
      {gameState.phase !== 'reveal' && gameState.phase !== 'finished' && (
        <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-2xl font-bold text-purple-800 dark:text-purple-300">
                  🔍 Witness Game
                </h1>
                <p className="text-sm text-muted-foreground">{getPhaseDescription()}</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-purple-600">
                  {Math.floor(displayTimeRemaining / 60)}:{(displayTimeRemaining % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-sm text-muted-foreground">Time Remaining</div>
              </div>
            </div>
            <Progress value={timeProgress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Game Over Header */}
      {(gameState.phase === 'reveal' || gameState.phase === 'finished') && (
        <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20">
          <CardContent className="p-4">
            <div className="text-center space-y-4">
              <div>
                <h1 className="text-3xl font-bold text-purple-800 dark:text-purple-300">
                  🏁 Game Over
                </h1>
                <p className="text-sm text-muted-foreground mt-2">Final Results</p>
              </div>
              
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => router.push('/')}
                  variant="outline"
                  className="min-w-[140px]"
                >
                  Leave Lobby
                </Button>
                {isHost && (
                  <Button
                    onClick={restartGame}
                    className="min-w-[140px] bg-purple-600 hover:bg-purple-700"
                  >
                    Play Again
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Your Role */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Your Role</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`p-3 rounded-lg border ${getRoleColor(localPlayer.role || '')}`}>
              <div className="flex items-center gap-2 mb-2">
                {getRoleIcon(localPlayer.role || '')}
                <span className="font-semibold capitalize">{localPlayer.role}</span>
              </div>
              <p className="text-xs">
                {localPlayer.role === 'judge' && 'Control the game flow and select answers'}
                {localPlayer.role === 'witness' && 'Help your team without being obvious'}
                {localPlayer.role === 'suspect' && 'Mislead the team and find the witness'}
                {localPlayer.role === 'detective' && 'Help find the suspects'}
              </p>
            </div>

            {/* Show words if player should know them */}
            {shouldShowWords() && (
              <div className="mt-4 space-y-2">
                <div className="text-sm font-semibold">Secret Words:</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <MapPin className="h-3 w-3" />
                    <span className="font-mono bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">
                      {gameState.correctLocation}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Sword className="h-3 w-3" />
                    <span className="font-mono bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded">
                      {gameState.correctWeapon}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Show clues for detectives */}
            {localPlayer.role === 'detective' && (gameState.phase.includes('discussion') || gameState.phase.includes('prep')) && (
              <div className="mt-4 space-y-2">
                <div className="text-sm font-semibold">Detective Clues:</div>
                <div className="space-y-1">
                  {localPlayer.locationClue && (
                    <div className="flex items-center gap-2 text-xs">
                      <MapPin className="h-3 w-3" />
                      <span className="font-mono bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded">
                        {localPlayer.locationClue}
                      </span>
                    </div>
                  )}
                  {localPlayer.weaponClue && (
                    <div className="flex items-center gap-2 text-xs">
                      <Sword className="h-3 w-3" />
                      <span className="font-mono bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded">
                        {localPlayer.weaponClue}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Game Area */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {gameState.phase.includes('location') ? <MapPin className="h-5 w-5" /> : 
               gameState.phase.includes('weapon') ? <Sword className="h-5 w-5" /> : <Users className="h-5 w-5" />}
              {gameState.phase.includes('location') ? 'Location Grid' : 
               gameState.phase.includes('weapon') ? 'Weapon Grid' : 'Suspect Selection'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Word Grid for Location/Weapon phases */}
            {(gameState.phase.includes('location') || gameState.phase.includes('weapon')) && (
              <div className="grid grid-cols-3 gap-3">
                {currentWords.map((word, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    className="h-16 text-sm font-medium hover:bg-purple-50 dark:hover:bg-purple-950/20"
                    onClick={() => {
                      if (localPlayer.role === 'judge') {
                        selectWord(word);
                      }
                    }}
                    disabled={localPlayer.role !== 'judge'}
                  >
                    {word}
                  </Button>
                ))}
              </div>
            )}

            {/* Player Selection for Suspect phase */}
            {gameState.phase.includes('suspect') && (
              <div className="space-y-3">
                {gameState.phase === 'suspect-discussion' && localPlayer.role !== 'judge' && (
                  <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-300">
                      Discuss who you think is the Suspect. The Judge will select one player.
                    </p>
                  </div>
                )}

                {gameState.phase === 'suspect-discussion' && localPlayer.role === 'judge' && !gameState.selectedSuspect && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Select the Suspect:</p>
                    <div className="grid grid-cols-1 gap-2">
                      {gameState.players
                        .filter(p => p.role !== 'judge')
                        .map((player) => (
                        <Button
                          key={player.id}
                          variant="outline"
                          className="justify-start h-12"
                          onClick={() => selectSuspect(player.id)}
                        >
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            <span>{player.name}</span>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {gameState.phase === 'suspect-discussion' && localPlayer.role !== 'judge' && !gameState.selectedSuspect && (
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      Judge is choosing a suspect...
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Game Results */}
            {gameState.phase === 'reveal' && (
              <div className="space-y-4">
                <div className="text-center">
                  {gameState.teamWon ? (
                    <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                      <h3 className="text-lg font-bold text-green-800 dark:text-green-300">
                        🏆 Team Victory!
                      </h3>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        Both words were guessed correctly and the Witness stayed hidden!
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
                      <XCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
                      <h3 className="text-lg font-bold text-red-800 dark:text-red-300">
                        💀 Suspects Victory!
                      </h3>
                      <p className="text-sm text-red-700 dark:text-red-300">
                        The team failed to protect the Witness or guess the words correctly.
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="p-3 bg-gray-50 dark:bg-gray-950/20 rounded-lg">
                    <div className="text-sm text-muted-foreground">Location</div>
                    <div className="font-semibold">{gameState.correctLocation}</div>
                    <div className="text-xs text-muted-foreground">
                      Selected: {gameState.selectedLocation || 'None'}
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-950/20 rounded-lg">
                    <div className="text-sm text-muted-foreground">Weapon</div>
                    <div className="font-semibold">{gameState.correctWeapon}</div>
                    <div className="text-xs text-muted-foreground">
                      Selected: {gameState.selectedWeapon || 'None'}
                    </div>
                  </div>
                </div>

                {/* Player Scores */}
                <div className="bg-gray-50 dark:bg-gray-950/20 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-center">Player Scores</h4>
                  <div className="space-y-2">
                    {gameState.players.map((player) => (
                      <div key={player.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded">
                        <div className="flex items-center gap-2">
                          {getRoleIcon(player.role || '')}
                          <span className="font-medium">{player.name}</span>
                          <Badge variant="outline" className={`text-xs ${getRoleColor(player.role || '')}`}>
                            {player.role}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">
                            {gameState.teamWon ? 
                              (player.role === 'suspect' ? '0' : '+100') : 
                              (player.role === 'suspect' ? '+100' : '0')
                            }
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {gameState.teamWon ? 
                              (player.role === 'suspect' ? 'Lost' : 'Won') : 
                              (player.role === 'suspect' ? 'Won' : 'Lost')
                            }
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={() => router.push('/')}
                    variant="outline"
                    className="min-w-[140px]"
                  >
                    Leave Lobby
                  </Button>
                  {isHost && (
                    <Button
                      onClick={restartGame}
                      className="min-w-[140px] bg-purple-600 hover:bg-purple-700"
                    >
                      Play Again
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Players List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Players</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {gameState.players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    player.id === localPlayer.id 
                      ? 'bg-purple-100 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-700' 
                      : 'bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {player.role === 'judge' ? getRoleIcon(player.role || '') : <Users className="h-4 w-4" />}
                    <span className="font-medium text-sm">{player.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {gameState.selectedSuspect === player.id && (
                      <Crown className="h-3 w-3 text-yellow-500" />
                    )}
                    {player.role === 'judge' && (
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getRoleColor(player.role || '')}`}
                      >
                        {player.role}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Game Progress */}
            <div className="mt-4 pt-4 border-t space-y-2">
              <div className="text-xs text-muted-foreground">Progress:</div>
              <div className="space-y-1">
                <div className="text-xs">
                  <span>Location: {gameState.selectedLocation || 'Pending'}</span>
                </div>
                <div className="text-xs">
                  <span>Weapon: {gameState.selectedWeapon || 'Pending'}</span>
                </div>
                <div className="text-xs">
                  <span>Suspect: {gameState.selectedSuspect ? 'Selected' : 'Pending'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 