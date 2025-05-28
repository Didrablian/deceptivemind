"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, increment, runTransaction, Timestamp, FieldValue, deleteDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { GameState, Player, GameItem, ChatMessage, Role, GameStatus, GameMode, AIGameDataOutput } from '@/lib/types';
import { initialGameState, generateShortId, assignRolesAndClues, calculateScores, shuffleArray } from '@/lib/gameUtils';
import { generateWordsAndClues } from '@/ai/flows/generate-words-and-clues';
import { generateImagesAndClues } from '@/ai/flows/generate-images-and-clues';
import { useToast } from '@/hooks/use-toast';
import { getLobbyGameHistory, updateLobbyGameHistory } from '@/lib/gameHistory';

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
  communicatorConfirmTargetItem: (itemIdentifierText: string) => Promise<void>;
  imposterAccuseHelperInTwist: (accusedPlayerId: string) => Promise<void>;
  acknowledgeRole: () => Promise<void>;
  updatePlayerInContext: (playerData: Partial<Player> & { id: string }) => Promise<void>;
  startNewRound: () => Promise<void>;
  updateGameSettings: (settings: { gameMode: GameMode }) => Promise<void>;
  addBot: () => Promise<void>;
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
              processedTimestamp = Date.now(); // Fallback if timestamp is malformed
            }
            return {...msg, timestamp: processedTimestamp };
          }).sort((a,b) => a.timestamp - b.timestamp) : [],
          players: data.players ? data.players.map(p => ({
            ...p,
            score: p.score || 0,
            isHost: p.isHost === undefined ? (p.id === data.hostId) : p.isHost, // Ensure isHost is always boolean
            isRevealedImposter: p.isRevealedImposter || false, // Default to false
            clue: p.clue === undefined ? null : p.clue, // Default to null
            isAlive: p.isAlive === undefined ? true : p.isAlive, // Default to true
          })) : [],
          targetWord: data.targetWord || "", // Default to empty string
          eliminationCount: data.eliminationCount || 0,
          maxEliminations: data.maxEliminations || 3,
          minPlayers: data.minPlayers || 4, 
          maxPlayers: data.maxPlayers || 8, 
          actualPlayerCount: data.actualPlayerCount === undefined ? (data.players?.length || 0) : data.actualPlayerCount,
          lockedInWordGuess: data.lockedInWordGuess === undefined ? null : data.lockedInWordGuess,
          winner: data.winner === undefined ? null : data.winner,
          winningReason: data.winningReason === undefined ? "" : data.winningReason,
          gameLog: data.gameLog || [],
          items: data.items ? data.items.map(item => ({
            ...item,
            isEliminated: item.isEliminated || false,
            imageUrl: item.imageUrl === null ? undefined : item.imageUrl,
          })) : [],
          playerScoresBeforeRound: data.playerScoresBeforeRound || {},
          gameMode: data.gameMode || 'words',
          numberOfItems: data.numberOfItems || (data.gameMode === 'images' ? 4 : 9),
          // Timer fields
          phaseStartTime: data.phaseStartTime || undefined,
          phaseDuration: data.phaseDuration || undefined,
          timeRemaining: data.timeRemaining || undefined,
        };
        setGameState(processedData);
      } else {
        setGameState(null);
        // Optionally, redirect or show "Game not found" message if appropriate here
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
      role: "ClueHolder" as Role, // Default, will be reassigned
      isHost: true,
      isAlive: true,
      clue: null,
      score: 0,
      isRevealedImposter: false,
    };
    const newGame = initialGameState(newGameId, hostPlayer);
    newGame.playerScoresBeforeRound = { [hostPlayer.id]: 0 }; // Initialize for host

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
          return true; // Player already in game
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
          role: "ClueHolder" as Role, // Default, will be reassigned
          isHost: false,
          isAlive: true,
          clue: null,
          score: 0,
          isRevealedImposter: false,
        };
         const updatedPlayerScoresBeforeRound = {
            ...(currentGameData.playerScoresBeforeRound || {}),
            [localPlayerId]: 0 // Initialize score for joining player
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
      const itemType = gameState.gameMode === 'images' ? 'images' : 'words';
      toast({ title: `Generating ${itemType} and clues...`, description: `Please wait while we generate ${gameState.numberOfItems} ${itemType}. This may take 30-60 seconds.` });
      
      // Get lobby game history for unique content generation
      const lobbyHistory = getLobbyGameHistory(gameState.gameId);
      console.log(`🎯 [GAME-START] Lobby ${gameState.gameId} - Game #${lobbyHistory.gameCount + 1}`);
      console.log(`📚 [GAME-START] Previous items used: ${lobbyHistory.usedDescriptions.length}`);
      console.log(`🎨 [GAME-START] Themes explored: ${lobbyHistory.usedThemes.length}`);
      
      let aiData: AIGameDataOutput & { gameHistoryUpdate?: any };
      if (gameState.gameMode === 'images') {
        aiData = await generateImagesAndClues({ 
          numberOfImages: gameState.numberOfItems,
          gameHistory: lobbyHistory
        });
      } else { // 'words' mode
        // TODO: Update generateWordsAndClues to also use gameHistory
        aiData = await generateWordsAndClues({ numberOfWords: gameState.numberOfItems });
      }

      if (!aiData || !aiData.items || aiData.items.length === 0 || !aiData.targetItemDescription || !aiData.clueHolderClue) {
        throw new Error("Failed to generate complete game data. Please try starting again.");
      }

      // Update lobby history with new game data
      if (aiData.gameHistoryUpdate) {
        updateLobbyGameHistory(gameState.gameId, aiData.gameHistoryUpdate);
        console.log(`✅ [GAME-START] Updated lobby history for next game`);
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

      // Ensure gameItems have default for isEliminated and imageUrl
      const cleanGameItems = gameItems.map(item => ({
          text: item.text,
          isTarget: item.isTarget,
          isEliminated: item.isEliminated || false,
          imageUrl: item.imageUrl === undefined ? null : item.imageUrl,
      }));

      const gameDocRef = doc(db, "games", gameState.gameId);
      await updateDoc(gameDocRef, {
        status: 'role-reveal' as GameStatus,
        items: cleanGameItems,
        targetWord: aiData.targetItemDescription,
        players: updatedPlayers,
        gameLog: arrayUnion(`Game started by ${gameState.players.find(p=>p.id === gameState.hostId)?.name}. Roles assigned!`),
        chatMessages: [], // Clear chat for new game
        eliminationCount: 0,
        lockedInWordGuess: null,
        winner: null,
        winningReason: "",
        actualPlayerCount: gameState.players.length, // ensure this is correct
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
      const now = Date.now();
      await updateDoc(gameDocRef, { 
        status: 'role-understanding' as GameStatus,
        phaseStartTime: now,
        phaseDuration: 30,
        timeRemaining: 30
      });
      
      // Auto-advance to identification phase after 30 seconds
      setTimeout(async () => {
        try {
          await updateDoc(gameDocRef, {
            status: 'identification' as GameStatus,
            phaseStartTime: Date.now(),
            phaseDuration: 180, // 3 minutes
            timeRemaining: 180,
            gameLog: arrayUnion("Identification phase begins - 3 minutes to identify the word/imposter!")
          });
          
          // Auto-advance to discussion after 3 minutes
          setTimeout(async () => {
            try {
              await updateDoc(gameDocRef, {
                status: 'discussion' as GameStatus,
                currentAccusation: null,
                phaseStartTime: deleteField(),
                timeRemaining: deleteField(),
                gameLog: arrayUnion(`Discussion phase started. Communicator has chosen their target.`),
              });
            } catch (error) {
              console.error("Error auto-advancing to discussion:", error);
            }
          }, 180000); // 3 minutes = 180,000ms
          
        } catch (error) {
          console.error("Error auto-advancing to identification:", error);
        }
      }, 30000); // 30 seconds = 30,000ms
      
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
      timestamp: Date.now(), // Using client-side timestamp
    };
    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await updateDoc(gameDocRef, { chatMessages: arrayUnion(newMessage) });
    } catch (error) {
      console.error("Error sending chat message:", error);
      toast({ title: "Chat Error", description: "Could not send message.", variant: "destructive"});
    }
  };

  const communicatorConfirmTargetItem = async (itemIdentifierText: string) => {
    if (!gameState || !localPlayerId) return;
    const player = gameState.players.find(p => p.id === localPlayerId);
    if (!player || player.role !== 'Communicator') {
      toast({ title: "Invalid Action", description: "Only the Communicator can confirm the target item.", variant: "destructive" });
      return;
    }
    if (gameState.status !== 'discussion' && gameState.status !== 'identification') {
      toast({ title: "Invalid Phase", description: "Can only confirm an item during identification or discussion phase.", variant: "destructive" });
      return;
    }

    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await runTransaction(db, async (transaction) => {
        const freshGameSnap = await transaction.get(gameDocRef);
        if (!freshGameSnap.exists()) throw new Error("Game not found");
        const freshGameState = freshGameSnap.data() as GameState;

        const guessedItem = freshGameState.items.find(i => i.text === itemIdentifierText);
        if (!guessedItem) {
          toast({ title: "Invalid Confirmation", description: "Cannot confirm a non-existent item.", variant: "destructive" });
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
          // Clear timer when moving to new phase
          phaseStartTime: deleteField(),
          phaseDuration: deleteField(),
          timeRemaining: deleteField(),
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
     if (accusedPlayer.role === 'Communicator') {
      toast({ title: "Invalid Target", description: "Cannot accuse the Communicator.", variant: "destructive" });
      return;
    }

    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await runTransaction(db, async (transaction) => {
        const freshGameSnap = await transaction.get(gameDocRef);
        if (!freshGameSnap.exists()) throw new Error("Game not found");
        let freshGameState = freshGameSnap.data() as GameState;

        let gameWinner: GameState['winner'] = 'Team'; // Default to team win if word was correct
        let reason = "";
        
        const itemTypeDisplay = freshGameState.gameMode === 'images' ? 'item' : 'word';

        if (accusedPlayer.role === 'Helper') {
          gameWinner = 'Team'; 
          reason = `Team guessed the ${itemTypeDisplay}! Imposters (${accuser.name}) correctly exposed ${accusedPlayer.name} as the Helper. Key:HELPER_EXPOSED`;
        } else {
          gameWinner = 'Team';
          const helperName = freshGameState.players.find(p => p.role === 'Helper')?.name || 'The Helper';
          reason = `Team guessed the ${itemTypeDisplay}! Imposters (${accuser.name}) failed to expose the Helper. ${accusedPlayer.name} was not the Helper. ${helperName} remained hidden. Key:HELPER_HIDDEN`;
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
             // If game is finished and last player leaves, still keep the record but empty players.
             transaction.update(gameDocRef, {
                players: [], // Empty player list
                actualPlayerCount: 0,
                gameLog: arrayUnion(`${playerToRemove.name} left the finished game. Game record remains.`),
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
              // Game ends if player count drops below minimum during active play
              let reason = `${playerToRemove.name} left. Not enough players to continue. Game ended.`;
              const finalPlayers = calculateScores({...currentData, players: newPlayersArray, winner: 'NoOne', winningReason: reason, items: currentData.items, targetWord: currentData.targetWord });
              transaction.update(gameDocRef, {
                  players: finalPlayers,
                  actualPlayerCount: newActualPlayerCount,
                  status: 'finished' as GameStatus,
                  winner: 'NoOne' as GameState['winner'],
                  winningReason: reason,
                  hostId: newHostId, // Ensure new host is set
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
      // If the current game was deleted or the local player is no longer part of it, clear local state.
      if (gameState.players.filter(p=>p.id === localPlayerId).length === 0 || 
          (gameState.players.length -1 === 0 && gameState.status !== 'finished')) {
         setGameState(null); // This might trigger redirect via GamePage useEffect
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

      // Get lobby game history for unique content generation
      const lobbyHistory = getLobbyGameHistory(gameState.gameId);
      console.log(`🎯 [NEW-ROUND] Lobby ${gameState.gameId} - Starting round #${lobbyHistory.gameCount + 1}`);
      console.log(`📚 [NEW-ROUND] Previous items used: ${lobbyHistory.usedDescriptions.length}`);
      console.log(`🎨 [NEW-ROUND] Themes explored: ${lobbyHistory.usedThemes.length}`);

      let aiData: AIGameDataOutput & { gameHistoryUpdate?: any };
      if (gameState.gameMode === 'images') {
        aiData = await generateImagesAndClues({ 
          numberOfImages: gameState.numberOfItems,
          gameHistory: lobbyHistory
        });
      } else { // 'words' mode
        // TODO: Update generateWordsAndClues to also use gameHistory
        aiData = await generateWordsAndClues({ numberOfWords: gameState.numberOfItems });
      }

      if (!aiData || !aiData.items || aiData.items.length === 0 || !aiData.targetItemDescription || !aiData.clueHolderClue ) {
        throw new Error("Failed to generate complete game data for the new round.");
      }

      // Update lobby history with new game data
      if (aiData.gameHistoryUpdate) {
        updateLobbyGameHistory(gameState.gameId, aiData.gameHistoryUpdate);
        console.log(`✅ [NEW-ROUND] Updated lobby history for next round`);
      }

      const playersForNewRound = gameState.players.map(p => ({
        // Preserve these from previous round
        id: p.id,
        name: p.name,
        score: p.score || 0,
        isHost: p.id === gameState.hostId,
        // Reset these for new round
        role: "ClueHolder" as Role, 
        clue: null,
        isAlive: true,
        isRevealedImposter: false,
      }));

      // Snapshot of scores *before* new roles and potential new round bonuses
      const scoresSnapshot = playersForNewRound.reduce((acc, p) => {
        acc[p.id] = p.score; // This is total score carried from previous round
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

      const cleanGameItems = gameItems.map(item => ({
          text: item.text,
          isTarget: item.isTarget,
          isEliminated: item.isEliminated || false,
          imageUrl: item.imageUrl === undefined ? null : item.imageUrl,
      }));

      const gameDocRef = doc(db, "games", gameState.gameId);
      await updateDoc(gameDocRef, {
        status: 'role-reveal' as GameStatus,
        items: cleanGameItems,
        targetWord: aiData.targetItemDescription,
        players: updatedPlayers, 
        eliminationCount: 0,
        lockedInWordGuess: null,
        winner: null,
        winningReason: "",
        chatMessages: [], 
        gameLog: arrayUnion(`Host ${gameState.players.find(p => p.id === gameState.hostId)?.name || 'Host'} started a new round.`),
        actualPlayerCount: gameState.players.length, // Should be same as current players
        playerScoresBeforeRound: scoresSnapshot, // Scores from *before* this round started
      });
    } catch (error) {
      console.error("Failed to start new round:", error);
      toast({ title: "Error Starting New Round", description: (error as Error).message, variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };

  const addBot = async () => {
    if (!gameState || !localPlayerId || gameState.hostId !== localPlayerId) {
      toast({ title: "Not Host", description: "Only the host can add bots.", variant: "destructive" });
      return;
    }
    if (gameState.status !== 'lobby') {
      toast({ title: "Game Not in Lobby", description: "Can only add bots in the lobby.", variant: "destructive" });
      return;
    }
    if (gameState.players.length >= gameState.maxPlayers) {
      toast({ title: "Lobby Full", description: `Cannot add more players. Maximum is ${gameState.maxPlayers}.`, variant: "destructive" });
      return;
    }

    const botNames = [
      "Bot Alice", "Bot Bob", "Bot Charlie", "Bot Diana", "Bot Eve", "Bot Frank", 
      "Bot Grace", "Bot Henry", "Bot Ivy", "Bot Jack", "Bot Kate", "Bot Leo"
    ];
    
    // Find an unused bot name
    const usedNames = gameState.players.map(p => p.name);
    const availableBotName = botNames.find(name => !usedNames.includes(name)) || `Bot ${generateShortId(4)}`;

    const botPlayer: Player = {
      id: `bot_${generateShortId(8)}`,
      name: availableBotName,
      role: "ClueHolder" as Role, // Default, will be reassigned
      isHost: false,
      isAlive: true,
      clue: null,
      score: 0,
      isRevealedImposter: false,
    };

    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await runTransaction(db, async (transaction) => {
        const gameSnap = await transaction.get(gameDocRef);
        if (!gameSnap.exists()) {
          throw new Error("Game not found");
        }
        
        const currentGameData = gameSnap.data() as GameState;
        if (currentGameData.players.length >= currentGameData.maxPlayers) {
          throw new Error("Lobby is full");
        }
        if (currentGameData.status !== 'lobby') {
          throw new Error("Game is not in lobby state");
        }

        const updatedPlayers = [...currentGameData.players, botPlayer];
        const updatedScoresSnapshot = {
          ...currentGameData.playerScoresBeforeRound,
          [botPlayer.id]: 0
        };

        transaction.update(gameDocRef, {
          players: updatedPlayers,
          actualPlayerCount: updatedPlayers.length,
          playerScoresBeforeRound: updatedScoresSnapshot,
          gameLog: arrayUnion(`Bot ${botPlayer.name} joined the game.`)
        });
      });

      toast({ title: "Bot Added", description: `${botPlayer.name} joined the lobby!` });
    } catch (error) {
      console.error("Error adding bot:", error);
      toast({ title: "Error Adding Bot", description: (error as Error).message, variant: "destructive" });
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
    communicatorConfirmTargetItem,
    imposterAccuseHelperInTwist,
    acknowledgeRole,
    updatePlayerInContext,
    startNewRound,
    updateGameSettings,
    addBot,
  }), [gameState, localPlayerId, isLoading, isInitialized, toast]); // Ensure toast is stable or memoized if it causes re-renders

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
