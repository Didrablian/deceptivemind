
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '@/context/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Player, GameWord } from '@/lib/types'; // ChatMessage is part of GameState now
import { Send, Users, ShieldAlert, HelpCircle, Eye, MessageSquare, Megaphone, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
// generateShortId is not needed here, messages are created in context

const WordDisplay: React.FC<{ word: GameWord, player: Player }> = ({ word, player }) => {
  const knowsTarget = player.role === 'Helper' || player.role === 'Imposter';
  const highlightClass = knowsTarget && word.isTarget ? 'bg-accent/20 border-accent ring-2 ring-accent' : 'bg-card hover:bg-secondary/30';
  
  return (
    <div className={`p-3 rounded-lg shadow text-center font-medium text-lg transition-all ${highlightClass}`}>
      {word.text}
      {knowsTarget && word.isTarget && <Badge variant="outline" className="ml-2 border-accent text-accent text-xs">TARGET</Badge>}
    </div>
  );
};

const PlayerCard: React.FC<{ player: Player, isLocalPlayer: boolean, onAccuse?: (playerId: string) => void, localPlayerRole?: Player['role'] }> = ({ player, isLocalPlayer, onAccuse, localPlayerRole }) => {
  let icon;
  if (isLocalPlayer) {
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
      </div>
      {localPlayerRole === 'Imposter' && !isLocalPlayer && player.isAlive && onAccuse && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={!player.isAlive}>Accuse Helper</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Accuse {player.name} of being the Helper?</AlertDialogTitle>
              <AlertDialogDescription>
                Imposters get one chance per team to correctly identify the Helper.
                If you are wrong, your team loses immediately. This action is final.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onAccuse(player.id)} className="bg-destructive hover:bg-destructive/90">Confirm Accusation</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};


export default function GameplayScreen() {
  const { gameState, localPlayerId, sendChatMessage, accuseHelper, callMeeting, isLoading, updatePlayerInContext } = useGame();
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
    // This case should ideally be handled by redirecting if player is not in game
    return <p className="text-center text-destructive p-4">Error: Local player data not found in game. You might have been removed or an error occurred.</p>;
  }

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    await sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  const handleAccuseHelper = async (accusedPlayerId: string) => {
    if (localPlayer.role !== 'Imposter') {
      toast({title: "Invalid Action", description: "Only Imposters can accuse the Helper.", variant: "destructive"});
      return;
    }
    // Accusation limit logic is now within the accuseHelper context function
    await accuseHelper(accusedPlayerId);
  };
  
  const handleCallMeeting = async () => {
    // Logic for disabling button and conditions is now handled by context or derived from gameState
    await callMeeting();
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full flex-grow p-1 sm:p-4 bg-background rounded-lg shadow-inner">
      {/* Left Panel: Players & Actions */}
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
              onAccuse={handleAccuseHelper}
              localPlayerRole={localPlayer.role}
            />
          ))}
        </CardContent>
        <div className="p-4 border-t">
            <Button 
                onClick={handleCallMeeting} 
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={localPlayer.hasCalledMeeting || gameState.meetingsCalled >= gameState.maxMeetings || gameState.status === 'meeting'}
            >
                <Megaphone className="mr-2 h-4 w-4" /> Call Emergency Meeting
            </Button>
            {(localPlayer.hasCalledMeeting || gameState.meetingsCalled >= gameState.maxMeetings) && (
                <p className="text-xs text-muted-foreground text-center mt-1">
                  {localPlayer.hasCalledMeeting ? "You've called a meeting." : "Meeting limit reached."}
                </p>
            )}
        </div>
      </Card>

      {/* Middle Panel: Word Grid */}
      <Card className="lg:w-1/3 flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-primary"><path d="M15.5,12C18,12 20,14 20,16.5C20,17.38 19.75,18.21 19.31,18.9L22.39,22L21,23.39L17.88,20.32C17.19,20.75 16.37,21 15.5,21C13,21 11,19 11,16.5C11,14 13,12 15.5,12M15.5,14A2.5,2.5 0 0,0 13,16.5A2.5,2.5 0 0,0 15.5,19A2.5,2.5 0 0,0 18,16.5A2.5,2.5 0 0,0 15.5,14M10,3H18C19.11,3 20,3.9 20,5V10.3C19.43,10.11 18.82,10 18.17,10H17V5H10V17H13.08C13.03,17.33 13,17.66 13,18C13,18.24 13.03,18.47 13.07,18.69L13,19H5C3.89,19 3,18.1 3,17V5C3,3.9 3.89,3 5,3H8V1H10V3M5,5V7H15V5H5M5,9V11H15V9H5M5,13V15H10V13H5Z" /></svg>
            Words on the Board
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-grow grid grid-cols-3 gap-2 sm:gap-3 p-2 sm:p-4">
          {gameState.words.map((wordObj) => (
            <WordDisplay key={wordObj.text} word={wordObj} player={localPlayer} />
          ))}
        </CardContent>
         {localPlayer.clue && (
            <div className="p-4 border-t text-center">
                <p className="text-sm text-muted-foreground">Your Clue:</p>
                <p className="font-semibold text-primary italic">{localPlayer.clue}</p>
            </div>
        )}
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
              placeholder={localPlayer.role === "Communicator" ? "Communicators observe..." : "Type your message..."} 
              value={chatInput} 
              onChange={(e) => setChatInput(e.target.value)}
              disabled={localPlayer.role === "Communicator"}
              className="flex-grow"
            />
            <Button type="submit" size="icon" disabled={localPlayer.role === "Communicator"} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
