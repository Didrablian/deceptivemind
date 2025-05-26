
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '@/context/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Player, GameWord } from '@/lib/types';
import { Send, Users, ShieldAlert, HelpCircle, Eye, MessageSquare, Loader2, Trash2, CheckSquare, ZoomIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const WordDisplay: React.FC<{ 
  word: GameWord, 
  player: Player, 
  isCommunicator: boolean,
  onEliminate?: (wordText: string) => void,
  onSelectForLockIn?: (wordText: string) => void,
  isSelectedForLockIn?: boolean,
  gameStatus: GameState['status'],
}> = ({ word, player, isCommunicator, onEliminate, onSelectForLockIn, isSelectedForLockIn, gameStatus }) => {
  const knowsTarget = player.role === 'Helper' || player.role === 'Imposter';
  let highlightClass = knowsTarget && word.isTarget ? 'bg-accent/20 border-accent ring-2 ring-accent' : 'bg-card hover:bg-secondary/30';
  if (word.isEliminated) {
    highlightClass = 'bg-muted/50 text-muted-foreground line-through opacity-70';
  } else if (isSelectedForLockIn) {
    highlightClass = 'ring-2 ring-primary bg-primary/10';
  }

  const canEliminate = isCommunicator && !word.isEliminated && (gameStatus === 'discussion' || gameStatus === 'word-elimination');
  const canSelectForLockIn = !word.isEliminated && (gameStatus === 'discussion' || gameStatus === 'word-elimination');

  return (
    <div 
      className={`p-3 rounded-lg shadow text-center font-medium text-lg transition-all relative ${highlightClass} ${ (canEliminate || canSelectForLockIn) ? 'cursor-pointer' : ''}`}
      onClick={() => {
        if (canEliminate && onEliminate) {
          // Handled by explicit button now
        } else if (canSelectForLockIn && onSelectForLockIn) {
          onSelectForLockIn(word.text);
        }
      }}
    >
      {word.text}
      {knowsTarget && word.isTarget && !word.isEliminated && <Badge variant="outline" className="ml-2 border-accent text-accent text-xs">TARGET</Badge>}
      {word.isEliminated && <Badge variant="destructive" className="absolute top-1 right-1 text-xs">GONE</Badge>}
      
      {canEliminate && onEliminate && (
         <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="absolute bottom-1 right-1 opacity-80 hover:opacity-100" onClick={(e) => e.stopPropagation()}>
              <Trash2 className="w-3 h-3"/>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminate "{word.text}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. Are you sure you want to eliminate this word?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => {e.stopPropagation(); onEliminate(word.text);}} className="bg-destructive hover:bg-destructive/90">Confirm Elimination</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};

const PlayerCard: React.FC<{ 
  player: Player, 
  isLocalPlayer: boolean, 
  isAccuserRole: boolean, // True if local player is Imposter in post-guess-reveal
  onAccuseHelper?: (playerId: string) => void,
  gameStatus: GameState['status']
}> = ({ player, isLocalPlayer, isAccuserRole, onAccuseHelper, gameStatus }) => {
  let icon;
  // Show roles if game is in post-guess-reveal or finished, or if it's the local player
  const showRealRole = gameStatus === 'post-guess-reveal' || gameStatus === 'finished' || isLocalPlayer || player.isRevealedImposter;

  if (showRealRole) {
    switch (player.role) {
      case 'Communicator': icon = <Eye className="w-4 h-4 text-blue-500" />; break;
      case 'Helper': icon = <HelpCircle className="w-4 h-4 text-green-500" />; break;
      case 'Imposter': icon = <ShieldAlert className="w-4 h-4 text-red-500" />; break;
      case 'ClueHolder': icon = <MessageSquare className="w-4 h-4 text-yellow-500" />; break;
    }
  } else {
    icon = <Users className="w-4 h-4 text-muted-foreground" />;
  }

  return (
    <div className="flex items-center justify-between p-2 border-b last:border-b-0">
      <div className="flex items-center gap-2">
        {icon}
        <span className={`font-medium ${isLocalPlayer ? 'text-primary' : ''}`}>{player.name}</span>
        {isLocalPlayer && <Badge variant="outline">(You)</Badge>}
        {showRealRole && <Badge variant="secondary" className="text-xs">{player.role}</Badge>}
         {player.isRevealedImposter && !isLocalPlayer && <Badge variant="destructive" className="text-xs">Imposter</Badge>}
      </div>
      {isAccuserRole && !isLocalPlayer && player.isAlive && onAccuseHelper && gameStatus === 'post-guess-reveal' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">Accuse Helper</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Accuse {player.name} of being the Helper?</AlertDialogTitle>
              <AlertDialogDescription>
                If you are correct, Imposters win. If wrong, Team wins. This action is final.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onAccuseHelper(player.id)} className="bg-destructive hover:bg-destructive/90">Confirm Accusation</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};


export default function GameplayScreen() {
  const { gameState, localPlayerId, sendChatMessage, eliminateWord, lockInWord, imposterAccuseHelperInTwist, isLoading } = useGame();
  const [chatInput, setChatInput] = useState('');
  const [selectedWordToLockIn, setSelectedWordToLockIn] = useState<string | null>(null);
  const { toast } = useToast();
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [gameState?.chatMessages]);

  if (isLoading || !gameState || !localPlayerId) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary m-auto" /></div>;
  }

  const localPlayer = gameState.players.find(p => p.id === localPlayerId);
  if (!localPlayer) {
    return <p className="text-center text-destructive p-4">Error: Local player data not found.</p>;
  }

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    await sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  const handleEliminateWord = async (wordText: string) => {
    if (localPlayer.role !== 'Communicator') {
      toast({title: "Invalid Action", description: "Only the Communicator can eliminate words.", variant: "destructive"});
      return;
    }
    await eliminateWord(wordText);
  };

  const handleLockInWord = async () => {
    if (!selectedWordToLockIn) {
      toast({title: "No Word Selected", description: "Please select a word from the grid to lock in.", variant: "default"});
      return;
    }
    await lockInWord(selectedWordToLockIn);
    setSelectedWordToLockIn(null); // Reset selection
  };

  const handleImposterAccuseHelper = async (accusedPlayerId: string) => {
    await imposterAccuseHelperInTwist(accusedPlayerId);
  };
  
  const isCommunicator = localPlayer.role === 'Communicator';
  const isImposterDuringTwist = localPlayer.role === 'Imposter' && gameState.status === 'post-guess-reveal';

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full flex-grow p-1 sm:p-4 bg-background rounded-lg shadow-inner">
      {/* Left Panel: Players & Info */}
      <Card className="lg:w-1/3 flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="text-primary" /> Players</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow overflow-y-auto space-y-2">
          {gameState.players.map(p => (
            <PlayerCard 
              key={p.id} 
              player={p} 
              isLocalPlayer={p.id === localPlayer.id}
              isAccuserRole={isImposterDuringTwist}
              onAccuseHelper={handleImposterAccuseHelper}
              gameStatus={gameState.status}
            />
          ))}
        </CardContent>
        <CardFooter className="p-4 border-t">
          <div className="text-sm text-muted-foreground">
            <p>Status: <Badge variant={gameState.status === 'finished' ? 'default' : 'secondary'}>{gameState.status.replace('-', ' ').toUpperCase()}</Badge></p>
            <p>Eliminations: {gameState.eliminationCount}/{gameState.maxEliminations}</p>
            {gameState.status === 'post-guess-reveal' && localPlayer.role === 'Imposter' && (
              <p className="text-accent font-semibold mt-2">Your team guessed the word! Now, identify the Helper from the players list.</p>
            )}
            {gameState.status === 'post-guess-reveal' && localPlayer.role !== 'Imposter' && (
              <p className="text-primary font-semibold mt-2">The team guessed the word! Waiting for Imposters to accuse the Helper...</p>
            )}
          </div>
        </CardFooter>
      </Card>

      {/* Middle Panel: Word Grid & Actions */}
      <Card className="lg:w-1/3 flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
             <ZoomIn className="w-6 h-6 text-primary"/> Words on the Board
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-grow grid grid-cols-3 gap-2 sm:gap-3 p-2 sm:p-4">
          {gameState.words.map((wordObj) => (
            <WordDisplay 
              key={wordObj.text} 
              word={wordObj} 
              player={localPlayer} 
              isCommunicator={isCommunicator}
              onEliminate={isCommunicator ? handleEliminateWord : undefined}
              onSelectForLockIn={setSelectedWordToLockIn}
              isSelectedForLockIn={selectedWordToLockIn === wordObj.text}
              gameStatus={gameState.status}
            />
          ))}
        </CardContent>
        <CardFooter className="p-4 border-t flex-col space-y-2">
          {localPlayer.clue && (
            <div className="text-center w-full mb-2">
                <p className="text-sm text-muted-foreground">Your Clue:</p>
                <p className="font-semibold text-primary italic">{localPlayer.clue}</p>
            </div>
          )}
          {(gameState.status === 'discussion' || gameState.status === 'word-elimination') && (
             <Button 
                onClick={handleLockInWord} 
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={!selectedWordToLockIn || localPlayer.role === 'Communicator'} // Communicator eliminates, doesn't lock in
             >
                <CheckSquare className="mr-2 h-4 w-4" /> Lock In "{selectedWordToLockIn || 'Word'}"
             </Button>
          )}
          {localPlayer.role === 'Communicator' && (gameState.status === 'discussion' || gameState.status === 'word-elimination') && (
            <p className="text-xs text-center text-muted-foreground w-full">As Communicator, click the <Trash2 className="inline h-3 w-3"/> on a word to eliminate it.</p>
          )}
        </CardFooter>
      </Card>

      {/* Right Panel: Chat */}
      <Card className="lg:w-1/3 flex flex-col h-[70vh] lg:h-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="text-primary" /> Discussion</CardTitle>
        </CardHeader>
        <CardContent ref={chatScrollRef} className="flex-grow overflow-y-auto space-y-3 p-2 sm:p-4 bg-secondary/10">
          {gameState.chatMessages.map(msg => (
            <div key={msg.id} className={`flex flex-col ${msg.playerId === localPlayerId ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[80%] p-2 rounded-lg ${msg.playerId === localPlayerId ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground shadow'}`}>
                <p className="text-xs font-semibold opacity-80 mb-0.5">{msg.playerName}{msg.playerId === localPlayerId ? ' (You)' : ''}</p>
                <p className="text-sm">{msg.text}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 px-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          ))}
          {gameState.chatMessages.length === 0 && (
            <p className="text-center text-muted-foreground pt-10">No messages yet. Start the discussion!</p>
          )}
        </CardContent>
        <div className="p-2 sm:p-4 border-t">
          <form onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} className="flex gap-2">
            <Input 
              type="text" 
              placeholder={localPlayer.role === "Communicator" && gameState.status !== "post-guess-reveal" ? "Communicators guide via eliminations..." : "Type your message..."} 
              value={chatInput} 
              onChange={(e) => setChatInput(e.target.value)}
              disabled={localPlayer.role === "Communicator" && gameState.status !== "post-guess-reveal"}
              className="flex-grow"
            />
            <Button type="submit" size="icon" disabled={localPlayer.role === "Communicator" && gameState.status !== "post-guess-reveal"} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
