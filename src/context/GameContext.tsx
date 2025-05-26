
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, arrayRemove, increment, runTransaction, deleteDoc, Timestamp } from 'firebase/firestore';
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
  eliminateWord: (wordText: string) => Promise<void>;
  lockInWord: (wordText: string) => Promise<void>;
  imposterAccuseHelperInTwist: (accusedPlayerId: string) => Promise<void>;
  acknowledgeRole: () => Promise<void>;
  updatePlayerInContext: (playerData: Partial<Player> & { id: string }) => Promise<void>;
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
          chatMessages: data.chatMessages ? data.chatMessages.map(msg => {
            let processedTimestamp: number;
            if (typeof msg.timestamp === 'number') {
              processedTimestamp = msg.timestamp; // Already a number (e.g., from Date.now())
            } else if (msg.timestamp && (msg.timestamp as unknown as Timestamp).toDate) {
              processedTimestamp = (msg.timestamp as unknown as Timestamp).toDate().getTime(); // Convert Firestore Timestamp to number
            } else {
              processedTimestamp = Date.now(); // Fallback, should ideally not happen
            }
            return {...msg, timestamp: processedTimestamp };
          }) : [],
          players: data.players ? data.players.map(p => ({...p, score: p.score || 0, isHost: p.isHost || false, isRevealedImposter: p.isRevealedImposter || false })) : [],
        };
        setGameState(processedData);
      } else {
        setGameState(null);
        toast({ title: "Game Not Found", description: `Game with ID ${gameIdFromParams} does not exist.`, variant: "destructive"});
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
      toast({ title: "Context not ready", description: "Player ID not available. Please refresh.", variant: "destructive"});
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
      toast({ title: "Error Creating Game", description: (error as Error).message, variant: "destructive"});
      return null;
    }
  };

  const joinGame = async (gameIdToJoin: string, username: string): Promise<boolean> => {
    if (!isInitialized || !localPlayerId) {
      toast({ title: "Context not ready", description: "Player ID not available. Please refresh.", variant: "destructive"});
      return false;
    }
    const gameDocRef = doc(db, "games", gameIdToJoin);
    try {
      return await runTransaction(db, async (transaction) => {
        const gameSnap = await transaction.get(gameDocRef);
        if (!gameSnap.exists()) {
          toast({ title: "Game Not Found", description: `Game with ID ${gameIdToJoin} does not exist.`, variant: "destructive" });
          return false;
        }

        const currentGameData = gameSnap.data() as GameState;
        if (currentGameData.players.find(p => p.id === localPlayerId)) {
          return true; // Already in game
        }
        if (currentGameData.players.length >= currentGameData.maxPlayers) {
          toast({ title: "Lobby Full", description: `This game lobby is full (${currentGameData.maxPlayers} players max).`, variant: "destructive" });
          return false;
        }
        if (currentGameData.status !== 'lobby') {
          toast({ title: "Game in Progress", description: "This game has already started or finished.", variant: "destructive" });
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
      toast({ title: "Error Joining Game", description: (error as Error).message, variant: "destructive"});
      return false;
    }
  };

 const startGameAI = async () => {
    if (!gameState || !localPlayerId || gameState.hostId !== localPlayerId) {
      toast({ title: "Not Host", description: "Only the host can start the game.", variant: "destructive" });
      return;
    }
    if (gameState.players.length < gameState.minPlayers || gameState.players.length > gameState.maxPlayers) {
      toast({ title: "Invalid Player Count", description: `Need ${gameState.minPlayers}-${gameState.maxPlayers} players. Currently ${gameState.players.length}.`, variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      toast({ title: "Starting Game...", description: "AI is generating words and clues." });
      const aiData = await generateWordsAndClues({ numberOfWords: 9 });

      if (!aiData || !aiData.words || aiData.words.length < 9 || !aiData.targetWord || !aiData.helperClue || !aiData.clueHolderClue) {
        throw new Error("AI failed to generate complete game data. Please try starting again.");
      }

      const { updatedPlayers, gameWords } = assignRolesAndClues(gameState.players, aiData);

      const gameDocRef = doc(db, "games", gameState.gameId);
      await updateDoc(gameDocRef, {
        status: 'role-reveal' as GameStatus,
        words: gameWords,
        targetWord: aiData.targetWord,
        players: updatedPlayers,
        gameLog: arrayUnion(`Game started by ${gameState.players.find(p=>p.id === gameState.hostId)?.name}. Roles assigned!`),
        chatMessages: [], // Reset chat messages
        eliminationCount: 0,
        lockedInWordGuess: null,
        winner: null,
        winningReason: "",
        actualPlayerCount: gameState.players.length, // Confirm actual player count at game start
      });
      // setIsLoading(false); // Firestore listener will update loading state
    } catch (error) {
      console.error("Failed to start game with AI:", error);
      toast({ title: "Error Starting Game", description: (error as Error).message, variant: "destructive" });
      setIsLoading(false); // Ensure loading is false on error
    }
  };

  const acknowledgeRole = async () => {
    if (!gameState || !localPlayerId) return;
    const gameDocRef = doc(db, "games", gameState.gameId);
    // For now, directly transition to discussion.
    // Could add logic to wait for all players to acknowledge.
    try {
      await updateDoc(gameDocRef, { status: 'discussion' as GameStatus });
    } catch (error) {
      console.error("Error acknowledging role:", error);
      toast({ title: "Error", description: "Could not update game status.", variant: "destructive"});
    }
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
      timestamp: Date.now(), // Use client-generated number timestamp
    };
    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await updateDoc(gameDocRef, { chatMessages: arrayUnion(newMessage) });
    } catch (error) {
      console.error("Error sending chat message:", error);
      toast({ title: "Chat Error", description: "Could not send message.", variant: "destructive"});
    }
  };

  const eliminateWord = async (wordText: string) => {
    if (!gameState || !localPlayerId) return;
    const player = gameState.players.find(p => p.id === localPlayerId);
    if (!player || player.role !== 'Communicator') {
      toast({ title: "Invalid Action", description: "Only the Communicator can eliminate words.", variant: "destructive" });
      return;
    }
    if (gameState.status !== 'discussion' && gameState.status !== 'word-elimination') { // word-elimination is an alias for discussion here
        toast({ title: "Invalid Action", description: "Words can only be eliminated during discussion phase.", variant: "destructive" });
        return;
    }
    if (gameState.eliminationCount >= gameState.maxEliminations) {
        toast({ title: "Max Eliminations Reached", description: `Maximum ${gameState.maxEliminations} words can be eliminated.`, variant: "default" });
        return;
    }

    const gameDocRef = doc(db, "games", gameState.gameId);
    const wordToEnd = gameState.words.find(w => w.text === wordText);

    if (!wordToEnd || wordToEnd.isEliminated) {
        toast({ title: "Invalid Word", description: "Word not found or already eliminated.", variant: "destructive"});
        return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const freshGameSnap = await transaction.get(gameDocRef);
        if (!freshGameSnap.exists()) throw new Error("Game not found");
        const freshGameState = freshGameSnap.data() as GameState;

        const updatedWords = freshGameState.words.map(w => w.text === wordText ? { ...w, isEliminated: true } : w);
        const newEliminationCount = freshGameState.eliminationCount + 1;
        let newStatus: GameStatus = 'discussion';
        let winner: GameState['winner'] = null;
        let winningReason = "";
        let finalPlayersState = freshGameState.players;

        if (wordToEnd.isTarget) {
          winner = 'Imposters';
          winningReason = `The Communicator eliminated the secret word (${wordText})! Imposters win.`;
          newStatus = 'finished';
          const scoredPlayers = calculateScores({...freshGameState, words: updatedWords, eliminationCount: newEliminationCount, winner, winningReason, players: freshGameState.players });
          finalPlayersState = scoredPlayers;
        } else if (newEliminationCount >= freshGameState.maxEliminations) {
           // If max eliminations reached and target not eliminated, team MUST lock in a word.
           // No automatic win/loss here; game proceeds. Could add a toast.
           toast({title: "Max Eliminations Reached", description: `No more eliminations. Team must lock in a word.`});
        }

        transaction.update(gameDocRef, {
          words: updatedWords,
          eliminationCount: newEliminationCount,
          status: newStatus,
          winner: winner,
          winningReason: winningReason,
          gameLog: arrayUnion(`${player.name} (Communicator) eliminated "${wordText}". Eliminations: ${newEliminationCount}/${freshGameState.maxEliminations}. ${winner ? winningReason : ''}`),
          players: finalPlayersState,
        });
      });
    } catch (error) {
      console.error("Error eliminating word:", error);
      toast({ title: "Elimination Error", description: (error as Error).message, variant: "destructive"});
    }
  };

  const lockInWord = async (wordText: string) => {
    if (!gameState || !localPlayerId) return;
    const player = gameState.players.find(p => p.id === localPlayerId);
    if (!player) return;
    if (player.role === 'Communicator') {
      toast({ title: "Invalid Action", description: "Communicator eliminates, other team members lock in.", variant: "destructive" });
      return;
    }
    if (gameState.status !== 'discussion' && gameState.status !== 'word-elimination') {
      toast({ title: "Invalid Phase", description: "Can only lock in a word during discussion.", variant: "destructive" });
      return;
    }

    const gameDocRef = doc(db, "games", gameState.gameId);
    const guessedWord = gameState.words.find(w => w.text === wordText);

    if (!guessedWord || guessedWord.isEliminated) {
      toast({ title: "Invalid Guess", description: "Cannot lock in an eliminated or non-existent word.", variant: "destructive" });
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const freshGameSnap = await transaction.get(gameDocRef);
        if (!freshGameSnap.exists()) throw new Error("Game not found");
        const freshGameState = freshGameSnap.data() as GameState;

        let newStatus: GameStatus = freshGameState.status;
        let winner: GameState['winner'] = null;
        let winningReason = "";
        let finalPlayersState = freshGameState.players;

        if (guessedWord.isTarget) {
          newStatus = 'post-guess-reveal';
          winningReason = `Team locked in the correct word: "${wordText}"! Now Imposters try to find the Helper.`;
          finalPlayersState = freshGameState.players.map(p => p.role === 'Imposter' ? {...p, isRevealedImposter: true} : p);
        } else {
          winner = 'Imposters';
          winningReason = `Team locked in the wrong word: "${wordText}". The secret word was "${freshGameState.targetWord}". Imposters win.`;
          newStatus = 'finished';
          const scoredPlayers = calculateScores({...freshGameState, winner, winningReason, lockedInWordGuess: {wordText, playerId: localPlayerId}, players: freshGameState.players });
          finalPlayersState = scoredPlayers;
        }

        transaction.update(gameDocRef, {
          status: newStatus,
          lockedInWordGuess: { wordText, playerId: localPlayerId, isCorrect: guessedWord.isTarget },
          winner: winner,
          winningReason: winningReason,
          gameLog: arrayUnion(`${player.name} locked in "${wordText}". ${winningReason}`),
          players: finalPlayersState,
        });
      });
    } catch (error) {
      console.error("Error locking in word:", error);
      toast({ title: "Lock-in Error", description: (error as Error).message, variant: "destructive"});
    }
  };

  const imposterAccuseHelperInTwist = async (accusedPlayerId: string) => {
    if (!gameState || !localPlayerId || gameState.status !== 'post-guess-reveal') return;

    const accuser = gameState.players.find(p => p.id === localPlayerId);
    if (!accuser || accuser.role !== 'Imposter' || !accuser.isRevealedImposter) {
      toast({ title: "Invalid Action", description: "Only revealed Imposters can accuse the Helper now.", variant: "destructive" });
      return;
    }

    const accusedPlayer = gameState.players.find(p => p.id === accusedPlayerId);
    if (!accusedPlayer) return;
    if (accusedPlayer.role === 'Imposter') {
      toast({ title: "Invalid Target", description: "Cannot accuse a fellow Imposter.", variant: "destructive" });
      return;
    }

    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await runTransaction(db, async (transaction) => {
        const freshGameSnap = await transaction.get(gameDocRef);
        if (!freshGameSnap.exists()) throw new Error("Game not found");
        const freshGameState = freshGameSnap.data() as GameState;

        let winner: GameState['winner'];
        let winningReason = "";

        if (accusedPlayer.role === 'Helper') {
          winner = 'Imposters'; // As per scoring: Team wins (Helper exposed)	+1 for team, +3 for Imposters
          winningReason = `Imposters correctly exposed ${accusedPlayer.name} as the Helper!`;
        } else {
          winner = 'Team';
          winningReason = `Imposters failed to expose the Helper. ${accusedPlayer.name} was not the Helper. Team wins!`;
        }

        const finalGameStateWithAccusation = {...freshGameState, winner, winningReason, players: freshGameState.players};
        const scoredPlayers = calculateScores(finalGameStateWithAccusation);

        transaction.update(gameDocRef, {
          status: 'finished' as GameStatus,
          winner: winner,
          winningReason: winningReason,
          gameLog: arrayUnion(`${accuser.name} (Imposter) accused ${accusedPlayer.name} of being the Helper. ${winningReason}`),
          players: scoredPlayers,
        });
      });
    } catch (error) {
      console.error("Error during Helper accusation:", error);
      toast({ title: "Accusation Error", description: (error as Error).message, variant: "destructive"});
    }
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
          const newActualPlayerCount = Math.max(0, (currentData.actualPlayerCount || updatedPlayers.length) - 1);

          if (updatedPlayers.length === 0 && currentData.status === 'lobby') { // Only delete if lobby is empty
            transaction.delete(gameDocRef);
          } else if (updatedPlayers.length < currentData.minPlayers && currentData.status !== 'lobby' && currentData.status !== 'finished') {
            // If player leaving mid-game drops count below minimum, end game
            transaction.update(gameDocRef, {
                players: updatedPlayers,
                actualPlayerCount: newActualPlayerCount,
                status: 'finished' as GameStatus,
                winner: 'NoOne' as GameState['winner'],
                winningReason: `${playerToRemove.name} left. Not enough players to continue. Game ended.`,
                gameLog: arrayUnion(`${playerToRemove.name} left. Game ended due to insufficient players.`)
            });
          }
          else {
            let newHostId = currentData.hostId;
            let newPlayersArray = updatedPlayers;
            let logMsg = `${playerToRemove.name} left the game.`;

            if (playerToRemove.isHost && updatedPlayers.length > 0) {
              newHostId = updatedPlayers[0].id;
              newPlayersArray = updatedPlayers.map((p, idx) =>
                idx === 0 ? { ...p, isHost: true } : { ...p, isHost: p.isHost || false }
              );
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
      if (gameState.players.filter(p => p.id !== localPlayerId).length === 0 && gameState.status === 'lobby') {
        // If this was the last player in a lobby, gameState might be cleared by deletion
        setGameState(null);
      }
      // Otherwise, local state will update via onSnapshot or user navigates away
    } catch (error) {
      console.error("Error leaving game:", error);
      toast({ title: "Error Leaving Game", description: (error as Error).message, variant: "destructive"});
    }
  };

  const updatePlayerInContext = async (playerData: Partial<Player> & { id: string }) => {
    if (!gameState || !isInitialized || !gameState.players.find(p => p.id === playerData.id)) {
      toast({title: "Update Error: Player or game not found.", variant: "destructive"});
      return;
    }
    const gameDocRef = doc(db, "games", gameState.gameId);
    const updatedPlayers = gameState.players.map(p => p.id === playerData.id ? { ...p, ...playerData } : p);
    try {
      await updateDoc(gameDocRef, { players: updatedPlayers });
    } catch (error) {
      console.error("Error updating player data in Firestore:", error);
      toast({ title: "Player Update Error", description: (error as Error).message, variant: "destructive" });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [gameState, localPlayerId, isLoading, isInitialized, toast]);

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
