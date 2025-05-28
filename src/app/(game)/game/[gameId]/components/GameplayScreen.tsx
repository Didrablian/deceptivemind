"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '@/context/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Player, GameItem, GameState, Role } from '@/lib/types';
import { Send, Users, ShieldAlert, HelpCircle, Eye, MessageSquare, Loader2, Trash2, CheckSquare, ZoomIn, CheckCircle2, Image as LucideImage, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import NextImage from 'next/image'; // For Next.js optimized images

const ItemDisplay: React.FC<{
  item: GameItem,
  player: Player,
  isCommunicator: boolean,
  onConfirmTarget?: (itemIdentifierText: string) => void,
  gameStatus: GameState['status'],
  gameMode: GameState['gameMode'],
}> = ({ item, player, isCommunicator, onConfirmTarget, gameStatus, gameMode }) => {
  const knowsTarget = player.role === 'Helper' || player.role === 'Imposter';
  let highlightClass = knowsTarget && item.isTarget ? 'bg-accent/20 border-accent ring-2 ring-accent' : 'bg-card hover:bg-secondary/30';

  const canConfirm = isCommunicator && (gameStatus === 'discussion' || gameStatus === 'identification');

  return (
    <div
      className={`p-2 sm:p-3 rounded-lg shadow text-center font-medium text-base sm:text-lg transition-all relative ${highlightClass} ${ canConfirm ? 'cursor-pointer' : ''} flex flex-col items-center justify-center aspect-square`}
    >
      {gameMode === 'images' && (item.imageUrl || gameMode === 'images') ? ( // Always render container if image mode
        <div className="relative w-full h-2/3 mb-1">
           <NextImage
            src={item.imageUrl || 'https://placehold.co/300x300.png'}
            alt={item.text}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="rounded-md object-contain"
            data-ai-hint={item.text.split(' ').slice(0,2).join(' ')}
           />
        </div>
      ) : null}
      {gameMode !== 'images' && <span className={`mt-1 text-xs sm:text-sm`}>{item.text}</span>}

      {knowsTarget && item.isTarget && <Badge variant="outline" className="absolute top-1 left-1 border-accent text-accent text-xs">TARGET</Badge>}

      {canConfirm && isCommunicator && onConfirmTarget && (
         <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="default" size="sm" className="absolute bottom-1 center-1 opacity-80 hover:opacity-100 bg-green-600 hover:bg-green-700 p-1 sm:p-2" onClick={(e) => e.stopPropagation()}>
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
       // Imposters only see Communicator and other revealed Imposters during twist
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
  const router = useRouter();
  const { gameState, localPlayerId, sendChatMessage, communicatorConfirmTargetItem, imposterAccuseHelperInTwist, leaveGame, isLoading } = useGame();
  const [chatInput, setChatInput] = useState('');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const { toast } = useToast();
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [gameState?.chatMessages]);

  // Timer management
  useEffect(() => {
    if (!gameState || !gameState.phaseStartTime || !gameState.phaseDuration) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - gameState.phaseStartTime!) / 1000);
      const remaining = Math.max(0, gameState.phaseDuration! - elapsed);
      setTimeRemaining(remaining);
      
      if (remaining === 0) {
        setTimeRemaining(null);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [gameState?.phaseStartTime, gameState?.phaseDuration]);

  if (isLoading || !gameState || !localPlayerId) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary m-auto" /></div>;
  }

  const localPlayer = gameState.players.find(p => p.id === localPlayerId);
  if (!localPlayer) {
    return <div className="text-center text-destructive p-4">Error: Local player data not found.</div>;
  }

  const handleQuitGame = async () => {
    await leaveGame();
    router.push('/');
  };

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    await sendChatMessage(chatInput);
    setChatInput('');
  };

  const handleCommunicatorConfirmTargetItem = async (itemIdentifierText: string) => {
    try {
      await communicatorConfirmTargetItem(itemIdentifierText);
      toast({ title: "Item Confirmed", description: `You confirmed "${itemIdentifierText}" as the target.`, variant: "default" });
    } catch (error) {
      console.error("Error confirming target item:", error);
      toast({ title: "Error", description: "Could not confirm item.", variant: "destructive" });
    }
  };

  const handleImposterAccuseHelper = async (accusedPlayerId: string) => {
    try {
      await imposterAccuseHelperInTwist(accusedPlayerId);
      toast({ title: "Accusation Made", description: "Your accusation has been submitted.", variant: "default" });
    } catch (error) {
      console.error("Error making accusation:", error);
      toast({ title: "Error", description: "Could not submit accusation.", variant: "destructive" });
    }
  };

  const isCommunicator = localPlayer.role === 'Communicator';
  const isImposterDuringTwist = localPlayer.role === 'Imposter' && gameState.status === 'post-guess-reveal';
  const canChat = true;

  const itemTypeDisplay = gameState.gameMode === 'images' ? 'item' : 'word';
  const itemTypePlural = gameState.gameMode === 'images' ? 'items' : 'words';

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full flex-grow p-1 sm:p-4 bg-background rounded-lg shadow-inner">
      {/* Timer Display */}
      {timeRemaining !== null && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
          <Card className="bg-accent/10 border-accent">
            <CardContent className="p-3 text-center">
              <div className="text-sm font-medium text-accent-foreground">
                {gameState.status === 'role-understanding' && 'Understanding Roles'}
                {gameState.status === 'identification' && 'Identification Phase'}
              </div>
              <div className="text-2xl font-bold text-accent">
                {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Phase-specific content for role-understanding */}
      {gameState.status === 'role-understanding' && (
        <div className="w-full mb-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-6 text-center">
              <h2 className="text-xl font-bold text-blue-900 mb-2">Understanding Your Role</h2>
              <p className="text-blue-700 mb-4">
                You are a <strong>{localPlayer.role}</strong>. Take 30 seconds to understand your role and prepare.
              </p>
              {localPlayer.clue && (
                <div className="bg-blue-100 p-3 rounded-lg">
                  <div className="text-sm text-blue-600">Your Clue:</div>
                  <div className="font-semibold text-blue-900 text-lg">{localPlayer.clue}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Phase-specific content for identification */}
      {gameState.status === 'identification' && (
        <div className="w-full mb-4">
          <Card className="bg-orange-50 border-orange-200">
            <CardContent className="p-6 text-center">
              <h2 className="text-xl font-bold text-orange-900 mb-2">Identification Phase</h2>
              <p className="text-orange-700 mb-2">
                3 minutes to identify the word and imposters!
              </p>
              {localPlayer.role === 'Helper' && (
                <p className="text-orange-600 font-medium">
                  <strong>Helper:</strong> You know the target word! Help the Communicator identify it without being obvious to Imposters.
                </p>
              )}
              {localPlayer.role === 'ClueHolder' && (
                <p className="text-orange-600 font-medium">
                  <strong>Clue Holder:</strong> Use your clue to help identify the target word and spot any Imposters.
                </p>
              )}
              {localPlayer.role === 'Communicator' && (
                <p className="text-orange-600 font-medium">
                  <strong>Communicator:</strong> Work with your team to identify the target word. You can confirm it when ready!
                </p>
              )}
              {localPlayer.role === 'Imposter' && (
                <p className="text-orange-600 font-medium">
                  <strong>Imposter:</strong> Blend in! Try to figure out the target word without being discovered.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

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
          <div className="w-full space-y-3">
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Status: <Badge variant={gameState.status === 'finished' ? 'default' : 'secondary'}>{gameState.status.replace('-', ' ').toUpperCase()}</Badge></div>
              <div>Eliminations: {gameState.eliminationCount}/{gameState.maxEliminations}</div>
               {gameState.status === 'post-guess-reveal' && localPlayer.role === 'Imposter' && (
                <div className="text-accent font-semibold mt-2">Your team guessed the {itemTypeDisplay}! Now, identify the Helper from the players list.</div>
              )}
              {gameState.status === 'post-guess-reveal' && localPlayer.role !== 'Imposter' && (
                <div className="text-primary font-semibold mt-2">Your team guessed the {itemTypeDisplay}! Waiting for Imposters to identify the Helper...</div>
              )}
               {gameState.status === 'post-guess-reveal' && localPlayer.role === 'Helper' && (
                <div className="text-green-600 font-semibold mt-2">Your team found the {itemTypeDisplay}! Stay hidden, the Imposters are trying to find you!</div>
              )}
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full text-destructive border-destructive hover:bg-destructive/10">
                  <LogOut className="mr-2 h-4 w-4" />
                  Quit Game
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave Game?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to leave this game? You can rejoin later if the game is still active.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleQuitGame} className="bg-destructive hover:bg-destructive/90">
                    Leave Game
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
        <CardContent className={`flex-grow grid ${gameState.items.length === 4 ? 'grid-cols-2' : 'grid-cols-3'} gap-2 sm:gap-3 p-2 sm:p-4`}>
          {gameState.items.map((itemObj) => (
            <ItemDisplay
              key={itemObj.text}
              item={itemObj}
              player={localPlayer}
              isCommunicator={isCommunicator}
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
          {localPlayer.role === 'Communicator' && (gameState.status === 'discussion' || gameState.status === 'identification') && (
            <div className="text-xs text-center text-muted-foreground w-full">
              As Communicator: <CheckCircle2 className="inline h-3 w-3 text-green-600"/> to confirm target {itemTypeDisplay}.
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

