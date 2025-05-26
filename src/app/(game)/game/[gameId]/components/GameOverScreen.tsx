"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import type { Player, GameState } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Award, Users, ShieldCheck, ShieldX, Eye, UserCheck, UserX, Info, MessageSquare, ShieldQuestion, RotateCcw } from 'lucide-react';

interface GameOverScreenProps {
  winner?: GameState['winner'];
  gameLog: string[];
  localPlayer: Player;
  players: Player[];
}

const RoleIconMini: React.FC<{ role: Player['role'] }> = ({ role }) => {
  switch (role) {
    case 'Communicator': return <Eye className="w-5 h-5 text-blue-500" />;
    case 'Helper': return <UserCheck className="w-5 h-5 text-green-500" />;
    case 'Imposter': return <UserX className="w-5 h-5 text-red-500" />;
    case 'ClueHolder': return <ShieldQuestion className="w-5 h-5 text-yellow-500" />;
    default: return <Info className="w-5 h-5 text-gray-400" />;
  }
};

export default function GameOverScreen({ winner, gameLog, localPlayer, players }: GameOverScreenProps) {
  const router = useRouter();

  let titleText = "Game Over!";
  let descriptionText = "The session has concluded.";
  let titleIcon = <Award className="w-12 h-12 text-yellow-500" />;

  if (winner === 'Imposters') {
    titleText = "Imposters Win!";
    descriptionText = "Deception reigns supreme. The Imposters have outsmarted everyone.";
    titleIcon = <ShieldX className="w-12 h-12 text-destructive" />;
  } else if (winner === 'GoodTeam') {
    titleText = "Good Team Wins!";
    descriptionText = "Truth prevails! The Communicator, Helper, and Clue Holders have unmasked the Imposters.";
    titleIcon = <ShieldCheck className="w-12 h-12 text-green-500" />;
  } else if (winner === 'NoOne') {
    titleText = " Stalemate!";
    descriptionText = "The Imposters failed their accusation, but the good team couldn't secure victory either.";
     titleIcon = <Users className="w-12 h-12 text-muted-foreground" />;
  }


  const handlePlayAgain = () => {
    // In a real app, this would clear game state or create a new game session.
    // For this demo, we'll just redirect to the home page.
    // Clear local storage for this game to allow re-joining/creating
    if (typeof window !== 'undefined' && gameState?.gameId) {
      localStorage.removeItem(`dm_gameState_${gameState.gameId}`);
    }
    router.push('/');
  };

  // Find gameState.gameId from players if needed (though it's not passed directly)
  // This is a bit of a hack for the demo to clear local storage.
  // A better way would be to have gameId available in this component.
  const gameState = typeof window !== 'undefined' ? players.length > 0 ? JSON.parse(localStorage.getItem(`dm_gameState_${(JSON.parse(localStorage.getItem('dm_localPlayerId') || '""') as string).slice(0,6)}`) || '{}') as GameState : null : null;


  return (
    <div className="fixed inset-0 bg-background/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
      <Card className="w-full max-w-2xl shadow-2xl animate-scaleUp">
        <CardHeader className="text-center items-center">
          <div className="mb-4">{titleIcon}</div>
          <CardTitle className="text-4xl font-bold">{titleText}</CardTitle>
          <CardDescription className="text-lg text-muted-foreground">{descriptionText}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold mb-2 text-center text-primary">Final Roles & Status</h3>
            <ScrollArea className="h-48 border rounded-md p-3 bg-secondary/20">
              <ul className="space-y-2">
                {players.map((p) => (
                  <li key={p.id} className={`flex items-center justify-between p-2 rounded-md ${p.id === localPlayer.id ? 'bg-primary/10' : 'bg-card'}`}>
                    <div className="flex items-center gap-2">
                      <RoleIconMini role={p.role} />
                      <span className="font-medium">{p.name} {p.id === localPlayer.id && "(You)"}</span>
                    </div>
                    <Badge variant={p.role === "Imposter" ? "destructive" : "secondary"}>{p.role}</Badge>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-2 text-center text-accent">Game Summary</h3>
            <ScrollArea className="h-32 border rounded-md p-3 text-sm bg-secondary/20 text-muted-foreground">
              {gameLog.map((log, index) => (
                <p key={index} className="mb-1 last:mb-0">&raquo; {log}</p>
              ))}
            </ScrollArea>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handlePlayAgain} className="w-full text-lg py-3 bg-primary hover:bg-primary/80 text-primary-foreground">
            <RotateCcw className="mr-2 h-5 w-5" /> Play Again
          </Button>
        </CardFooter>
      </Card>
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
        .animate-scaleUp { animation: scaleUp 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
}
