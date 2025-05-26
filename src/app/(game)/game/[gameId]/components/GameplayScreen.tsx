
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '@/context/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Player, GameWord, GameState, Role } from '@/lib/types';
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
  const canSelectForLockIn = !isCommunicator && !word.isEliminated && (gameStatus === 'discussion' || gameStatus === 'word-elimination');

  return (
    <div
      className={`p-3 rounded-lg shadow text-center font-medium text-lg transition-all relative ${highlightClass} ${ (canEliminate || canSelectForLockIn) ? 'cursor-pointer' : ''}`}
      onClick={() => {
        if (canSelectForLockIn && onSelectForLockIn) {
          onSelectForLockIn(word.text);
        }
        // Elimination is handled by a specific button now
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
  localPlayerRole: Role | undefined, // Role of the person viewing the card
  isAccuserRole: boolean, // True if the localPlayer is an Imposter during post-guess
  onAccuseHelper?: (playerId: string) => void,
  gameStatus: GameState['status']
}> = ({ player, isLocalPlayer, localPlayerRole, isAccuserRole, onAccuseHelper, gameStatus }) => {
  
  let roleIsVisible = false;

  if (player.role === 'Communicator') {
    roleIsVisible = true;
  } else if (isLocalPlayer) {
    roleIsVisible = true;
  } else if (gameStatus === 'finished') {
    roleIsVisible = true;
  } else if (player.isRevealedImposter && player.role === 'Imposter') {
    roleIsVisible = true; // Everyone sees a revealed imposter's role
  } else if (gameStatus === 'post-guess-reveal') {
    // If the viewing player (localPlayer) is NOT an Imposter, they see all roles.
    if (localPlayerRole && localPlayerRole !== 'Imposter') {
      roleIsVisible = true;
    }
    // If localPlayerRole IS 'Imposter', roleIsVisible remains false for other non-communicator, non-revealed players.
  }

  let icon;
  if (roleIsVisible) {
    switch (player.role) {
      case 'Communicator': icon = <Eye className="w-4 h-4 text-blue-500" />; break;
      case 'Helper': icon = <HelpCircle className="w-4 h-4 text-green-500" />; break;
      case 'Imposter': icon = <ShieldAlert className="w-4 h-4 text-red-500" />; break;
      case 'ClueHolder': icon = <MessageSquare className="w-4 h-4 text-yellow-500" />; break;
      default: icon = <Users className="w-4 h-4 text-muted-foreground" />; break;
    }
  } else {
    icon = <Users className="w-4 h-4 text-muted-foreground" />; // Generic icon if role is hidden
  }

  return (
    <div className="flex items-center justify-between p-2 border-b last:border-b-0">
      <div className="flex items-center gap-2">
        {icon}
        <span className={`font-medium ${isLocalPlayer ? 'text-primary' : ''}`}>{player.name}</span>
        {isLocalPlayer && <Badge variant="outline">(You)</Badge>}
        
        {(() => {
          // Precedence: Revealed Imposter > General Role Visibility > Nothing
          if (player.isRevealedImposter && player.role === 'Imposter' && !isLocalPlayer) {
            // This badge is shown to others when an imposter is revealed (e.g. during post-guess)
            // It is also covered by roleIsVisible for the imposter themselves.
            return <Badge variant="destructive" className="text-xs">Imposter</Badge>;
          }
          if (roleIsVisible) {
             // For Communicator, this shows their role.
             // For local player, this shows their role.
             // For others in 'finished' or 'post-guess-reveal' (if local not imposter), shows role.
            return <Badge variant="secondary" className="text-xs">{player.role}</Badge>;
          }
          return null;
        })()}
      </div>
      {isAccuserRole && !isLocalPlayer && player.isAlive && onAccuseHelper && gameStatus === 'post-guess-reveal' && player.role !== 'Imposter' && !player.isRevealedImposter && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">Accuse Helper</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Accuse {player.name} of being the Helper?</AlertDialogTitle>
              <AlertDialogDescription>
                If you are correct, Imposters win points. If wrong, Team wins points. This action is final.
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
    if (localPlayer.role === "Communicator" && gameState.status !== "post-guess-reveal" && gameState.status !== "finished") {
      toast({ title: "Communicator Restriction", description: "Communicators guide via eliminations, not chat, until post-guess reveal or game end.", variant: "default" });
      return;
    }
    await sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  const handleEliminateWord = async (wordText: string) => {
    if (localPlayer.role !== 'Communicator') {
      toast({title: "Invalid Action", description: "Only the Communicator can eliminate words.", variant: "destructive"});
      return;
    }
    if (gameState.status !== 'discussion' && gameState.status !== 'word-elimination') {
       toast({title: "Invalid Phase", description: "Words can only be eliminated during discussion/elimination phase.", variant: "destructive"});
      return;
    }
    await eliminateWord(wordText);
  };

  const handleLockInWord = async () => {
    if (!selectedWordToLockIn) {
      toast({title: "No Word Selected", description: "Please select a word from the grid to lock in.", variant: "default"});
      return;
    }
     if (localPlayer.role === 'Communicator') {
      toast({title: "Invalid Action", description: "Communicator eliminates words, others lock them in.", variant: "destructive"});
      return;
    }
    if (gameState.status !== 'discussion' && gameState.status !== 'word-elimination') {
       toast({title: "Invalid Phase", description: "Words can only be locked-in during discussion/elimination phase.", variant: "destructive"});
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
  const canChat = !(localPlayer.role === "Communicator" && gameState.status !== "post-guess-reveal" && gameState.status !== "finished");

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
              localPlayerRole={localPlayer.role}
              isAccuserRole={isImposterDuringTwist}
              onAccuseHelper={handleImposterAccuseHelper}
              gameStatus={gameState.status}
            />
          ))}
        </CardContent>
        <CardFooter className="p-4 border-t">
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Status: <Badge variant={gameState.status === 'finished' ? 'default' : 'secondary'}>{gameState.status.replace('-', ' ').toUpperCase()}</Badge></div>
            <div>Eliminations: {gameState.eliminationCount}/{gameState.maxEliminations}</div>
            {gameState.status === 'post-guess-reveal' && localPlayer.role === 'Imposter' && (
              <div className="text-accent font-semibold mt-2">Your team guessed the word! Now, identify the Helper from the players list.</div>
            )}
            {gameState.status === 'post-guess-reveal' && localPlayer.role !== 'Imposter' && (
              <div className="text-primary font-semibold mt-2">The team guessed the word! Waiting for Imposters to accuse the Helper...</div>
            )}
             {gameState.status === 'post-guess-reveal' && localPlayer.role === 'Helper' && (
              <div className="text-green-600 font-semibold mt-2">The team found the word! Stay hidden, they're trying to find you!</div>
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
              onSelectForLockIn={!isCommunicator ? setSelectedWordToLockIn : undefined}
              isSelectedForLockIn={selectedWordToLockIn === wordObj.text}
              gameStatus={gameState.status}
            />
          ))}
        </CardContent>
        <CardFooter className="p-4 border-t flex-col space-y-2">
          {localPlayer.clue && (
            <div className="text-center w-full mb-2">
                <div className="text-sm text-muted-foreground">Your Clue:</div>
                <div className="font-semibold text-primary italic">{localPlayer.clue}</div>
            </div>
          )}
          {(gameState.status === 'discussion' || gameState.status === 'word-elimination') && !isCommunicator && (
             <Button
                onClick={handleLockInWord}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={!selectedWordToLockIn}
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
              placeholder={!canChat ? "Communicators guide via eliminations..." : "Type your message..."}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={!canChat}
              className="flex-grow"
            />
            <Button type="submit" size="icon" disabled={!canChat} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

    