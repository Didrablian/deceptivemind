"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HiddenWordGameProvider, useHiddenWordGame } from '@/context/HiddenWordGameContext';
import { useToast } from '@/hooks/use-toast';
import { 
  Search, 
  Clock, 
  Trophy, 
  Send, 
  Users,
  Crown,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowRight,
  Eye,
  EyeOff,
  MessageSquare,
  Gavel,
  Vote,
  Skull,
  Shield,
  Zap
} from 'lucide-react';

function HiddenWordGameContent() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { 
    gameState, 
    localPlayerId, 
    isLoading, 
    makeAccusation,
    askQuestion,
    answerQuestion,
    submitVote,
    killPlayer,
    sendChatMessage,
    startNextPhase,
    leaveGame 
  } = useHiddenWordGame();

  const [chatMessage, setChatMessage] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const gameId = params.gameId as string;
  const localPlayer = gameState?.players.find(p => p.id === localPlayerId);
  const isHost = localPlayer?.isHost;
  const alivePlayers = gameState?.players.filter(p => p.isAlive) || [];
  const deadPlayers = gameState?.players.filter(p => !p.isAlive) || [];

  // Timer effect
  useEffect(() => {
    if (gameState?.phaseStartTime && (gameState.status === 'discussion' || gameState.status === 'interrogation' || gameState.status === 'voting')) {
      const startTime = typeof gameState.phaseStartTime === 'number' 
        ? gameState.phaseStartTime 
        : gameState.phaseStartTime.toDate().getTime();
      
      let duration = 0;
      if (gameState.status === 'discussion') duration = gameState.discussionDuration;
      else if (gameState.status === 'interrogation') duration = gameState.interrogationDuration;
      else if (gameState.status === 'voting') duration = gameState.votingDuration;
      
      if (duration > 0) {
        const updateTimer = () => {
          const elapsed = (Date.now() - startTime) / 1000;
          const remaining = Math.max(0, duration - elapsed);
          setTimeRemaining(remaining);
        };

        updateTimer(); // Initial update
        const timer = setInterval(updateTimer, 1000);

        return () => clearInterval(timer);
      }
    } else {
      setTimeRemaining(0);
    }
  }, [gameState?.status, gameState?.phaseStartTime, gameState?.discussionDuration, gameState?.interrogationDuration, gameState?.votingDuration]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatScrollRef.current) {
      const scrollContainer = chatScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [gameState?.chatMessages, gameState?.gameLog]);

  const handleSendMessage = () => {
    if (chatMessage.trim()) {
      sendChatMessage(chatMessage.trim());
      setChatMessage('');
    }
  };

  const handleAskQuestion = () => {
    if (questionText.trim()) {
      askQuestion(questionText.trim());
      setQuestionText('');
    }
  };

  const handleLeaveGame = async () => {
    await leaveGame();
    router.push('/');
  };

  const handlePlayAgain = () => {
    router.push(`/hidden-word-lobby/${gameId}`);
  };

  const handleLeaveLobby = async () => {
    await leaveGame();
    router.push('/');
  };

  const progressPercentage = (() => {
    let duration = 0;
    if (gameState?.status === 'discussion') duration = gameState.discussionDuration;
    else if (gameState?.status === 'interrogation') duration = gameState.interrogationDuration;
    else if (gameState?.status === 'voting') duration = gameState.votingDuration;
    
    return duration > 0 ? Math.max(0, (timeRemaining / duration) * 100) : 0;
  })();

  const getRoleIcon = (role?: string) => {
    switch (role) {
      case 'villager': return <Shield className="h-4 w-4 text-green-600" />;
      case 'imposter': return <Skull className="h-4 w-4 text-red-600" />;
      case 'jester': return <Zap className="h-4 w-4 text-purple-600" />;
      default: return null;
    }
  };

  const getRoleColor = (role?: string) => {
    switch (role) {
      case 'villager': return 'bg-green-50 border-green-200 text-green-800';
      case 'imposter': return 'bg-red-50 border-red-200 text-red-800';
      case 'jester': return 'bg-purple-50 border-purple-200 text-purple-800';
      default: return 'bg-gray-50 border-gray-200 text-gray-800';
    }
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

  if (gameState.status === 'lobby') {
    router.push(`/hidden-word-lobby/${gameId}`);
    return null;
  }

  // Role Assignment Screen
  if (gameState.status === 'role-assignment') {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-6">
        <h1 className="text-4xl font-bold">Role Assignment</h1>
        
        {localPlayer?.role && (
          <Card className={`${getRoleColor(localPlayer.role)} border-2`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-3 text-2xl">
                {getRoleIcon(localPlayer.role)}
                You are a {localPlayer.role.charAt(0).toUpperCase() + localPlayer.role.slice(1)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {localPlayer.role === 'villager' && (
                <div>
                  <p className="text-lg mb-2">The secret word is:</p>
                  <div className="text-3xl font-bold bg-white/70 p-4 rounded-lg">
                    {gameState.secretWord}
                  </div>
                  <p className="mt-2 text-sm">Discuss this word without saying it directly. Find the imposters!</p>
                </div>
              )}
              
              {localPlayer.role === 'imposter' && (
                <div>
                  <p className="text-lg">You don't know the secret word.</p>
                  <p>Listen carefully and try to blend in with the discussion.</p>
                  <p className="mt-2 text-sm">Eliminate villagers during night phases to win!</p>
                </div>
              )}
              
              {localPlayer.role === 'jester' && (
                <div>
                  <p className="text-lg">You don't know the secret word.</p>
                  <p>Try to act suspicious so you get voted out!</p>
                  <p className="mt-2 text-sm">You win if you're executed during voting!</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        
        <p className="text-muted-foreground">Game starts in a few seconds...</p>
      </div>
    );
  }

  // Game Finished Screen
  if (gameState.status === 'game-finished') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-3xl">🎉 Game Finished! 🎉</CardTitle>
            <CardDescription>{gameState.winnerMessage}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-6xl font-bold text-accent">
              {gameState.winner === 'villagers' && '🛡️ Villagers Win!'}
              {gameState.winner === 'imposters' && '💀 Imposters Win!'}
              {gameState.winner === 'jester' && '🃏 Jester Wins!'}
            </div>
            
            <Separator />
            
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Final Results</h3>
              <div className="text-lg mb-4">The secret word was: <span className="font-bold">{gameState.secretWord}</span></div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Alive Players</h4>
                  {alivePlayers.map((player) => (
                    <div key={player.id} className="flex items-center justify-between p-2 rounded border bg-green-50">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(player.role)}
                        <span>{player.name}</span>
                        {player.isHost && <Crown className="h-3 w-3 text-yellow-500" />}
                      </div>
                      <Badge variant="secondary">{player.role}</Badge>
                    </div>
                  ))}
                </div>
                
                {deadPlayers.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Eliminated Players</h4>
                    {deadPlayers.map((player) => (
                      <div key={player.id} className="flex items-center justify-between p-2 rounded border bg-red-50">
                        <div className="flex items-center gap-2">
                          {getRoleIcon(player.role)}
                          <span className="line-through opacity-60">{player.name}</span>
                          {player.isHost && <Crown className="h-3 w-3 text-yellow-500" />}
                        </div>
                        <Badge variant="outline">{player.role}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-4 justify-center">
              <Button onClick={handlePlayAgain} size="lg" className="bg-green-600 hover:bg-green-700">
                Play Again
              </Button>
              <Button onClick={handleLeaveLobby} variant="outline" size="lg">
                Leave Lobby
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Search className="h-8 w-8 text-accent" />
          <h1 className="text-3xl font-bold">The Hidden Word</h1>
        </div>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Badge variant="secondary" className="text-lg px-4 py-2">
            Round {gameState.currentRound} - {gameState.status.charAt(0).toUpperCase() + gameState.status.slice(1).replace('-', ' ')}
          </Badge>
          {localPlayer?.role && (
            <Badge className={getRoleColor(localPlayer.role)}>
              {getRoleIcon(localPlayer.role)}
              <span className="ml-1">{localPlayer.role.charAt(0).toUpperCase() + localPlayer.role.slice(1)}</span>
            </Badge>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLeaveGame}
            className="text-destructive border-destructive hover:bg-destructive/10"
          >
            <ArrowRight className="h-4 w-4 mr-1 rotate-180" />
            Quit Game
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Game Area */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{gameState.status.charAt(0).toUpperCase() + gameState.status.slice(1).replace('-', ' ')} Phase</span>
              {(gameState.status === 'discussion' || gameState.status === 'interrogation' || gameState.status === 'voting') && (
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  <span className="text-2xl font-mono">
                    {Math.ceil(timeRemaining)}s
                  </span>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Timer Progress - Only show for timed phases */}
            {(gameState.status === 'discussion' || gameState.status === 'interrogation' || gameState.status === 'voting') && (
              <div className="space-y-2">
                <Progress value={progressPercentage} className="h-3" />
                <p className="text-sm text-muted-foreground text-center">
                  Time remaining: {Math.ceil(timeRemaining)} seconds
                </p>
              </div>
            )}

            {/* Secret Word Display (for villagers only) */}
            {localPlayer?.role === 'villager' && (
              <Card className="bg-green-50 border-green-200">
                <CardHeader>
                  <CardTitle className="text-center text-green-800 flex items-center justify-center gap-2">
                    <Eye className="h-5 w-5" />
                    Secret Word
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl text-center font-bold text-green-900">
                    {gameState.secretWord}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Phase-specific content */}
            {gameState.status === 'discussion' && (
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-blue-800 flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Discussion Phase
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-blue-900">
                    {localPlayer?.role === 'villager' && "Discuss the secret word without saying it directly. Try to identify who doesn't know the word."}
                    {localPlayer?.role === 'imposter' && "Listen carefully and try to blend in. Pretend you know the secret word."}
                    {localPlayer?.role === 'jester' && "Act suspicious to make others want to vote you out!"}
                  </p>
                </CardContent>
              </Card>
            )}

            {gameState.status === 'interrogation' && (
              <div className="space-y-4">
                <Card className="bg-orange-50 border-orange-200">
                  <CardHeader>
                    <CardTitle className="text-orange-800 flex items-center gap-2">
                      <Gavel className="h-5 w-5" />
                      Interrogation Phase - 10 seconds to accuse!
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!gameState.currentAccusation && (
                      <div>
                        <p className="text-orange-900 mb-4">
                          Make accusations quickly! One will be randomly selected.
                        </p>
                        
                        {/* Show pending accusations */}
                        {gameState.pendingAccusations && gameState.pendingAccusations.length > 0 && (
                          <div className="mb-4 p-3 bg-white/70 rounded">
                            <p className="font-medium mb-2">Pending Accusations:</p>
                            {gameState.pendingAccusations.map((acc, index) => (
                              <div key={index} className="text-sm">
                                • {acc.accuserName} → {acc.accusedName}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-2">
                          {alivePlayers
                            .filter(p => p.id !== localPlayerId && p.isAlive)
                            .map(player => (
                              <Button
                                key={player.id}
                                onClick={() => makeAccusation(player.id)}
                                variant="outline"
                                size="sm"
                                disabled={!localPlayer?.isAlive || gameState.pendingAccusations?.some(acc => acc.accuserId === localPlayerId)}
                              >
                                Accuse {player.name}
                              </Button>
                            ))}
                        </div>
                        
                        {gameState.pendingAccusations?.some(acc => acc.accuserId === localPlayerId) && (
                          <p className="text-sm text-green-600 mt-2">✓ Your accusation submitted!</p>
                        )}
                      </div>
                    )}

                    {gameState.currentAccusation && (
                      <div className="space-y-4">
                        <div className="bg-white/70 p-3 rounded">
                          <p className="font-bold">
                            {gameState.currentAccusation.accuserName} accused {gameState.currentAccusation.accusedName}!
                          </p>
                        </div>

                        {/* Questions */}
                        <div className="space-y-2">
                          {gameState.currentAccusation.questions.map((q, index) => (
                            <div key={index} className="bg-white/70 p-2 rounded text-sm">
                              <div className="font-medium">Q: {q.question}</div>
                              {q.answer !== undefined && (
                                <div className="text-muted-foreground">
                                  A: {q.answer ? "Yes" : "No"}
                                </div>
                              )}
                              {q.answer === undefined && gameState.currentAccusation?.accusedId === localPlayerId && (
                                <div className="flex gap-2 mt-2">
                                  <Button size="sm" onClick={() => answerQuestion(true)}>Yes</Button>
                                  <Button size="sm" variant="outline" onClick={() => answerQuestion(false)}>No</Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Ask question (accuser only) */}
                        {gameState.currentAccusation.accuserId === localPlayerId && 
                         gameState.currentAccusation.questions.length < 3 &&
                         (gameState.currentAccusation.questions.length === 0 || 
                          gameState.currentAccusation.questions[gameState.currentAccusation.questions.length - 1].answer !== undefined) && (
                          <div className="flex gap-2">
                            <Input
                              placeholder="Ask a yes/no question..."
                              value={questionText}
                              onChange={(e) => setQuestionText(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                            />
                            <Button onClick={handleAskQuestion} disabled={!questionText.trim()}>
                              Ask
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {gameState.status === 'voting' && (
              <Card className="bg-purple-50 border-purple-200">
                <CardHeader>
                  <CardTitle className="text-purple-800 flex items-center gap-2">
                    <Vote className="h-5 w-5" />
                    Voting Phase
                    {timeRemaining > 0 && (
                      <span className="ml-auto text-sm font-mono bg-purple-100 px-2 py-1 rounded">
                        {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-purple-900 mb-4">
                    Vote to hang someone! If tied, the accuser is executed.
                  </p>
                  
                  {localPlayer?.isAlive && !gameState.votes.find(v => v.playerId === localPlayerId) && (
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {/* During voting, only show accuser and accused as options */}
                      {gameState.currentAccusation ? 
                        [gameState.currentAccusation.accuserId, gameState.currentAccusation.accusedId]
                          .map(playerId => gameState.players.find(p => p.id === playerId))
                          .filter(player => player?.isAlive)
                          .map(player => (
                            <Button
                              key={player!.id}
                              onClick={() => submitVote(player!.id)}
                              variant={player!.id === localPlayerId ? "secondary" : "outline"}
                              size="sm"
                            >
                              Hang {player!.name} {player!.id === localPlayerId && "(yourself)"}
                            </Button>
                          ))
                        :
                        alivePlayers.map(player => (
                          <Button
                            key={player.id}
                            onClick={() => submitVote(player.id)}
                            variant={player.id === localPlayerId ? "secondary" : "outline"}
                            size="sm"
                          >
                            Hang {player.name} {player.id === localPlayerId && "(yourself)"}
                          </Button>
                        ))
                      }
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-sm text-purple-800">
                      Votes cast: {gameState.votes.length} / {alivePlayers.length}
                    </div>
                    
                    {/* Show anonymous vote counts */}
                    {gameState.votes.length > 0 && (
                      <div className="bg-white/70 p-3 rounded">
                        <p className="font-medium mb-2">Current Vote Counts:</p>
                        {(() => {
                          const voteCounts: Record<string, number> = {};
                          gameState.votes.forEach(vote => {
                            voteCounts[vote.votedForId] = (voteCounts[vote.votedForId] || 0) + 1;
                          });
                          
                          return Object.entries(voteCounts)
                            .sort(([,a], [,b]) => b - a)
                            .map(([playerId, count]) => {
                              const player = gameState.players.find(p => p.id === playerId);
                              return (
                                <div key={playerId} className="text-sm flex justify-between">
                                  <span>{player?.name}</span>
                                  <span className="font-medium">{count} vote{count !== 1 ? 's' : ''}</span>
                                </div>
                              );
                            });
                        })()}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {gameState.status === 'imposter-kill' && (
              <Card className="bg-red-50 border-red-200">
                <CardHeader>
                  <CardTitle className="text-red-800 flex items-center gap-2">
                    <Skull className="h-5 w-5" />
                    Night Phase
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {localPlayer?.role === 'imposter' && localPlayer.isAlive ? (
                    <div>
                      <p className="text-red-900 mb-4">Choose a player to eliminate:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {alivePlayers
                          .filter(p => p.role !== 'imposter' && p.isAlive)
                          .map(player => (
                            <Button
                              key={player.id}
                              onClick={() => killPlayer(player.id)}
                              variant="destructive"
                              size="sm"
                            >
                              Eliminate {player.name}
                            </Button>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-red-900">The imposters are choosing their target...</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Host Controls */}
            {isHost && (gameState.status === 'discussion' || gameState.status === 'interrogation' || gameState.status === 'voting') && timeRemaining === 0 && (
              <div className="text-center">
                <Button onClick={startNextPhase} size="lg">
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Next Phase
                </Button>
              </div>
            )}

            {/* Skip Timer Button for Testing (Host Only) */}
            {isHost && gameState.status === 'discussion' && timeRemaining > 0 && (
              <div className="text-center">
                <Button onClick={startNextPhase} variant="outline" size="sm">
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Skip Timer (Testing)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Players & Chat Panel */}
        <div className="space-y-6">
          {/* Players */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Players
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {gameState.players.map((player) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-2 rounded ${
                      player.id === localPlayerId ? 'bg-primary/10' : player.isAlive ? 'bg-muted/50' : 'bg-red-50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {player.isHost && <Crown className="h-3 w-3 text-yellow-500" />}
                      <span className={`text-sm font-medium ${!player.isAlive ? 'line-through' : ''}`}>
                        {player.name}
                      </span>
                      {player.id === localPlayerId && <Badge variant="secondary" className="text-xs">You</Badge>}
                      {!player.isAlive && <Skull className="h-3 w-3 text-red-500" />}
                    </div>
                    <div className="flex items-center gap-1">
                      {gameState.votes.find(v => v.playerId === player.id) && (
                        <CheckCircle className="h-3 w-3 text-green-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Chat */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Chat
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48 mb-4" ref={chatScrollRef}>
                <div className="space-y-2">
                  {gameState.gameLog.slice(-10).map((log, index) => (
                    <div key={index} className="text-sm p-2 bg-muted/50 rounded">
                      <span className="text-muted-foreground">{log}</span>
                    </div>
                  ))}
                  {gameState.chatMessages.slice(-10).map((message) => (
                    <div key={message.id} className="text-sm">
                      <span className="font-medium text-primary">{message.playerName}:</span>{' '}
                      {message.text}
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              {localPlayer?.isAlive && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <Button onClick={handleSendMessage} size="sm">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function HiddenWordGamePage() {
  const params = useParams();
  const gameId = params.gameId as string;

  return (
    <HiddenWordGameProvider gameIdFromParams={gameId}>
      <HiddenWordGameContent />
    </HiddenWordGameProvider>
  );
} 