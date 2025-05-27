
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, increment, runTransaction, Timestamp, FieldValue, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { GameState, Player, GameItem, ChatMessage, Role, GameStatus, GameMode, AIGameDataOutput } from '@/lib/types';
import { initialGameState, generateShortId, assignRolesAndClues, calculateScores, shuffleArray } from '@/lib/gameUtils';
import { generateWordsAndClues } from '@/ai/flows/generate-words-and-clues';
import { generateImagesAndClues } from '@/ai/flows/generate-images-and-clues'; // New AI flow
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
  eliminateItem: (itemIdentifierText: string) => Promise<void>; // Renamed
  communicatorConfirmTargetItem: (itemIdentifierText: string) => Promise<void>; // Renamed
  imposterAccuseHelperInTwist: (accusedPlayerId: string) => Promise<void>;
  acknowledgeRole: () => Promise<void>;
  updatePlayerInContext: (playerData: Partial<Player> & { id: string }) => Promise<void>;
  startNewRound: () => Promise<void>;
  updateGameSettings: (settings: { gameMode: GameMode }) => Promise<void>; // New
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
          minPlayers: data.minPlayers || 4, 
          maxPlayers: data.maxPlayers || 8, 
          actualPlayerCount: data.actualPlayerCount === undefined ? (data.players?.length || 0) : data.actualPlayerCount,
          lockedInWordGuess: data.lockedInWordGuess === undefined ? null : data.lockedInWordGuess,
          winner: data.winner === undefined ? null : data.winner,
          winningReason: data.winningReason === undefined ? "" : data.winningReason,
          gameLog: data.gameLog || [],
          items: data.items || [], // Changed from words to items
          playerScoresBeforeRound: data.playerScoresBeforeRound || {},
          gameMode: data.gameMode || 'words', // Added gameMode
          numberOfItems: data.numberOfItems || (data.gameMode === 'images' ? 4 : 9), // Added numberOfItems
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
      toast({ title: "Context not ready", description: "Player ID not available. Please refresh.", variant: "destructive"});
      return null;
    }
    const newGameId = generateShortId(6).toUpperCase();
    const hostPlayer: Player = {
      id: localPlayerId,
      name: username,
      role: "ClueHolder" as Role, // Default role, will be reassigned
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
          role: "ClueHolder" as Role,
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

  const updateGameSettings = async (settings: { gameMode: GameMode }) => {
    if (!gameState || !localPlayerId || gameState.hostId !== localPlayerId) {
      toast({ title: "Not Host", description: "Only the host can change game settings.", variant: "destructive" });
      return;
    }
    const gameDocRef = doc(db, "games", gameState.gameId);
    const numberOfItems = settings.gameMode === 'images' ? 4 : 9;
    try {
      await updateDoc(gameDocRef, { 
        gameMode: settings.gameMode,
        numberOfItems: numberOfItems,
        gameLog: arrayUnion(`Game mode changed to ${settings.gameMode} (${numberOfItems} items).`)
      });
    } catch (error) {
      console.error("Error updating game settings:", error);
      toast({ title: "Settings Error", description: (error as Error).message, variant: "destructive"});
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
      toast({ title: "Generating items and clues...", description: "Please wait." });
      
      let aiData: AIGameDataOutput;
      if (gameState.gameMode === 'images') {
        aiData = await generateImagesAndClues({ numberOfImages: gameState.numberOfItems });
      } else { // 'words' mode
        aiData = await generateWordsAndClues({ numberOfWords: gameState.numberOfItems });
      }

      if (!aiData || !aiData.items || aiData.items.length === 0 || !aiData.targetItemDescription || !aiData.clueHolderClue) {
        throw new Error("Failed to generate complete game data. Please try starting again.");
      }
      
      const scoresSnapshot = gameState.players.reduce((acc, p) => {
        acc[p.id] = p.score || 0;
        return acc;
      }, {} as Record<string, number>);

      const shuffledPlayersForAssignment = shuffleArray([...gameState.players]);
      const { updatedPlayers, gameItems } = assignRolesAndClues(
        shuffledPlayersForAssignment, 
        aiData, 
        gameState.minPlayers, 
        gameState.maxPlayers,
        gameState.gameMode,
        gameState.numberOfItems
      );

      const gameDocRef = doc(db, "games", gameState.gameId);
      await updateDoc(gameDocRef, {
        status: 'role-reveal' as GameStatus,
        items: gameItems,
        targetWord: aiData.targetItemDescription, // targetWord in DB stores the description
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
      timestamp: Date.now(), 
    };
    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await updateDoc(gameDocRef, { chatMessages: arrayUnion(newMessage) });
    } catch (error) {
      console.error("Error sending chat message:", error);
      toast({ title: "Chat Error", description: "Could not send message.", variant: "destructive"});
    }
  };

  const eliminateItem = async (itemIdentifierText: string) => { // Renamed from eliminateWord
    if (!gameState || !localPlayerId) return;
    const player = gameState.players.find(p => p.id === localPlayerId);
    if (!player || player.role !== 'Communicator') {
      toast({ title: "Invalid Action", description: "Only the Communicator can eliminate items.", variant: "destructive" });
      return;
    }
    if (gameState.status !== 'discussion' && gameState.status !== 'word-elimination') {
        toast({ title: "Invalid Action", description: "Items can only be eliminated during discussion phase.", variant: "destructive" });
        return;
    }
    if (gameState.eliminationCount >= gameState.maxEliminations) {
        toast({ title: "Max Eliminations Reached", description: `Maximum ${gameState.maxEliminations} items can be eliminated.`, variant: "default" });
        return;
    }

    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await runTransaction(db, async (transaction) => {
        const freshGameSnap = await transaction.get(gameDocRef);
        if (!freshGameSnap.exists()) throw new Error("Game not found");
        const freshGameState = freshGameSnap.data() as GameState;

        const itemToEnd = freshGameState.items.find(i => i.text === itemIdentifierText);
        if (!itemToEnd || itemToEnd.isEliminated) {
            toast({ title: "Invalid Item", description: "Item not found or already eliminated.", variant: "destructive"});
            throw new Error("Invalid item for elimination");
        }

        const updatedItems = freshGameState.items.map(i => i.text === itemIdentifierText ? { ...i, isEliminated: true } : i);
        const newEliminationCount = (freshGameState.eliminationCount || 0) + 1;
        let newStatus: GameStatus = freshGameState.status;
        let gameWinner: GameState['winner'] = null;
        let reason = "";
        let finalPlayersState = freshGameState.players;
        const itemTypeDisplay = freshGameState.gameMode === 'images' ? 'item' : 'word';

        if (itemToEnd.isTarget) {
          gameWinner = 'Imposters';
          reason = `The Communicator eliminated the secret ${itemTypeDisplay} ("${itemIdentifierText}")! Imposters win. Key:IMPOSTER_WIN_TARGET_ELIMINATED`;
          newStatus = 'finished';
          finalPlayersState = calculateScores({...freshGameState, items: updatedItems, eliminationCount: newEliminationCount, winner: gameWinner, winningReason: reason, players: freshGameState.players, targetWord: freshGameState.targetWord });
        } else if (newEliminationCount >= freshGameState.maxEliminations) {
           toast({title: "Max Eliminations Reached", description: `No more eliminations. Communicator must confirm a target ${itemTypeDisplay}.`});
        }

        transaction.update(gameDocRef, {
          items: updatedItems,
          eliminationCount: newEliminationCount,
          status: newStatus,
          winner: gameWinner,
          winningReason: reason,
          gameLog: arrayUnion(`${player.name} (Communicator) eliminated "${itemIdentifierText}". Eliminations: ${newEliminationCount}/${freshGameState.maxEliminations}. ${reason}`),
          players: finalPlayersState,
        });
      });
    } catch (error) {
      console.error("Error eliminating item:", error);
      if ((error as Error).message !== "Invalid item for elimination") {
        toast({ title: "Elimination Error", description: (error as Error).message, variant: "destructive"});
      }
    }
  };

  const communicatorConfirmTargetItem = async (itemIdentifierText: string) => { // Renamed
    if (!gameState || !localPlayerId) return;
    const player = gameState.players.find(p => p.id === localPlayerId);
    if (!player || player.role !== 'Communicator') {
      toast({ title: "Invalid Action", description: "Only the Communicator can confirm the target item.", variant: "destructive" });
      return;
    }
    if (gameState.status !== 'discussion' && gameState.status !== 'word-elimination') {
      toast({ title: "Invalid Phase", description: "Can only confirm an item during discussion/elimination phase.", variant: "destructive" });
      return;
    }

    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await runTransaction(db, async (transaction) => {
        const freshGameSnap = await transaction.get(gameDocRef);
        if (!freshGameSnap.exists()) throw new Error("Game not found");
        const freshGameState = freshGameSnap.data() as GameState;

        const guessedItem = freshGameState.items.find(i => i.text === itemIdentifierText);
        if (!guessedItem || guessedItem.isEliminated) {
          toast({ title: "Invalid Confirmation", description: "Cannot confirm an eliminated or non-existent item.", variant: "destructive" });
          throw new Error("Invalid item for confirmation");
        }

        let newStatus: GameStatus = freshGameState.status;
        let gameWinner: GameState['winner'] = null;
        let reason = "";
        let finalPlayersState = freshGameState.players;
        const confirmedItemData = { wordText: itemIdentifierText, playerId: localPlayerId, isCorrect: !!guessedItem?.isTarget };
        const itemTypeDisplay = freshGameState.gameMode === 'images' ? 'item' : 'word';

        const systemMessage: ChatMessage = {
            id: generateShortId(10),
            playerId: 'SYSTEM_GAME_EVENT',
            playerName: 'Game Event',
            text: `${player.name} (Communicator) confirmed the ${itemTypeDisplay}: "${itemIdentifierText}".`,
            timestamp: Date.now(),
        };

        if (guessedItem.isTarget) {
          newStatus = 'post-guess-reveal';
          reason = `Team, led by Communicator ${player.name}, confirmed the correct ${itemTypeDisplay}: "${itemIdentifierText}"! Key:CORRECT_WORD_LOCKED`;
          finalPlayersState = freshGameState.players.map(p =>
            p.role === 'Imposter' ? {...p, isRevealedImposter: true} : p
          );
        } else {
          gameWinner = 'Imposters';
          reason = `Communicator ${player.name} confirmed the wrong ${itemTypeDisplay}: "${itemIdentifierText}". The secret ${itemTypeDisplay} was "${freshGameState.targetWord}". Imposters win. Key:IMPOSTER_WIN_COMM_WRONG_CONFIRM`;
          newStatus = 'finished';
          finalPlayersState = calculateScores({...freshGameState, winner: gameWinner, winningReason: reason, lockedInWordGuess: confirmedItemData, players: finalPlayersState, items: freshGameState.items, targetWord: freshGameState.targetWord });
        }

        transaction.update(gameDocRef, {
          status: newStatus,
          lockedInWordGuess: confirmedItemData,
          winner: gameWinner,
          winningReason: reason,
          gameLog: arrayUnion(`${player.name} (Communicator) confirmed "${itemIdentifierText}". ${reason}`),
          players: finalPlayersState,
          chatMessages: arrayUnion(systemMessage),
        });
      });
    } catch (error) {
      console.error("Error confirming target item:", error);
      if ((error as Error).message !== "Invalid item for confirmation") {
         toast({ title: "Confirmation Error", description: (error as Error).message, variant: "destructive"});
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
        
        const wrongEliminationsCount = freshGameState.items.filter(w => w.isEliminated && !w.isTarget).length;
        const itemTypeDisplay = freshGameState.gameMode === 'images' ? 'item' : 'word';


        if (accusedPlayer.role === 'Helper') {
          gameWinner = 'Team'; 
          reason = `Team guessed the ${itemTypeDisplay}! Imposters (${accuser.name}) correctly exposed ${accusedPlayer.name} as the Helper. Key:HELPER_EXPOSED`;
        } else {
          gameWinner = 'Team';
          const helperName = freshGameState.players.find(p => p.role === 'Helper')?.name || 'The Helper';
           if (wrongEliminationsCount === 0 && freshGameState.eliminationCount < freshGameState.maxEliminations) {
            reason = `Team achieved a PERFECT GAME! They guessed the ${itemTypeDisplay}, ${helperName} remained hidden, and no wrong items were eliminated. Key:PERFECT_GAME`;
          } else {
            reason = `Team guessed the ${itemTypeDisplay}! Imposters (${accuser.name}) failed to expose the Helper. ${accusedPlayer.name} was not the Helper. ${helperName} remained hidden. Key:HELPER_HIDDEN`;
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
              const finalPlayers = calculateScores({...currentData, players: newPlayersArray, winner: 'NoOne', winningReason: reason, items: currentData.items, targetWord: currentData.targetWord });
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
      toast({ title: "Generating items and clues...", description: "Please wait." });

      let aiData: AIGameDataOutput;
      if (gameState.gameMode === 'images') {
        aiData = await generateImagesAndClues({ numberOfImages: gameState.numberOfItems });
      } else { // 'words' mode
        aiData = await generateWordsAndClues({ numberOfWords: gameState.numberOfItems });
      }

      if (!aiData || !aiData.items || aiData.items.length === 0 || !aiData.targetItemDescription || !aiData.clueHolderClue ) {
        throw new Error("Failed to generate complete game data for the new round.");
      }

      const playersForNewRound = gameState.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score || 0,
        isHost: p.id === gameState.hostId,
        role: "ClueHolder" as Role, 
        clue: null,
        isAlive: true,
        isRevealedImposter: false,
      }));

      const scoresSnapshot = playersForNewRound.reduce((acc, p) => {
        acc[p.id] = p.score;
        return acc;
      }, {} as Record<string, number>);

      const shuffledPlayersForAssignment = shuffleArray([...playersForNewRound]);
      const { updatedPlayers, gameItems } = assignRolesAndClues(
        shuffledPlayersForAssignment, 
        aiData, 
        gameState.minPlayers, 
        gameState.maxPlayers,
        gameState.gameMode,
        gameState.numberOfItems
      );

      const gameDocRef = doc(db, "games", gameState.gameId);
      await updateDoc(gameDocRef, {
        status: 'role-reveal' as GameStatus,
        items: gameItems,
        targetWord: aiData.targetItemDescription,
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
    eliminateItem, // Renamed
    communicatorConfirmTargetItem, // Renamed
    imposterAccuseHelperInTwist,
    acknowledgeRole,
    updatePlayerInContext,
    startNewRound,
    updateGameSettings, // Added
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
