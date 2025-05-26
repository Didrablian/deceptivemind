
"use client";

import React from 'react';
import type { Player } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getRoleExplanation } from '@/lib/gameUtils';
import { Eye, UserCheck, UserX, Info, Zap, KeyRound, ShieldQuestion, Users } from 'lucide-react'; // Added Users

interface RoleRevealScreenProps {
  player: Player;
  targetWord?: string;
  onContinue: () => void;
}

const RoleIcon: React.FC<{ role: Player['role'] }> = ({ role }) => {
  switch (role) {
    case 'Communicator': return <Eye className="w-8 h-8 text-primary" />;
    case 'Helper': return <UserCheck className="w-8 h-8 text-green-500" />;
    case 'Imposter': return <UserX className="w-8 h-8 text-destructive" />;
    case 'ClueHolder': return <ShieldQuestion className="w-8 h-8 text-yellow-500" />;
    default: return <Users className="w-8 h-8 text-muted-foreground" />; // Changed default icon
  }
};

export default function RoleRevealScreen({ player, targetWord, onContinue }: RoleRevealScreenProps) {
  const roleExplanation = getRoleExplanation(player.role, targetWord, player.clue);

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <Card className="w-full max-w-lg shadow-2xl animate-scaleUp">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <RoleIcon role={player.role} />
          </div>
          <CardTitle className="text-3xl font-bold text-primary">Your Role: {player.role}</CardTitle>
          <CardDescription className="text-md text-muted-foreground">
            The game is afoot! Understand your objective.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-secondary/50 p-4 rounded-md whitespace-pre-line text-center text-secondary-foreground">
            {roleExplanation}
          </div>
          {(player.role === "Helper" || player.role === "Imposter") && targetWord && (
             <p className="mt-4 text-center font-semibold text-lg">
                The Secret Word is: <span className="text-accent">{targetWord}</span>
            </p>
          )}
          {((player.role === "Helper" || player.role === "ClueHolder") && player.clue) && (
            <p className="mt-3 text-center text-md">
                Your Secret Clue: <span className="italic text-primary">{player.clue}</span>
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={onContinue} className="w-full text-lg py-3 bg-primary hover:bg-primary/80 text-primary-foreground">
            I Understand My Mission!
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
