
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '@/context/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Player, GameItem, GameState, Role } from '@/lib/types'; // Changed GameWord to GameItem
import { Send, Users, ShieldAlert, HelpCircle, Eye, MessageSquare, Loader2, Trash2, CheckSquare, ZoomIn, CheckCircle2, Image as LucideImage } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import NextImage from 'next/image'; // For Next.js optimized images

const ItemDisplay: React.FC<{ // Renamed from WordDisplay
  item: GameItem, // Changed from word: GameWord
  player: Player,
  isCommunicator: boolean,
  onEliminate?: (itemIdentifierText: string) => void,
  onConfirmTarget?: (itemIdentifierText: string) => void,
  gameStatus: GameState['status'],
  gameMode: GameState['gameMode'],
}> = ({ item, player, isCommunicator, onEliminate, onConfirmTarget, gameStatus, gameMode }) => {
  const knowsTarget = player.role === 'Helper' || player.role === 'Imposter';
  let highlightClass = knowsTarget && item.isTarget ? 'bg-accent/20 border-accent ring-2 ring-accent' : 'bg-card hover:bg-secondary/30';
  if (item.isEliminated) {
    highlightClass = 'bg-muted/50 text-muted-foreground line-through opacity-70';
  }

  const canEliminate = isCommunicator && !item.isEliminated && (gameStatus === 'discussion' || gameStatus === 'word-elimination');
  const canConfirmTarget = isCommunicator && !item.isEliminated && (gameStatus === 'discussion' || gameStatus === 'word-elimination');

  return (
    <div
      className={`p-2 sm:p-3 rounded-lg shadow text-center font-medium text-base sm:text-lg transition-all relative ${highlightClass} ${ (canEliminate || canConfirmTarget) ? 'cursor-pointer' : ''} flex flex-col items-center justify-center aspect-square`}
    >
      {gameMode === 'images' && item.imageUrl ? (
        <div className="relative w-full h-2/3 mb-1">
           <NextImage 
            src={item.imageUrl || 'https://placehold.co/300x300.png'} 
            alt={item.text} 
            layout="fill" 
            objectFit="contain" 
            className="rounded-md"
            data-ai-hint={item.text.split(' ').slice(0,2).join(' ')} // hint for image search
           />
        </div>
      ) : null}
      <span className={`mt-1 text-xs sm:text-sm ${item.isEliminated ? 'line-through' : ''}`}>{item.text}</span>
      
      {knowsTarget && item.isTarget && !item.isEliminated && <Badge variant="outline" className="absolute top-1 left-1 border-accent text-accent text-xs">TARGET</Badge>}
      {item.isEliminated && <Badge variant="destructive" className="absolute top-1 right-1 text-xs">GONE</Badge>}

      {canEliminate && onEliminate && (
         <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="absolute bottom-1 right-1 opacity-80 hover:opacity-100 p-1 sm:p-2" onClick={(e) => e.stopPropagation()}>
              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4"/>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminate "{item.text}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. Are you sure you want to eliminate this {gameMode === 'images' ? 'item' : 'word'}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => {e.stopPropagation(); onEliminate(item.text);}} className="bg-destructive hover:bg-destructive/90">Confirm Elimination</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {canConfirmTarget && onConfirmTarget && (
         <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="default" size="sm" className="absolute bottom-1 left-1 opacity-80 hover:opacity-100 bg-green-600 hover:bg-green-700 p-1 sm:p-2" onClick={(e) => e.stopPropagation()}>
              <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4"/>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm "{item.text}" as Target?</AlertDialogTitle>
              <AlertDialogDescription>
                This will be the team's final guess. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => {e.stopPropagation(); onConfirmTarget(item.text);}} className="bg-green-600 hover:bg-green-700">Confirm as Target</AlertDialogAction>
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
    roleIsVisible = true; 
  } else if (isLocalPlayer) {
    roleIsVisible = true; 
  } else if (gameStatus === 'finished') {
    roleIsVisible = true; 
  } else if (player.isRevealedImposter && player.role === 'Imposter') {
    roleIsVisible = true; 
  } else if (gameStatus === 'post-guess-reveal') {
    if (localPlayerRole && localPlayerRole !== 'Imposter') {
      roleIsVisible = true;
    } else if (localPlayerRole === 'Imposter') {
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
             if (player.isRevealedImposter && player.role === 'Imposter' && !isLocalPlayer) {
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
  const { gameState, localPlayerId, sendChatMessage, eliminateItem, communicatorConfirmTargetItem, imposterAccuseHelperInTwist, isLoading } = useGame(); // Updated function names
  const [chatInput, setChatInput] = useState('');
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
    await sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  const handleEliminateItem = async (itemIdentifierText: string) => {
    if (localPlayer.role !== 'Communicator') {
      toast({title: "Invalid Action", description: "Only the Communicator can eliminate items.", variant: "destructive"});
      return;
    }
    if (gameState.status !== 'discussion' && gameState.status !== 'word-elimination') {
       toast({title: "Invalid Phase", description: "Items can only be eliminated during discussion/elimination phase.", variant: "destructive"});
      return;
    }
    await eliminateItem(itemIdentifierText);
  };

  const handleCommunicatorConfirmTargetItem = async (itemIdentifierText: string) => {
    if (localPlayer.role !== 'Communicator') {
      toast({title: "Invalid Action", description: "Only the Communicator can confirm the target item.", variant: "destructive"});
      return;
    }
    if (gameState.status !== 'discussion' && gameState.status !== 'word-elimination') {
       toast({title: "Invalid Phase", description: "Target can only be confirmed during discussion/elimination phase.", variant: "destructive"});
      return;
    }
    await communicatorConfirmTargetItem(itemIdentifierText);
  };

  const handleImposterAccuseHelper = async (accusedPlayerId: string) => {
    await imposterAccuseHelperInTwist(accusedPlayerId);
  };

  const isCommunicator = localPlayer.role === 'Communicator';
  const isImposterDuringTwist = localPlayer.role === 'Imposter' && gameState.status === 'post-guess-reveal';
  const canChat = true; 

  const itemTypeDisplay = gameState.gameMode === 'images' ? 'item' : 'word';
  const itemTypePlural = gameState.gameMode === 'images' ? 'items' : 'words';

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full flex-grow p-1 sm:p-4 bg-background rounded-lg shadow-inner">
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
              <div className="text-accent font-semibold mt-2">The team guessed the {itemTypeDisplay}! Now, identify the Helper from the players list.</div>
            )}
            {gameState.status === 'post-guess-reveal' && localPlayer.role !== 'Imposter' && (
              <div className="text-primary font-semibold mt-2">Your team guessed the {itemTypeDisplay}! Waiting for Imposters to identify the Helper...</div>
            )}
             {gameState.status === 'post-guess-reveal' && localPlayer.role === 'Helper' && (
              <div className="text-green-600 font-semibold mt-2">Your team found the {itemTypeDisplay}! Stay hidden, the Imposters are trying to find you!</div>
            )}
          </div>
        </CardFooter>
      </Card>

      <Card className="lg:w-1/3 flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
             {gameState.gameMode === 'images' ? <LucideImage className="w-6 h-6 text-primary"/> : <ZoomIn className="w-6 h-6 text-primary"/> } 
             {gameState.gameMode === 'images' ? 'Images' : 'Words'} on the Board
          </CardTitle>
        </CardHeader>
        <CardContent className={`flex-grow grid ${gameState.gameMode === 'images' ? 'grid-cols-2' : 'grid-cols-3'} gap-2 sm:gap-3 p-2 sm:p-4`}>
          {gameState.items.map((itemObj) => ( // Changed from words to items
            <ItemDisplay // Renamed from WordDisplay
              key={itemObj.text}
              item={itemObj}
              player={localPlayer}
              isCommunicator={isCommunicator}
              onEliminate={isCommunicator ? handleEliminateItem : undefined}
              onConfirmTarget={isCommunicator ? handleCommunicatorConfirmTargetItem : undefined}
              gameStatus={gameState.status}
              gameMode={gameState.gameMode}
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
          {localPlayer.role === 'Communicator' && (gameState.status === 'discussion' || gameState.status === 'word-elimination') && (
            <div className="text-xs text-center text-muted-foreground w-full">
              As Communicator: <Trash2 className="inline h-3 w-3 text-destructive"/> to eliminate, <CheckCircle2 className="inline h-3 w-3 text-green-600"/> to confirm target.
            </div>
          )}
        </CardFooter>
      </Card>

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
              placeholder={"Type your message..."}
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
