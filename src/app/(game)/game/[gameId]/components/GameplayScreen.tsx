
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
import { Send, Users, ShieldAlert, HelpCircle, Eye, MessageSquare, Loader2, Trash2, CheckSquare, ZoomIn, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const WordDisplay: React.FC<{
  word: GameWord,
  player: Player,
  isCommunicator: boolean,
  onEliminate?: (wordText: string) => void,
  onConfirmTarget?: (wordText: string) => void, // New prop for communicator confirming target
  gameStatus: GameState['status'],
}> = ({ word, player, isCommunicator, onEliminate, onConfirmTarget, gameStatus }) => {
  const knowsTarget = player.role === 'Helper' || player.role === 'Imposter';
  let highlightClass = knowsTarget && word.isTarget ? 'bg-accent/20 border-accent ring-2 ring-accent' : 'bg-card hover:bg-secondary/30';
  if (word.isEliminated) {
    highlightClass = 'bg-muted/50 text-muted-foreground line-through opacity-70';
  }

  const canEliminate = isCommunicator && !word.isEliminated && (gameStatus === 'discussion' || gameStatus === 'word-elimination');
  // Communicator can confirm target if not eliminated and in discussion/elimination phase
  const canConfirmTarget = isCommunicator && !word.isEliminated && (gameStatus === 'discussion' || gameStatus === 'word-elimination');


  return (
    <div
      className={`p-3 rounded-lg shadow text-center font-medium text-lg transition-all relative ${highlightClass} ${ (canEliminate || canConfirmTarget) ? 'cursor-pointer' : ''}`}
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
      {/* New Button for Communicator to Confirm Target */}
      {canConfirmTarget && onConfirmTarget && (
         <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="default" size="sm" className="absolute bottom-1 left-1 opacity-80 hover:opacity-100 bg-green-600 hover:bg-green-700" onClick={(e) => e.stopPropagation()}>
              <CheckCircle2 className="w-3 h-3"/>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm "{word.text}" as Target?</AlertDialogTitle>
              <AlertDialogDescription>
                This will be the team's final guess. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => {e.stopPropagation(); onConfirmTarget(word.text);}} className="bg-green-600 hover:bg-green-700">Confirm as Target</AlertDialogAction>
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
  localPlayerRole: Role | undefined,
  isAccuserRole: boolean,
  onAccuseHelper?: (playerId: string) => void,
  gameStatus: GameState['status']
}> = ({ player, isLocalPlayer, localPlayerRole, isAccuserRole, onAccuseHelper, gameStatus }) => {
  
  let roleIsVisible = false;

  if (player.role === 'Communicator') {
    roleIsVisible = true; // Communicator role always visible
  } else if (isLocalPlayer) {
    roleIsVisible = true; // Player always sees their own role
  } else if (gameStatus === 'finished') {
    roleIsVisible = true; // All roles visible at game end
  } else if (player.isRevealedImposter && player.role === 'Imposter') {
    roleIsVisible = true; // Revealed imposters are visible
  } else if (gameStatus === 'post-guess-reveal') {
    // During post-guess reveal:
    // - Non-imposters see all roles
    // - Imposters only see Communicator, themselves, and other revealed imposters
    if (localPlayerRole && localPlayerRole !== 'Imposter') {
      roleIsVisible = true;
    } else if (localPlayerRole === 'Imposter') {
      // Imposters only see their own role and Communicator (already covered), and other revealed imposters
      // This case implicitly handles not showing Helper/ClueHolder to Imposter here
       if (player.role === 'Communicator' || (player.isRevealedImposter && player.role === 'Imposter')) {
         roleIsVisible = true;
       }
    }
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
    icon = <Users className="w-4 h-4 text-muted-foreground" />; 
  }

  return (
    <div className="flex items-center justify-between p-2 border-b last:border-b-0">
      <div className="flex items-center gap-2">
        {icon}
        <span className={`font-medium ${isLocalPlayer ? 'text-primary' : ''}`}>{player.name}</span>
        {isLocalPlayer && <Badge variant="outline">(You)</Badge>}
        
        {(() => {
          if (roleIsVisible && player.role) { 
             if (player.isRevealedImposter && player.role === 'Imposter' && !isLocalPlayer) { // Explicitly show revealed imposter
                return <Badge variant="destructive" className="text-xs">Imposter</Badge>;
             }
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
  const { gameState, localPlayerId, sendChatMessage, eliminateWord, communicatorConfirmTarget, imposterAccuseHelperInTwist, isLoading } = useGame();
  const [chatInput, setChatInput] = useState('');
  // const [selectedWordToLockIn, setSelectedWordToLockIn] = useState<string | null>(null); // No longer needed for general players
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
    return <div className="text-center text-destructive p-4">Error: Local player data not found.</div>;
  }

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    // Communicator can now chat, so restriction is removed
    await sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  const handleEliminateWord = async (wordText: string) => {
    // This logic remains for communicator eliminating decoys
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

  const handleCommunicatorConfirmTarget = async (wordText: string) => {
    if (localPlayer.role !== 'Communicator') {
      toast({title: "Invalid Action", description: "Only the Communicator can confirm the target word.", variant: "destructive"});
      return;
    }
    if (gameState.status !== 'discussion' && gameState.status !== 'word-elimination') {
       toast({title: "Invalid Phase", description: "Target can only be confirmed during discussion/elimination phase.", variant: "destructive"});
      return;
    }
    await communicatorConfirmTarget(wordText);
  };

  const handleImposterAccuseHelper = async (accusedPlayerId: string) => {
    await imposterAccuseHelperInTwist(accusedPlayerId);
  };

  const isCommunicator = localPlayer.role === 'Communicator';
  const isImposterDuringTwist = localPlayer.role === 'Imposter' && gameState.status === 'post-guess-reveal';
  const canChat = true; // Communicator can always chat now

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
              localPlayerRole={localPlayer.role} // Pass localPlayer's role
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
              <div className="text-accent font-semibold mt-2">The players guessed the word! Now, identify the Helper from the players list.</div>
            )}
            {gameState.status === 'post-guess-reveal' && localPlayer.role !== 'Imposter' && (
              <div className="text-primary font-semibold mt-2">Your team guessed the word! Waiting for Imposters to identify the Helper...</div>
            )}
             {gameState.status === 'post-guess-reveal' && localPlayer.role === 'Helper' && (
              <div className="text-green-600 font-semibold mt-2">Your team found the word! Stay hidden, the Imposters are trying to find you!</div>
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
              onConfirmTarget={isCommunicator ? handleCommunicatorConfirmTarget : undefined} // Pass new handler
              gameStatus={gameState.status}
            />
          ))}
        </CardContent>
        <CardFooter className="p-4 border-t flex-col space-y-2">
          {localPlayer.clue && ( // Only ClueHolders will have a clue now
            <div className="text-center w-full mb-2">
                <div className="text-sm text-muted-foreground">Your Clue:</div>
                <div className="font-semibold text-primary italic">{localPlayer.clue}</div>
            </div>
          )}
          {/* Removed general player lock-in button */}
          {localPlayer.role === 'Communicator' && (gameState.status === 'discussion' || gameState.status === 'word-elimination') && (
            <div className="text-xs text-center text-muted-foreground w-full">
              As Communicator: <Trash2 className="inline h-3 w-3 text-destructive"/> to eliminate, <CheckCircle2 className="inline h-3 w-3 text-green-600"/> to confirm target.
            </div>
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
              <div className={`max-w-[80%] p-2 rounded-lg ${msg.playerId === localPlayerId ? 'bg-primary text-primary-foreground' : (msg.playerId === 'SYSTEM_GAME_EVENT' ? 'bg-amber-100 text-amber-800' : 'bg-card text-card-foreground shadow')}`}>
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
              placeholder={"Type your message..."} // Communicator can always chat
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={!canChat} // canChat is now always true
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

    