
"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import type { Player, GameState } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Award, Users, ShieldCheck, ShieldX, Eye, UserCheck, UserX, Info, MessageSquare, ShieldQuestion, RotateCcw, TrendingUp, MinusCircle, PlusCircle, Smile, Frown } from 'lucide-react';
import { useGame } from '@/context/GameContext';
import { useToast } from '@/hooks/use-toast';

interface GameOverScreenProps {
  gameState: GameState; // Pass full gameState
  localPlayer: Player;
  gameId: string;
  isHost: boolean;
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

export default function GameOverScreen({ gameState, localPlayer, gameId, isHost }: GameOverScreenProps) {
  const router = useRouter();
  const { startNewRound, leaveGame } = useGame();
  const { toast } = useToast();

  const { winner, winningReason, gameLog, players, playerScoresBeforeRound } = gameState;

  let titleText = "Game Over!";
  let descriptionText = winningReason || "The session has concluded.";
  let titleIcon = <Award className="w-12 h-12 text-yellow-500" />;

  if (winner === 'Imposters') {
    titleText = "Imposters Win!";
    titleIcon = <ShieldX className="w-12 h-12 text-destructive" />;
  } else if (winner === 'Team' || winner === 'GoodTeam') {
    titleText = "Team Wins!";
    titleIcon = <ShieldCheck className="w-12 h-12 text-green-500" />;
  } else if (winner === 'NoOne') {
    titleText = "Stalemate!";
    titleIcon = <Users className="w-12 h-12 text-muted-foreground" />;
  }

  const previousScore = playerScoresBeforeRound?.[localPlayer.id] ?? 0;
  const pointsGainedThisRound = localPlayer.score - previousScore;
  let pointsMessage = "";
  let PointsIcon = Smile;

  if (pointsGainedThisRound > 0) {
    pointsMessage = `You gained ${pointsGainedThisRound} points this round!`;
    PointsIcon = PlusCircle;
  } else if (pointsGainedThisRound === 0) {
    pointsMessage = `You gained no points this round.`;
    PointsIcon = MinusCircle;
  } else { // pointsGainedThisRound < 0 (should not happen with current rules)
    pointsMessage = `You lost ${Math.abs(pointsGainedThisRound)} points this round.`;
    PointsIcon = Frown;
  }


  const handlePlayAgain = async () => {
    if (!isHost) {
        toast({title: "Only Host", description: "Only the host can start a new round.", variant: "default"});
        return;
    }
    try {
      await startNewRound();
      // Game state will update via context, causing a re-render to the role-reveal or game screen
    } catch (error) {
      toast({title: "Error Starting New Round", description: (error as Error).message, variant: "destructive"});
    }
  };

  const handleLeaveGame = async () => {
    await leaveGame();
    router.push('/'); 
    toast({ title: "Left Game" });
  };

  return (
    <div className="fixed inset-0 bg-background/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
      <Card className="w-full max-w-2xl shadow-2xl animate-scaleUp">
        <CardHeader className="text-center items-center">
          <div className="mb-4">{titleIcon}</div>
          <CardTitle className="text-4xl font-bold">{titleText}</CardTitle>
          <CardDescription className="text-lg text-muted-foreground">{descriptionText}</CardDescription>
          {pointsMessage && (
            <div className={`mt-3 text-md font-semibold flex items-center justify-center gap-2 ${pointsGainedThisRound > 0 ? 'text-green-600' : pointsGainedThisRound < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
              <PointsIcon className={`w-5 h-5 ${pointsGainedThisRound > 0 ? 'text-green-500' : pointsGainedThisRound < 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
              {pointsMessage}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold mb-2 text-center text-primary flex items-center justify-center gap-2">
              <TrendingUp /> Final Scores & Roles
            </h3>
            <ScrollArea className="h-48 border rounded-md p-3 bg-secondary/20">
              <ul className="space-y-2">
                {players.map((p) => (
                  <li key={p.id} className={`flex items-center justify-between p-3 rounded-md ${p.id === localPlayer.id ? 'bg-primary/10 ring-1 ring-primary' : 'bg-card'}`}>
                    <div className="flex items-center gap-3">
                      <RoleIconMini role={p.role} />
                      <span className="font-medium text-lg">{p.name} {p.id === localPlayer.id && "(You)"}</span>
                      <Badge variant={p.role === "Imposter" ? "destructive" : "secondary"} className="text-xs">{p.role}</Badge>
                    </div>
                    <Badge variant="outline" className="text-lg font-bold text-accent">{p.score} pts</Badge>
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
              {gameLog.length === 0 && <p>No game events logged.</p>}
            </ScrollArea>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-2">
          {isHost && (
            <Button onClick={handlePlayAgain} className="w-full text-lg py-3 bg-primary hover:bg-primary/80 text-primary-foreground">
                <RotateCcw className="mr-2 h-5 w-5" /> Play Again (Host)
            </Button>
          )}
          {!isHost && (
             <Button onClick={handlePlayAgain} className="w-full text-lg py-3 bg-primary hover:bg-primary/80 text-primary-foreground" disabled>
                <RotateCcw className="mr-2 h-5 w-5" /> Waiting for Host to Start New Round
            </Button>
          )}
          <Button onClick={handleLeaveGame} variant="outline" className="w-full text-lg py-3">
             Leave Game
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
