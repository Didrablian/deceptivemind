
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, increment, runTransaction, Timestamp, deleteDoc, FieldValue } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { GameState, Player, GameWord, ChatMessage, Role, GameStatus } from '@/lib/types';
import { initialGameState, generateShortId, assignRolesAndClues, calculateScores, shuffleArray } from '@/lib/gameUtils';
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
  startNewRound: () => Promise<void>;
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
    if (!isInitialized) {
      setIsLoading(true);
      return;
    }

    if (!gameIdFromParams) {
      setGameState(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const gameDocRef = doc(db, "games", gameIdFromParams);
    const unsubscribe = onSnapshot(gameDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GameState;
        const processedData: GameState = {
          ...data,
          chatMessages: data.chatMessages ? data.chatMessages.map(msg => {
            let processedTimestamp: number;
            if (typeof msg.timestamp === 'number') {
              processedTimestamp = msg.timestamp;
            } else if (msg.timestamp && (msg.timestamp as unknown as Timestamp)?.toDate) {
              processedTimestamp = (msg.timestamp as unknown as Timestamp).toDate().getTime();
            } else {
              processedTimestamp = Date.now();
            }
            return {...msg, timestamp: processedTimestamp };
          }).sort((a,b) => a.timestamp - b.timestamp) : [],
          players: data.players ? data.players.map(p => ({
            ...p,
            score: p.score || 0,
            isHost: p.isHost === undefined ? (p.id === data.hostId) : p.isHost,
            isRevealedImposter: p.isRevealedImposter || false,
            clue: p.clue === undefined ? null : p.clue,
            isAlive: p.isAlive === undefined ? true : p.isAlive,
          })) : [],
          targetWord: data.targetWord || "",
          eliminationCount: data.eliminationCount || 0,
          maxEliminations: data.maxEliminations || 3,
          minPlayers: data.minPlayers || 4, // Default to 4 if not set
          maxPlayers: data.maxPlayers || 8, // Default to 8 if not set
          actualPlayerCount: data.actualPlayerCount === undefined ? (data.players?.length || 0) : data.actualPlayerCount,
          lockedInWordGuess: data.lockedInWordGuess === undefined ? null : data.lockedInWordGuess,
          winner: data.winner === undefined ? null : data.winner,
          winningReason: data.winningReason === undefined ? "" : data.winningReason,
          gameLog: data.gameLog || [],
          words: data.words || [],
          playerScoresBeforeRound: data.playerScoresBeforeRound || {},
        };
        setGameState(processedData);
      } else {
        setGameState(null);
        toast({ title: "Game Ended", description: "This game session no longer exists.", variant: "default"});
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
      role: "ClueHolder", // Will be reassigned on game start
      isHost: true,
      isAlive: true,
      clue: null,
      score: 0,
      isRevealedImposter: false,
    };
    const newGame = initialGameState(newGameId, hostPlayer);
    newGame.playerScoresBeforeRound = { [hostPlayer.id]: 0 };

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
          return true;
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
          role: "ClueHolder", // Will be reassigned on game start
          isHost: false,
          isAlive: true,
          clue: null,
          score: 0,
          isRevealedImposter: false,
        };

        const updatedPlayerScoresBeforeRound = {
            ...(currentGameData.playerScoresBeforeRound || {}),
            [localPlayerId]: 0
        };

        transaction.update(gameDocRef, {
          players: arrayUnion(joiningPlayer),
          actualPlayerCount: increment(1),
          gameLog: arrayUnion(`${username} joined the lobby.`),
          playerScoresBeforeRound: updatedPlayerScoresBeforeRound
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
      toast({ title: "Generating words and clues...", description: "Please wait." });
      const aiData = await generateWordsAndClues({ numberOfWords: 9 });

      if (!aiData || !aiData.words || aiData.words.length === 0 || !aiData.targetWord || !aiData.helperClue || !aiData.clueHolderClue) {
        throw new Error("Failed to generate complete game data. Please try starting again.");
      }

      // Snapshot scores before the first round (all should be 0 for a new game)
      const scoresSnapshot = gameState.players.reduce((acc, p) => {
        acc[p.id] = p.score || 0;
        return acc;
      }, {} as Record<string, number>);

      const shuffledPlayersForAssignment = shuffleArray([...gameState.players]);
      const { updatedPlayers, gameWords } = assignRolesAndClues(shuffledPlayersForAssignment, aiData, gameState.minPlayers, gameState.maxPlayers);

      const gameDocRef = doc(db, "games", gameState.gameId);
      await updateDoc(gameDocRef, {
        status: 'role-reveal' as GameStatus,
        words: gameWords,
        targetWord: aiData.targetWord,
        players: updatedPlayers,
        gameLog: arrayUnion(`Game started by ${gameState.players.find(p=>p.id === gameState.hostId)?.name}. Roles assigned!`),
        chatMessages: [],
        eliminationCount: 0,
        lockedInWordGuess: null,
        winner: null,
        winningReason: "",
        actualPlayerCount: gameState.players.length,
        playerScoresBeforeRound: scoresSnapshot,
      });
    } catch (error) {
      console.error("Failed to start game:", error);
      toast({ title: "Error Starting Game", description: (error as Error).message, variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };

  const acknowledgeRole = async () => {
    if (!gameState || !localPlayerId) return;
    const gameDocRef = doc(db, "games", gameState.gameId);
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
      timestamp: Date.now(), // Use client-side timestamp
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
    if (gameState.status !== 'discussion' && gameState.status !== 'word-elimination') {
        toast({ title: "Invalid Action", description: "Words can only be eliminated during discussion phase.", variant: "destructive" });
        return;
    }
    if (gameState.eliminationCount >= gameState.maxEliminations) {
        toast({ title: "Max Eliminations Reached", description: `Maximum ${gameState.maxEliminations} words can be eliminated.`, variant: "default" });
        return;
    }

    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await runTransaction(db, async (transaction) => {
        const freshGameSnap = await transaction.get(gameDocRef);
        if (!freshGameSnap.exists()) throw new Error("Game not found");
        const freshGameState = freshGameSnap.data() as GameState;

        const wordToEnd = freshGameState.words.find(w => w.text === wordText);
        if (!wordToEnd || wordToEnd.isEliminated) {
            toast({ title: "Invalid Word", description: "Word not found or already eliminated.", variant: "destructive"});
            throw new Error("Invalid word for elimination");
        }

        const updatedWords = freshGameState.words.map(w => w.text === wordText ? { ...w, isEliminated: true } : w);
        const newEliminationCount = (freshGameState.eliminationCount || 0) + 1;
        let newStatus: GameStatus = freshGameState.status;
        let gameWinner: GameState['winner'] = null;
        let reason = "";
        let finalPlayersState = freshGameState.players;

        if (wordToEnd.isTarget) {
          gameWinner = 'Imposters';
          reason = `The Communicator eliminated the secret word (${wordText})! Imposters win. Key:IMPOSTER_WIN_TARGET_ELIMINATED`;
          newStatus = 'finished';
          finalPlayersState = calculateScores({...freshGameState, words: updatedWords, eliminationCount: newEliminationCount, winner: gameWinner, winningReason: reason, players: freshGameState.players, targetWord: freshGameState.targetWord });
        } else if (newEliminationCount >= freshGameState.maxEliminations) {
           toast({title: "Max Eliminations Reached", description: `No more eliminations. Team must lock in a word.`});
        }

        transaction.update(gameDocRef, {
          words: updatedWords,
          eliminationCount: newEliminationCount,
          status: newStatus,
          winner: gameWinner,
          winningReason: reason,
          gameLog: arrayUnion(`${player.name} (Communicator) eliminated "${wordText}". Eliminations: ${newEliminationCount}/${freshGameState.maxEliminations}. ${reason}`),
          players: finalPlayersState,
        });
      });
    } catch (error) {
      console.error("Error eliminating word:", error);
      if ((error as Error).message !== "Invalid word for elimination") {
        toast({ title: "Elimination Error", description: (error as Error).message, variant: "destructive"});
      }
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
    try {
      await runTransaction(db, async (transaction) => {
        const freshGameSnap = await transaction.get(gameDocRef);
        if (!freshGameSnap.exists()) throw new Error("Game not found");
        const freshGameState = freshGameSnap.data() as GameState;

        const guessedWord = freshGameState.words.find(w => w.text === wordText);
        if (!guessedWord || guessedWord.isEliminated) {
          toast({ title: "Invalid Guess", description: "Cannot lock in an eliminated or non-existent word.", variant: "destructive" });
          throw new Error("Invalid word for lock-in");
        }

        let newStatus: GameStatus = freshGameState.status;
        let gameWinner: GameState['winner'] = null;
        let reason = "";
        let finalPlayersState = freshGameState.players;
        const lockedInWordData = { wordText, playerId: localPlayerId, isCorrect: !!guessedWord?.isTarget };

        const systemMessage: ChatMessage = {
            id: generateShortId(10),
            playerId: 'SYSTEM_GAME_EVENT',
            playerName: 'Game Event',
            text: `${player.name} locked in the word: "${wordText}".`,
            timestamp: Date.now(),
        };

        if (guessedWord.isTarget) {
          newStatus = 'post-guess-reveal';
          reason = `Team locked in the correct word: "${wordText}"! Key:CORRECT_WORD_LOCKED`;
          finalPlayersState = freshGameState.players.map(p =>
            p.role === 'Imposter' ? {...p, isRevealedImposter: true} : p
          );
        } else {
          gameWinner = 'Imposters';
          reason = `Team locked in the wrong word: "${wordText}". The secret word was "${freshGameState.targetWord}". Imposters win. Key:IMPOSTER_WIN_WRONG_WORD`;
          newStatus = 'finished';
          finalPlayersState = calculateScores({...freshGameState, winner: gameWinner, winningReason: reason, lockedInWordGuess: lockedInWordData, players: finalPlayersState, words: freshGameState.words, targetWord: freshGameState.targetWord });
        }

        transaction.update(gameDocRef, {
          status: newStatus,
          lockedInWordGuess: lockedInWordData,
          winner: gameWinner,
          winningReason: reason,
          gameLog: arrayUnion(`${player.name} locked in "${wordText}". ${reason}`),
          players: finalPlayersState,
          chatMessages: arrayUnion(systemMessage),
        });
      });
    } catch (error) {
      console.error("Error locking in word:", error);
      if ((error as Error).message !== "Invalid word for lock-in") {
         toast({ title: "Lock-in Error", description: (error as Error).message, variant: "destructive"});
      }
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
    if (!accusedPlayer) {
        toast({ title: "Accusation Error", description: "Accused player not found.", variant: "destructive" });
        return;
    }
    if (accusedPlayer.role === 'Imposter') {
      toast({ title: "Invalid Target", description: "Cannot accuse a fellow Imposter.", variant: "destructive" });
      return;
    }

    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await runTransaction(db, async (transaction) => {
        const freshGameSnap = await transaction.get(gameDocRef);
        if (!freshGameSnap.exists()) throw new Error("Game not found");
        let freshGameState = freshGameSnap.data() as GameState;

        let gameWinner: GameState['winner'] = 'Team';
        let reason = "";

        const wrongEliminationsCount = freshGameState.words.filter(w => w.isEliminated && !w.isTarget).length;

        if (accusedPlayer.role === 'Helper') {
          gameWinner = 'Team'; // Team still won the round, Imposter gets points for the find
          reason = `Team guessed the word! Imposters (${accuser.name}) correctly exposed ${accusedPlayer.name} as the Helper. Key:HELPER_EXPOSED`;
        } else {
          gameWinner = 'Team';
          const helperName = freshGameState.players.find(p => p.role === 'Helper')?.name || 'The Helper';
          if (wrongEliminationsCount === 0) {
            reason = `Team achieved a PERFECT GAME! They guessed the word, ${helperName} remained hidden, and no wrong words were eliminated. Key:PERFECT_GAME`;
          } else {
            reason = `Team guessed the word! Imposters (${accuser.name}) failed to expose the Helper. ${accusedPlayer.name} was not the Helper. Key:HELPER_HIDDEN`;
          }
        }

        freshGameState = {...freshGameState, winner: gameWinner, winningReason: reason, status: 'finished'};
        const finalPlayersState = calculateScores(freshGameState);


        transaction.update(gameDocRef, {
          status: 'finished' as GameStatus,
          winner: gameWinner,
          winningReason: reason,
          gameLog: arrayUnion(`${accuser.name} (Imposter) accused ${accusedPlayer.name} of being the Helper. Result: ${reason}`),
          players: finalPlayersState,
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
          const newActualPlayerCount = Math.max(0, updatedPlayers.length);

          if (updatedPlayers.length === 0 && currentData.status !== 'finished') {
            transaction.delete(gameDocRef);
            console.log(`Game ${currentData.gameId} deleted as last player left.`);
          } else if (updatedPlayers.length === 0 && currentData.status === 'finished') {
             transaction.update(gameDocRef, {
                players: updatedPlayers,
                actualPlayerCount: 0,
                gameLog: arrayUnion(`${playerToRemove.name} left the finished game.`),
             });
          } else {
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

            if (newActualPlayerCount < currentData.minPlayers && currentData.status !== 'lobby' && currentData.status !== 'finished') {
              let reason = `${playerToRemove.name} left. Not enough players to continue. Game ended.`;
              const finalPlayers = calculateScores({...currentData, players: newPlayersArray, winner: 'NoOne', winningReason: reason, words: currentData.words, targetWord: currentData.targetWord });
              transaction.update(gameDocRef, {
                  players: finalPlayers,
                  actualPlayerCount: newActualPlayerCount,
                  status: 'finished' as GameStatus,
                  winner: 'NoOne' as GameState['winner'],
                  winningReason: reason,
                  hostId: newHostId,
                  gameLog: arrayUnion(reason, logMsg)
              });
            } else {
              transaction.update(gameDocRef, {
                players: newPlayersArray,
                hostId: newHostId,
                gameLog: arrayUnion(logMsg),
                actualPlayerCount: newActualPlayerCount,
              });
            }
          }
        }
      });
      if (gameState.players.length -1 === 0 && gameState.status !== 'finished') {
         setGameState(null);
      }
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
    console.warn("updatePlayerInContext called directly. Ensure this is intended and not better handled by a specific game action.");
    const gameDocRef = doc(db, "games", gameState.gameId);
    const updatedPlayers = gameState.players.map(p => p.id === playerData.id ? { ...p, ...playerData } : p);
    try {
      await updateDoc(gameDocRef, { players: updatedPlayers });
    } catch (error) {
      console.error("Error updating player data in Firestore:", error);
      toast({ title: "Player Update Error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const startNewRound = async () => {
    if (!gameState || !localPlayerId || gameState.hostId !== localPlayerId) {
      toast({ title: "Not Host", description: "Only the host can start a new round.", variant: "destructive" });
      return;
    }
    if (gameState.status !== 'finished') {
        toast({ title: "Game Not Finished", description: "Can only start a new round after the current game is finished.", variant: "destructive" });
        return;
    }
    if (gameState.players.length < gameState.minPlayers) {
        toast({ title: "Not Enough Players", description: `Need at least ${gameState.minPlayers} players for a new round. Currently ${gameState.players.length}.`, variant: "destructive" });
        return;
    }

    setIsLoading(true);
    try {
      toast({ title: "Generating words and clues...", description: "Please wait." });
      const aiData = await generateWordsAndClues({ numberOfWords: 9 });

      if (!aiData || !aiData.words || aiData.words.length === 0 || !aiData.targetWord || !aiData.helperClue || !aiData.clueHolderClue) {
        throw new Error("Failed to generate complete game data for the new round.");
      }

      const playersForNewRound = gameState.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score || 0,
        isHost: p.id === gameState.hostId,
        // Role, clue, isAlive, isRevealedImposter will be reset/reassigned
        role: "ClueHolder" as Role, // Placeholder, will be reassigned
        clue: null,
        isAlive: true,
        isRevealedImposter: false,
      }));

      const scoresSnapshot = playersForNewRound.reduce((acc, p) => {
        acc[p.id] = p.score;
        return acc;
      }, {} as Record<string, number>);

      const shuffledPlayersForAssignment = shuffleArray([...playersForNewRound]);
      const { updatedPlayers, gameWords } = assignRolesAndClues(shuffledPlayersForAssignment, aiData, gameState.minPlayers, gameState.maxPlayers);

      const gameDocRef = doc(db, "games", gameState.gameId);
      await updateDoc(gameDocRef, {
        status: 'role-reveal' as GameStatus,
        words: gameWords,
        targetWord: aiData.targetWord,
        players: updatedPlayers,
        eliminationCount: 0,
        lockedInWordGuess: null,
        winner: null,
        winningReason: "",
        chatMessages: [],
        gameLog: arrayUnion(`Host ${gameState.players.find(p => p.id === gameState.hostId)?.name || 'Host'} started a new round.`),
        actualPlayerCount: gameState.players.length,
        playerScoresBeforeRound: scoresSnapshot,
      });
    } catch (error) {
      console.error("Failed to start new round:", error);
      toast({ title: "Error Starting New Round", description: (error as Error).message, variant: "destructive" });
    } finally {
        setIsLoading(false);
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
    startNewRound,
  }), [gameState, localPlayerId, isLoading, isInitialized, toast, setLocalPlayerIdState]);

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

    