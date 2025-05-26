
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, arrayRemove, increment, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { GameState, Player, GameWord, ChatMessage, Role } from '@/lib/types';
import { initialGameState, generateShortId, assignRolesAndClues } from '@/lib/gameUtils';
import { generateWordsAndClues } from '@/ai/flows/generate-words-and-clues';
import { useToast } from '@/hooks/use-toast';

interface GameContextProps {
  gameState: GameState | null;
  localPlayerId: string | null;
  setLocalPlayerId: (id: string | null) => void;
  isLoading: boolean;
  createGame: (username: string) => Promise<string | null>;
  joinGame: (gameIdToJoin: string, username: string) => Promise<boolean>;
  startGameAI: () => Promise<void>;
  dispatch: (action: any) => Promise<void>; // Simplified dispatch for Firestore updates
  sendChatMessage: (text: string) => Promise<void>;
  accuseHelper: (accusedPlayerId: string) => Promise<void>;
  leaveGame: () => Promise<void>;
  callMeeting: () => Promise<void>;
  updatePlayerInContext: (playerData: Partial<Player> & { id: string }) => Promise<void>;
}

const GameContext = createContext<GameContextProps | undefined>(undefined);

export const GameProvider = ({ children, gameIdFromParams }: { children: ReactNode, gameIdFromParams?: string }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [localPlayerId, setLocalPlayerIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Initialize localPlayerId from localStorage (this is client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedPlayerId = localStorage.getItem('dm_localPlayerId');
      if (storedPlayerId) {
        setLocalPlayerIdState(storedPlayerId);
      } else {
        const newPlayerId = generateShortId(10);
        localStorage.setItem('dm_localPlayerId', newPlayerId);
        setLocalPlayerIdState(newPlayerId);
      }
    }
  }, []);

  // Subscribe to Firestore document for game state changes
  useEffect(() => {
    if (!gameIdFromParams) {
      setGameState(null);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    const gameDocRef = doc(db, "games", gameIdFromParams);
    const unsubscribe = onSnapshot(gameDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setGameState(docSnap.data() as GameState);
      } else {
        setGameState(null);
        toast({ title: "Game not found", description: "This game session does not exist or has ended.", variant: "destructive"});
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error listening to game state:", error);
      toast({ title: "Connection Error", description: "Could not connect to game session.", variant: "destructive"});
      setIsLoading(false);
      setGameState(null);
    });

    return () => unsubscribe();
  }, [gameIdFromParams, toast]);

  const setLocalPlayerId = (id: string | null) => {
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('dm_localPlayerId', id);
      } else {
        localStorage.removeItem('dm_localPlayerId');
      }
    }
    setLocalPlayerIdState(id);
  };

  const createGame = async (username: string): Promise<string | null> => {
    if (!localPlayerId) {
      toast({ title: "Error", description: "Player ID not initialized.", variant: "destructive"});
      return null;
    }
    const newGameId = generateShortId(6).toUpperCase();
    const hostPlayer: Player = {
      id: localPlayerId,
      name: username,
      role: "Communicator", // Placeholder, will be reassigned
      isHost: true,
      isAlive: true,
      hasCalledMeeting: false,
    };
    const newGame = initialGameState(newGameId, hostPlayer);
    
    try {
      await setDoc(doc(db, "games", newGameId), newGame);
      return newGameId;
    } catch (error) {
      console.error("Error creating game:", error);
      toast({ title: "Error Creating Game", description: (error as Error).message, variant: "destructive"});
      return null;
    }
  };

  const joinGame = async (gameIdToJoin: string, username: string): Promise<boolean> => {
    if (!localPlayerId) {
      toast({ title: "Error", description: "Player ID not initialized.", variant: "destructive"});
      return false;
    }
    const gameDocRef = doc(db, "games", gameIdToJoin);
    try {
      return await runTransaction(db, async (transaction) => {
        const gameSnap = await transaction.get(gameDocRef);
        if (!gameSnap.exists()) {
          toast({ title: "Game Not Found", variant: "destructive" });
          return false;
        }

        const currentGameData = gameSnap.data() as GameState;
        if (currentGameData.players.find(p => p.id === localPlayerId)) {
          // Already in lobby
          return true;
        }
        if (currentGameData.players.length >= 5) {
          toast({ title: "Lobby Full", variant: "destructive" });
          return false;
        }
        if (currentGameData.status !== 'lobby') {
          toast({ title: "Game in Progress", description: "Cannot join a game that has already started.", variant: "destructive" });
          return false;
        }

        const joiningPlayer: Player = {
          id: localPlayerId,
          name: username,
          role: "Communicator", // Placeholder
          isAlive: true,
          hasCalledMeeting: false,
        };
        transaction.update(gameDocRef, {
          players: arrayUnion(joiningPlayer)
        });
        return true;
      });
    } catch (error) {
      console.error("Error joining game:", error);
      toast({ title: "Error Joining Game", description: (error as Error).message, variant: "destructive"});
      return false;
    }
  };

  const startGameAI = async () => {
    if (!gameState || !localPlayerId || gameState.hostId !== localPlayerId) {
      toast({ title: "Error", description: "Only the host can start the game.", variant: "destructive" });
      return;
    }
    if (gameState.players.length !== 5) {
      toast({ title: "Not enough players", description: "Need 5 players to start.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      toast({ title: "Starting Game...", description: "Generating words and clues with AI..." });
      const aiData = await generateWordsAndClues({ numberOfWords: 9 }); 
      if (!aiData || !aiData.words || aiData.words.length === 0) {
        throw new Error("AI failed to generate words.");
      }
      
      const { updatedPlayers, gameWords } = assignRolesAndClues(gameState.players, aiData);
      
      const gameDocRef = doc(db, "games", gameState.gameId);
      await updateDoc(gameDocRef, {
        status: 'role-reveal',
        words: gameWords,
        targetWord: aiData.targetWord,
        players: updatedPlayers, // This now includes roles and clues
        gameLog: arrayUnion(`Game started by ${gameState.players.find(p=>p.isHost)?.name}. Roles assigned.`),
        chatMessages: [], // Reset chat messages
        accusationsMadeByImposters: 0, // Reset accusations
        meetingsCalled: 0, // Reset meetings
      });
      // Firestore onSnapshot will update gameState and setIsLoading(false)
    } catch (error) {
      console.error("Failed to start game:", error);
      toast({ title: "Error Starting Game", description: (error as Error).message || "Could not start the game.", variant: "destructive" });
      setIsLoading(false);
    }
  };

  // Generic dispatch, can be expanded or replaced by more specific functions
  const dispatch = async (action: { type: string, payload: any }) => {
    if (!gameState) return;
    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      switch (action.type) {
        case 'SET_STATUS':
          await updateDoc(gameDocRef, { 
            status: action.payload,
            gameLog: arrayUnion(`Game status changed to ${action.payload}`)
          });
          break;
        // Add other cases as needed
        default:
          console.warn("Unhandled action type:", action.type);
      }
    } catch (error) {
      console.error("Error dispatching action:", error);
      toast({ title: "Error", description: "Could not update game.", variant: "destructive" });
    }
  };
  
  const sendChatMessage = async (text: string) => {
    if (!gameState || !localPlayerId) return;
    const localPlayer = gameState.players.find(p => p.id === localPlayerId);
    if (!localPlayer) {
      toast({title: "Error", description: "Player not found in game.", variant: "destructive"});
      return;
    }
    if (localPlayer.role === 'Communicator') {
      toast({title: "Communicators cannot chat", description: "You are observing.", variant: "default"});
      return;
    }

    const newMessage: ChatMessage = {
      id: generateShortId(10),
      playerId: localPlayer.id,
      playerName: localPlayer.name,
      text: text,
      timestamp: Date.now(), // Consider serverTimestamp for better accuracy if needed
    };
    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await updateDoc(gameDocRef, {
        chatMessages: arrayUnion(newMessage)
      });
    } catch (error) {
      console.error("Error sending chat message:", error);
      toast({ title: "Error", description: "Could not send message.", variant: "destructive" });
    }
  };

  const accuseHelper = async (accusedPlayerId: string) => {
    if (!gameState || !localPlayerId) return;
    const accuser = gameState.players.find(p => p.id === localPlayerId);
    const accusedPlayer = gameState.players.find(p => p.id === accusedPlayerId);

    if (!accuser || !accusedPlayer ) {
      toast({title: "Invalid Action", description: "Problem with accusation data.", variant: "destructive"});
      return;
    }
    if (accuser.role !== 'Imposter') {
      toast({title: "Invalid Action", description: "Only Imposters can accuse the Helper.", variant: "destructive"});
      return;
    }
    // Check if this imposter's team has already made their one accusation
    if (gameState.accusationsMadeByImposters >= 1) { // Max 1 accusation for the Imposter team
       toast({title: "Accusation Limit Reached", description: "Your team has already made its one accusation.", variant: "destructive"});
       return;
    }

    let winner: GameState['winner'] = undefined;
    let logMessage = `${accuser.name} (Imposter) accused ${accusedPlayer.name} of being the Helper.`;
    if (accusedPlayer.role === 'Helper') {
      winner = 'Imposters';
      logMessage += " Correct! Imposters win!";
    } else {
      winner = 'GoodTeam'; // Imposters lose if they guess wrong
      logMessage += " Incorrect! The Imposters' guess was wrong. The Good Team wins!";
    }
    
    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await updateDoc(gameDocRef, {
        status: 'finished',
        winner: winner,
        gameLog: arrayUnion(logMessage),
        accusationsMadeByImposters: increment(1) // Increment regardless of outcome, for team limit
      });
    } catch (error) {
      console.error("Error processing accusation:", error);
      toast({ title: "Error", description: "Could not process accusation.", variant: "destructive" });
    }
  };
  
  const leaveGame = async () => {
    if (!gameState || !localPlayerId) return;
    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      const playerToRemove = gameState.players.find(p => p.id === localPlayerId);
      if (playerToRemove) {
        // Atomically remove the player
        await runTransaction(db, async (transaction) => {
          const gameSnap = await transaction.get(gameDocRef);
          if (!gameSnap.exists()) throw "Game not found";
          
          const currentPlayers = gameSnap.data().players as Player[];
          const updatedPlayers = currentPlayers.filter(p => p.id !== localPlayerId);

          if (updatedPlayers.length === 0) {
            // If last player leaves, delete the game
            transaction.delete(gameDocRef);
          } else {
            // If host leaves, assign a new host
            let newHostId = gameSnap.data().hostId;
            if (playerToRemove.isHost && updatedPlayers.length > 0) {
              newHostId = updatedPlayers[0].id; // Assign to the next player
              const newHostUpdatedPlayers = updatedPlayers.map((p,idx) => idx === 0 ? {...p, isHost: true} : p);
              transaction.update(gameDocRef, { players: newHostUpdatedPlayers, hostId: newHostId, gameLog: arrayUnion(`${playerToRemove.name} (Host) left. ${updatedPlayers[0].name} is the new host.`) });
            } else {
              transaction.update(gameDocRef, { players: updatedPlayers, gameLog: arrayUnion(`${playerToRemove.name} left the game.`) });
            }
          }
        });
      }
      setGameState(null); // Clear local state immediately, redirect handled by page
    } catch (error) {
      console.error("Error leaving game:", error);
      toast({ title: "Error", description: `Could not leave game: ${(error as Error).message}`, variant: "destructive" });
    }
  };

  const callMeeting = async () => {
    if (!gameState || !localPlayerId) return;
    const player = gameState.players.find(p => p.id === localPlayerId);
    
    if (!player) {
      toast({ title: "Error", description: "Player not found.", variant: "destructive" });
      return;
    }
    if (player.hasCalledMeeting) {
      toast({ title: "Meeting Cooldown", description: "You've already called a meeting this game.", variant: "default" });
      return;
    }
    if (gameState.meetingsCalled >= gameState.maxMeetings) {
      toast({ title: "Meeting Limit Reached", description: "No more emergency meetings can be called this game.", variant: "default" });
      return;
    }
    if (gameState.status === 'meeting') {
      toast({ title: "Meeting in Progress", description: "A meeting is already underway.", variant: "default" });
      return;
    }

    const gameDocRef = doc(db, "games", gameState.gameId);
    const updatedPlayers = gameState.players.map(p => p.id === localPlayerId ? {...p, hasCalledMeeting: true} : p);
    try {
      await updateDoc(gameDocRef, {
        status: 'meeting',
        meetingsCalled: increment(1),
        players: updatedPlayers,
        gameLog: arrayUnion(`${player.name} called an emergency meeting. All players gather! (This phase is for Imposters to accuse the Helper).`)
      });
      // No automatic timeout for meeting - it ends when an action is taken (e.g., accusation) or manually (not implemented yet)
    } catch (error) {
      console.error("Error calling meeting:", error);
      toast({ title: "Error", description: "Could not call meeting.", variant: "destructive" });
    }
  };
  
  const updatePlayerInContext = async (playerData: Partial<Player> & { id: string }) => {
    if (!gameState || !gameState.players.find(p => p.id === playerData.id)) {
      toast({title: "Error", description: "Cannot update player: Game or player not found.", variant: "destructive"});
      return;
    }
    const gameDocRef = doc(db, "games", gameState.gameId);
    // This is a bit naive, as it replaces the entire players array.
    // For specific updates like 'isAlive', a more targeted update might be better
    // if concurrent updates are frequent. But for most player-specific attributes, this is fine.
    const updatedPlayers = gameState.players.map(p => p.id === playerData.id ? { ...p, ...playerData } : p);
    try {
      await updateDoc(gameDocRef, { players: updatedPlayers });
    } catch (error) {
      console.error("Error updating player:", error);
      toast({ title: "Error", description: "Could not update player data.", variant: "destructive" });
    }
  };

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(() => ({
    gameState,
    localPlayerId,
    setLocalPlayerId,
    isLoading,
    createGame,
    joinGame,
    startGameAI,
    dispatch,
    sendChatMessage,
    accuseHelper,
    leaveGame,
    callMeeting,
    updatePlayerInContext,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [gameState, localPlayerId, isLoading, toast]); // Dependencies that, when changed, should recreate the context object. Async functions that don't change based on these can be omitted if wrapped in useCallback.

  return (
    <GameContext.Provider value={contextValue}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};
