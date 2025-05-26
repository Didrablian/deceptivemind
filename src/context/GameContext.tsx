
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, arrayRemove, increment, runTransaction, deleteDoc, serverTimestamp, type Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { GameState, Player, GameWord, ChatMessage, Role, GameStatus } from '@/lib/types';
import { initialGameState, generateShortId, assignRolesAndClues, calculateScores } from '@/lib/gameUtils';
import { generateWordsAndClues } from '@/ai/flows/generate-words-and-clues';
import { useToast } from '@/hooks/use-toast';

interface GameContextProps {
  gameState: GameState | null;
  localPlayerId: string | null;
  setLocalPlayerId: (id: string | null) => void;
  isLoading: boolean;
  isInitialized: boolean;
  createGame: (username: string) => Promise<string | null>;
  joinGame: (gameIdToJoin: string, username: string) => Promise<boolean>;
  startGameAI: () => Promise<void>;
  sendChatMessage: (text: string) => Promise<void>;
  leaveGame: () => Promise<void>;
  // New game actions
  eliminateWord: (wordText: string) => Promise<void>;
  lockInWord: (wordText: string) => Promise<void>;
  imposterAccuseHelperInTwist: (accusedPlayerId: string) => Promise<void>;
  acknowledgeRole: () => Promise<void>;
  updatePlayerInContext: (playerData: Partial<Player> & { id: string }) => Promise<void>; // Kept for potential use
}

const GameContext = createContext<GameContextProps | undefined>(undefined);

export const GameProvider = ({ children, gameIdFromParams }: { children: ReactNode, gameIdFromParams?: string }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [localPlayerId, setLocalPlayerIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const { toast } = useToast();

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
      setIsInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (!isInitialized || !gameIdFromParams) {
      if (gameIdFromParams) setIsLoading(true);
      else setIsLoading(false);
      if (!gameIdFromParams) setGameState(null);
      return;
    }
    
    setIsLoading(true);
    const gameDocRef = doc(db, "games", gameIdFromParams);
    const unsubscribe = onSnapshot(gameDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GameState;
        const processedData = {
          ...data,
          chatMessages: data.chatMessages ? data.chatMessages.map(msg => ({
            ...msg,
            timestamp: msg.timestamp && (msg.timestamp as unknown as Timestamp).toDate ? (msg.timestamp as unknown as Timestamp).toDate().getTime() : Date.now() 
          })) : [],
          players: data.players ? data.players.map(p => ({...p, score: p.score || 0})) : [],
        };
        setGameState(processedData);
      } else {
        setGameState(null);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error listening to game state:", error);
      toast({ title: "Connection Error", description: "Could not connect to game session.", variant: "destructive"});
      setIsLoading(false);
      setGameState(null);
    });

    return () => unsubscribe();
  }, [isInitialized, gameIdFromParams, toast]);

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
    if (!isInitialized || !localPlayerId) {
      toast({ title: "Context not ready", description: "Player ID not available.", variant: "destructive"});
      return null;
    }
    
    const newGameId = generateShortId(6).toUpperCase();
    const hostPlayer: Player = {
      id: localPlayerId,
      name: username,
      role: "Communicator", // Placeholder, assigned at start
      isHost: true,
      isAlive: true,
      clue: null,
      score: 0,
      isRevealedImposter: false,
    };
    const newGame = initialGameState(newGameId, hostPlayer);
    
    try {
      const gameDocRef = doc(db, "games", newGameId);
      await setDoc(gameDocRef, newGame);
      return newGameId;
    } catch (error) {
      console.error("Error creating game:", error);
      toast({ title: "Error Creating Game", variant: "destructive"});
      return null;
    }
  };

  const joinGame = async (gameIdToJoin: string, username: string): Promise<boolean> => {
    if (!isInitialized || !localPlayerId) {
      toast({ title: "Context not ready", description: "Player ID not available.", variant: "destructive"});
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
          return true; // Already in game
        }
        if (currentGameData.players.length >= currentGameData.maxPlayers) {
          toast({ title: "Lobby Full", variant: "destructive" });
          return false;
        }
        if (currentGameData.status !== 'lobby') {
          toast({ title: "Game in Progress", variant: "destructive" });
          return false;
        }

        const joiningPlayer: Player = {
          id: localPlayerId,
          name: username,
          role: "ClueHolder", // Placeholder
          isHost: false,
          isAlive: true,
          clue: null,
          score: 0,
          isRevealedImposter: false,
        };
        transaction.update(gameDocRef, {
          players: arrayUnion(joiningPlayer),
          actualPlayerCount: increment(1),
          gameLog: arrayUnion(`${username} joined the lobby.`)
        });
        return true;
      });
    } catch (error) {
      console.error("Error joining game:", error);
      toast({ title: "Error Joining Game", variant: "destructive"});
      return false;
    }
  };

  const startGameAI = async () => {
    if (!gameState || !localPlayerId || gameState.hostId !== localPlayerId) {
      toast({ title: "Not Host", variant: "destructive" });
      return;
    }
    if (gameState.players.length < gameState.minPlayers || gameState.players.length > gameState.maxPlayers) {
      toast({ title: "Invalid Player Count", description: `Need ${gameState.minPlayers}-${gameState.maxPlayers} players.`, variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      toast({ title: "Starting Game...", description: "AI is generating words and clues." });
      const aiData = await generateWordsAndClues({ numberOfWords: 9 }); 
      
      if (!aiData || !aiData.words || aiData.words.length < 9 || !aiData.targetWord || !aiData.helperClue || !aiData.clueHolderClue) {
        throw new Error("AI failed to generate complete game data.");
      }
      
      const { updatedPlayers, gameWords } = assignRolesAndClues(gameState.players, aiData);
      
      const gameDocRef = doc(db, "games", gameState.gameId);
      await updateDoc(gameDocRef, {
        status: 'role-reveal',
        words: gameWords,
        targetWord: aiData.targetWord,
        players: updatedPlayers,
        gameLog: arrayUnion(`Game started by ${gameState.players.find(p=>p.isHost)?.name}. Roles assigned!`),
        chatMessages: [],
        eliminationCount: 0,
        lockedInWordGuess: null,
        actualPlayerCount: gameState.players.length, // Set actual count at game start
      });
    } catch (error) {
      console.error("Failed to start game with AI:", error);
      toast({ title: "Error Starting Game", description: (error as Error).message, variant: "destructive" });
      setIsLoading(false);
    }
  };

  const acknowledgeRole = async () => {
    if (!gameState || !localPlayerId) return;
    const gameDocRef = doc(db, "games", gameState.gameId);
    // Simple transition, more complex logic could check if all players acknowledged
    await updateDoc(gameDocRef, { status: 'discussion' });
  };
  
  const sendChatMessage = async (text: string) => {
    if (!gameState || !localPlayerId) return;
    const localPlayer = gameState.players.find(p => p.id === localPlayerId);
    if (!localPlayer) return;

    const newMessage: ChatMessage = {
      id: generateShortId(10),
      playerId: localPlayer.id,
      playerName: localPlayer.name,
      text: text,
      timestamp: serverTimestamp() as Timestamp, 
    };
    const gameDocRef = doc(db, "games", gameState.gameId);
    await updateDoc(gameDocRef, { chatMessages: arrayUnion(newMessage) });
  };

  const eliminateWord = async (wordText: string) => {
    if (!gameState || !localPlayerId) return;
    const player = gameState.players.find(p => p.id === localPlayerId);
    if (!player || player.role !== 'Communicator') {
      toast({ title: "Invalid Action", description: "Only the Communicator can eliminate words.", variant: "destructive" });
      return;
    }
    if (gameState.status !== 'discussion' && gameState.status !== 'word-elimination') {
        toast({ title: "Invalid Action", description: "Words can only be eliminated during discussion/elimination phase.", variant: "destructive" });
        return;
    }
    if (gameState.eliminationCount >= gameState.maxEliminations) {
        toast({ title: "Max Eliminations Reached", variant: "default" });
        return;
    }

    const gameDocRef = doc(db, "games", gameState.gameId);
    const wordToEnd = gameState.words.find(w => w.text === wordText);

    if (!wordToEnd || wordToEnd.isEliminated) {
        toast({ title: "Invalid Word", description: "Word not found or already eliminated.", variant: "destructive"});
        return;
    }

    const updatedWords = gameState.words.map(w => w.text === wordText ? { ...w, isEliminated: true } : w);
    const newEliminationCount = gameState.eliminationCount + 1;
    let newStatus: GameStatus = 'discussion'; // Return to discussion
    let winner: GameState['winner'] = null;
    let winningReason = "";
    let finalPlayersState = gameState.players;

    if (wordToEnd.isTarget) {
      winner = 'Imposters';
      winningReason = `The Communicator eliminated the secret word (${wordText})!`;
      newStatus = 'finished';
      const scoredPlayers = calculateScores({...gameState, words: updatedWords, eliminationCount: newEliminationCount, winner, winningReason });
      finalPlayersState = scoredPlayers;
    } else if (newEliminationCount >= gameState.maxEliminations) {
      // If max eliminations reached and target not eliminated, team must lock in.
      // For now, let's assume game continues to lock-in phase or could be a loss if no target found.
      // This part of the rule "Max 3 eliminations" needs clarity if target not found & not eliminated.
      // For now, let's assume it goes to lock-in or if no words left, a specific outcome.
      // The current game loop doesn't explicitly end here, it relies on lock-in.
       newStatus = 'discussion'; // Or a dedicated "final guess" phase
    }

    await updateDoc(gameDocRef, {
      words: updatedWords,
      eliminationCount: newEliminationCount,
      status: newStatus,
      winner: winner,
      winningReason: winningReason,
      gameLog: arrayUnion(`${player.name} (Communicator) eliminated "${wordText}". Eliminations: ${newEliminationCount}/${gameState.maxEliminations}.`),
      players: finalPlayersState, // Update scores if game ended
    });
  };

  const lockInWord = async (wordText: string) => {
    if (!gameState || !localPlayerId) return;
    const player = gameState.players.find(p => p.id === localPlayerId);
    if (!player) return;

    const gameDocRef = doc(db, "games", gameState.gameId);
    const guessedWord = gameState.words.find(w => w.text === wordText);

    if (!guessedWord || guessedWord.isEliminated) {
      toast({ title: "Invalid Guess", description: "Cannot lock in an eliminated or non-existent word.", variant: "destructive" });
      return;
    }
    
    let newStatus: GameStatus = gameState.status;
    let winner: GameState['winner'] = null;
    let winningReason = "";
    let finalPlayersState = gameState.players;

    if (guessedWord.isTarget) {
      newStatus = 'post-guess-reveal';
      winningReason = `Team locked in the correct word: "${wordText}"! Now Imposters try to find the Helper.`;
      // Mark Imposters as revealed for UI
      finalPlayersState = gameState.players.map(p => p.role === 'Imposter' ? {...p, isRevealedImposter: true} : p);
    } else {
      winner = 'Imposters';
      winningReason = `Team locked in the wrong word: "${wordText}". The secret word was "${gameState.targetWord}".`;
      newStatus = 'finished';
      const scoredPlayers = calculateScores({...gameState, winner, winningReason, lockedInWordGuess: {wordText, playerId: localPlayerId} });
      finalPlayersState = scoredPlayers;
    }

    await updateDoc(gameDocRef, {
      status: newStatus,
      lockedInWordGuess: { wordText, playerId: localPlayerId },
      winner: winner,
      winningReason: winningReason,
      gameLog: arrayUnion(`${player.name} locked in "${wordText}". ${winningReason}`),
      players: finalPlayersState,
    });
  };

  const imposterAccuseHelperInTwist = async (accusedPlayerId: string) => {
    if (!gameState || !localPlayerId || gameState.status !== 'post-guess-reveal') return;
    
    const accuser = gameState.players.find(p => p.id === localPlayerId);
    if (!accuser || accuser.role !== 'Imposter') {
      toast({ title: "Invalid Action", description: "Only revealed Imposters can accuse the Helper now.", variant: "destructive" });
      return;
    }
    
    const accusedPlayer = gameState.players.find(p => p.id === accusedPlayerId);
    if (!accusedPlayer) return;

    const gameDocRef = doc(db, "games", gameState.gameId);
    let winner: GameState['winner'];
    let winningReason = "";

    if (accusedPlayer.role === 'Helper') {
      winner = 'Imposters'; // Imposters win by points, but team also gets points
      winningReason = `Imposters correctly exposed ${accusedPlayer.name} as the Helper!`;
    } else {
      winner = 'Team'; // Team wins (Helper hidden)
      winningReason = `Imposters failed to expose the Helper. ${accusedPlayer.name} was not the Helper.`;
    }
    
    const finalGameState = {...gameState, winner, winningReason};
    const scoredPlayers = calculateScores(finalGameState);

    await updateDoc(gameDocRef, {
      status: 'finished',
      winner: winner,
      winningReason: winningReason,
      gameLog: arrayUnion(`${accuser.name} (Imposter) accused ${accusedPlayer.name}. ${winningReason}`),
      players: scoredPlayers,
    });
  };
  
  const leaveGame = async () => {
    if (!gameState || !localPlayerId || !isInitialized) return;
    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await runTransaction(db, async (transaction) => {
        const gameSnap = await transaction.get(gameDocRef);
        if (!gameSnap.exists()) return;
        
        const currentData = gameSnap.data() as GameState;
        const playerToRemove = currentData.players.find(p => p.id === localPlayerId);

        if (playerToRemove) {
          const updatedPlayers = currentData.players.filter(p => p.id !== localPlayerId);
          const newActualPlayerCount = currentData.actualPlayerCount ? currentData.actualPlayerCount - 1 : updatedPlayers.length;

          if (updatedPlayers.length === 0) {
            transaction.delete(gameDocRef);
          } else {
            let newHostId = currentData.hostId;
            let newPlayersArray = updatedPlayers;
            let logMsg = `${playerToRemove.name} left the game.`;

            if (playerToRemove.isHost && updatedPlayers.length > 0) {
              newHostId = updatedPlayers[0].id; 
              newPlayersArray = updatedPlayers.map((p, idx) => 
                idx === 0 ? { ...p, isHost: true } : { ...p, isHost: (p.isHost || false) } // Ensure isHost is boolean
              );
              newPlayersArray[0].isHost = true; // Explicitly set new host
              logMsg = `${playerToRemove.name} (Host) left. ${updatedPlayers[0].name} is the new host.`;
            }
            transaction.update(gameDocRef, { 
              players: newPlayersArray, 
              hostId: newHostId, 
              gameLog: arrayUnion(logMsg),
              actualPlayerCount: newActualPlayerCount,
            });
          }
        }
      });
      setGameState(null); 
    } catch (error) {
      console.error("Error leaving game:", error);
      toast({ title: "Error Leaving Game", variant: "destructive"});
    }
  };
  
  const updatePlayerInContext = async (playerData: Partial<Player> & { id: string }) => {
    if (!gameState || !isInitialized || !gameState.players.find(p => p.id === playerData.id)) {
      toast({title: "Update Error", variant: "destructive"});
      return;
    }
    const gameDocRef = doc(db, "games", gameState.gameId);
    const updatedPlayers = gameState.players.map(p => p.id === playerData.id ? { ...p, ...playerData } : p);
    try {
      await updateDoc(gameDocRef, { players: updatedPlayers });
    } catch (error) {
      console.error("Error updating player data in Firestore:", error);
      toast({ title: "Player Update Error", variant: "destructive" });
    }
  };

  const contextValue = useMemo(() => ({
    gameState,
    localPlayerId,
    setLocalPlayerId,
    isLoading,
    isInitialized,
    createGame,
    joinGame,
    startGameAI,
    sendChatMessage,
    leaveGame,
    eliminateWord,
    lockInWord,
    imposterAccuseHelperInTwist,
    acknowledgeRole,
    updatePlayerInContext,
  }), [gameState, localPlayerId, isLoading, isInitialized, toast, createGame, joinGame, startGameAI, sendChatMessage, leaveGame, eliminateWord, lockInWord, imposterAccuseHelperInTwist, acknowledgeRole, updatePlayerInContext]);

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
