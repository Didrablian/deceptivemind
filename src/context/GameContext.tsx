
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, arrayRemove, increment, runTransaction, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
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
  isInitialized: boolean; // Added to ensure context is ready
  createGame: (username: string) => Promise<string | null>;
  joinGame: (gameIdToJoin: string, username: string) => Promise<boolean>;
  startGameAI: () => Promise<void>;
  dispatch: (action: { type: string, payload: any }) => Promise<void>;
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
  const [isInitialized, setIsInitialized] = useState(false); // Track initialization
  const { toast } = useToast();

  // Initialize localPlayerId and gameId from URL/localStorage (client-side only)
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
      // gameIdFromParams is used by the Firestore listener effect.
      // No need to load gameState from localStorage anymore.
      setIsInitialized(true); // Set initialized to true once IDs are sorted.
    }
  }, []); // gameIdFromParams removed as it's for Firestore listener

  // Subscribe to Firestore document for game state changes
  useEffect(() => {
    if (!isInitialized || !gameIdFromParams) {
      // Don't try to subscribe if not initialized or no gameId
      if (gameIdFromParams) setIsLoading(true); // Still loading if gameId is present but not initialized
      else setIsLoading(false);
      if (!gameIdFromParams) setGameState(null); // Clear game state if no gameId
      return;
    }
    
    setIsLoading(true);
    const gameDocRef = doc(db, "games", gameIdFromParams);
    const unsubscribe = onSnapshot(gameDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setGameState(docSnap.data() as GameState);
      } else {
        setGameState(null);
        // Only toast if it wasn't an intentional leave/delete action
        // This might require more sophisticated logic if we want to differentiate
        toast({ title: "Game not found", description: "This game session may have ended or does not exist.", variant: "destructive"});
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
      toast({ title: "Context not ready", description: "Player ID not available or context not initialized.", variant: "destructive"});
      return null;
    }
    
    const newGameId = generateShortId(6).toUpperCase();
    const hostPlayer: Player = {
      id: localPlayerId,
      name: username,
      role: "Communicator", // Placeholder, will be reassigned at game start
      isHost: true,
      isAlive: true,
      hasCalledMeeting: false, // Explicitly set
      clue: null, // Explicitly set optional 'clue' to null
    };
    const newGame = initialGameState(newGameId, hostPlayer);
    
    try {
      const gameDocRef = doc(db, "games", newGameId);
      await setDoc(gameDocRef, newGame);
      // No need to set gameState locally here, onSnapshot will handle it
      return newGameId;
    } catch (error) {
      console.error("Error creating game:", error);
      const firebaseError = error as { code?: string; message: string };
      toast({ title: "Error Creating Game", description: firebaseError.message || "An unknown error occurred.", variant: "destructive"});
      return null;
    }
  };

  const joinGame = async (gameIdToJoin: string, username: string): Promise<boolean> => {
    if (!isInitialized || !localPlayerId) {
      toast({ title: "Context not ready", description: "Player ID not available or context not initialized.", variant: "destructive"});
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
          // Already in lobby or game
          return true;
        }
        if (currentGameData.players.length >= 5) {
          toast({ title: "Lobby Full", description: "This game lobby is already full.", variant: "destructive" });
          return false;
        }
        if (currentGameData.status !== 'lobby') {
          toast({ title: "Game in Progress", description: "Cannot join a game that has already started.", variant: "destructive" });
          return false;
        }

        const joiningPlayer: Player = {
          id: localPlayerId,
          name: username,
          role: "Communicator", // Placeholder, assigned at game start
          isHost: false, // Explicitly false for joining players
          isAlive: true,
          hasCalledMeeting: false, // Explicitly false
          clue: null, // Explicitly null
        };
        transaction.update(gameDocRef, {
          players: arrayUnion(joiningPlayer),
          gameLog: arrayUnion(`${username} joined the lobby.`)
        });
        return true;
      });
    } catch (error) {
      console.error("Error joining game:", error);
      const firebaseError = error as { code?: string; message: string };
      toast({ title: "Error Joining Game", description: firebaseError.message || "An unknown error occurred.", variant: "destructive"});
      return false;
    }
  };

  const startGameAI = async () => {
    if (!gameState || !localPlayerId || gameState.hostId !== localPlayerId) {
      toast({ title: "Not Host", description: "Only the host can start the game.", variant: "destructive" });
      return;
    }
    if (gameState.players.length !== 5) { // MAX_PLAYERS is 5
      toast({ title: "Not Enough Players", description: `Need 5 players to start. Currently ${gameState.players.length}.`, variant: "destructive" });
      return;
    }
    if (gameState.status !== 'lobby') {
      toast({ title: "Invalid Action", description: "Game can only be started from the lobby.", variant: "destructive" });
      return;
    }

    setIsLoading(true); // Show loading indicator while AI runs
    try {
      toast({ title: "Starting Game...", description: "The AI is generating words and clues. This may take a moment." });
      const aiData = await generateWordsAndClues({ numberOfWords: 9 }); 
      
      if (!aiData || !aiData.words || aiData.words.length < 9 || !aiData.targetWord || !aiData.helperClue || !aiData.clueHolderClue) {
        console.error("AI data is incomplete:", aiData);
        throw new Error("AI failed to generate complete game data. Please try again.");
      }
      
      const { updatedPlayers, gameWords } = assignRolesAndClues(gameState.players, aiData);
      
      const gameDocRef = doc(db, "games", gameState.gameId);
      await updateDoc(gameDocRef, {
        status: 'role-reveal',
        words: gameWords,
        targetWord: aiData.targetWord,
        players: updatedPlayers,
        gameLog: arrayUnion(`Game started by ${gameState.players.find(p=>p.isHost)?.name}. Roles assigned, words on the board!`),
        chatMessages: [], // Reset chat messages
        accusationsMadeByImposters: 0,
        meetingsCalled: 0,
      });
      // setIsLoading(false) will be handled by onSnapshot updating gameState
    } catch (error) {
      console.error("Failed to start game with AI:", error);
      toast({ title: "Error Starting Game", description: (error as Error).message || "The AI encountered an issue. Please try again.", variant: "destructive" });
      setIsLoading(false); // Ensure loading is stopped on error
    }
  };
  
  const dispatch = async (action: { type: string, payload: any }) => {
    if (!gameState || !isInitialized) {
       toast({ title: "Error", description: "Game state not available or not initialized.", variant: "destructive" });
      return;
    }
    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      switch (action.type) {
        case 'SET_STATUS':
          await updateDoc(gameDocRef, { 
            status: action.payload,
            gameLog: arrayUnion(`Game status changed to ${action.payload}.`)
          });
          break;
        // Other specific actions are now their own functions for clarity
        default:
          console.warn("Unhandled action type in dispatch:", action.type);
          toast({ title: "Unknown Action", description: `Action ${action.type} is not recognized.`, variant: "destructive" });
      }
    } catch (error) {
      console.error(`Error dispatching action ${action.type}:`, error);
      const firebaseError = error as { code?: string; message: string };
      toast({ title: "Game Update Error", description: firebaseError.message || "Could not update game state.", variant: "destructive" });
    }
  };
  
  const sendChatMessage = async (text: string) => {
    if (!gameState || !localPlayerId || !isInitialized) {
      toast({ title: "Error", description: "Cannot send message: game or player not ready.", variant: "destructive" });
      return;
    }
    const localPlayer = gameState.players.find(p => p.id === localPlayerId);
    if (!localPlayer) {
      toast({title: "Error", description: "Player not found in game.", variant: "destructive"});
      return;
    }
    if (localPlayer.role === 'Communicator' && gameState.status === 'playing') { // Communicators can chat during meetings perhaps? For now, disable in 'playing'
      toast({title: "Communicators Observe", description: "As a Communicator, you cannot send messages during normal play.", variant: "default"});
      return;
    }

    const newMessage: ChatMessage = {
      id: generateShortId(10),
      playerId: localPlayer.id,
      playerName: localPlayer.name,
      text: text,
      timestamp: serverTimestamp() as Timestamp, // Use server timestamp
    };
    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await updateDoc(gameDocRef, {
        chatMessages: arrayUnion(newMessage)
      });
    } catch (error) {
      console.error("Error sending chat message:", error);
      const firebaseError = error as { code?: string; message: string };
      toast({ title: "Message Error", description: `Could not send message: ${firebaseError.message}`, variant: "destructive" });
    }
  };

  const accuseHelper = async (accusedPlayerId: string) => {
    if (!gameState || !localPlayerId || !isInitialized) {
       toast({ title: "Error", description: "Cannot accuse: game or player not ready.", variant: "destructive" });
      return;
    }
    const accuser = gameState.players.find(p => p.id === localPlayerId);
    const accusedPlayer = gameState.players.find(p => p.id === accusedPlayerId);

    if (!accuser || !accusedPlayer ) {
      toast({title: "Invalid Accusation", description: "Accuser or accused player data is missing.", variant: "destructive"});
      return;
    }
    if (accuser.role !== 'Imposter') {
      toast({title: "Invalid Action", description: "Only Imposters can accuse the Helper.", variant: "destructive"});
      return;
    }
    if (gameState.accusationsMadeByImposters >= 1) { 
       toast({title: "Accusation Limit Reached", description: "Your Imposter team has already made its one accusation.", variant: "destructive"});
       return;
    }
    if (gameState.status !== 'meeting' && gameState.status !== 'accusation') { // Allow accusation during meeting or dedicated phase
        toast({title: "Invalid Timing", description: "Accusations can only be made during a meeting.", variant: "default"});
        return;
    }


    let winner: GameState['winner'] = null;
    let logMessage = `${accuser.name} (Imposter) accused ${accusedPlayer.name} of being the Helper.`;
    if (accusedPlayer.role === 'Helper') {
      winner = 'Imposters';
      logMessage += " Correct! The Imposters have identified the Helper. Imposters win!";
    } else {
      winner = 'GoodTeam'; 
      logMessage += ` Incorrect! ${accusedPlayer.name} is not the Helper. The Imposters' guess was wrong. The Good Team wins!`;
    }
    
    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await updateDoc(gameDocRef, {
        status: 'finished',
        winner: winner,
        gameLog: arrayUnion(logMessage),
        accusationsMadeByImposters: increment(1) 
      });
    } catch (error) {
      console.error("Error processing accusation:", error);
      const firebaseError = error as { code?: string; message: string };
      toast({ title: "Accusation Error", description: `Could not process accusation: ${firebaseError.message}`, variant: "destructive" });
    }
  };
  
  const leaveGame = async () => {
    if (!gameState || !localPlayerId || !isInitialized) {
      toast({ title: "Error", description: "Cannot leave game: game or player not ready.", variant: "destructive" });
      return;
    }
    const gameDocRef = doc(db, "games", gameState.gameId);
    try {
      await runTransaction(db, async (transaction) => {
        const gameSnap = await transaction.get(gameDocRef);
        if (!gameSnap.exists()) {
          // Game might have been deleted by another leaving player, which is fine.
          console.log("Attempted to leave a game that no longer exists.");
          return; 
        }
        
        const currentPlayers = gameSnap.data().players as Player[];
        const playerToRemove = currentPlayers.find(p => p.id === localPlayerId);

        if (playerToRemove) {
          const updatedPlayers = currentPlayers.filter(p => p.id !== localPlayerId);

          if (updatedPlayers.length === 0) {
            // If last player leaves, delete the game document
            transaction.delete(gameDocRef);
            toast({ title: "Game Ended", description: "The last player left, so the game has been removed." });
          } else {
            let newHostId = gameSnap.data().hostId;
            let newPlayersArray = updatedPlayers;
            let logMsg = `${playerToRemove.name} left the game.`;

            if (playerToRemove.isHost && updatedPlayers.length > 0) {
              newHostId = updatedPlayers[0].id; 
              newPlayersArray = updatedPlayers.map((p, idx) => 
                idx === 0 ? { ...p, isHost: true } : { ...p, isHost: false } // Ensure only one host
              );
              logMsg = `${playerToRemove.name} (Host) left. ${updatedPlayers[0].name} is the new host.`;
            }
            transaction.update(gameDocRef, { 
              players: newPlayersArray, 
              hostId: newHostId, 
              gameLog: arrayUnion(logMsg) 
            });
          }
        }
      });
      setGameState(null); // Clear local state immediately
      // Navigation will be handled by the page component based on GameState being null
    } catch (error) {
      console.error("Error leaving game:", error);
      const firebaseError = error as { code?: string; message: string };
      toast({ title: "Error Leaving Game", description: `Could not leave game: ${firebaseError.message}`, variant: "destructive" });
    }
  };

  const callMeeting = async () => {
    if (!gameState || !localPlayerId || !isInitialized) {
      toast({ title: "Error", description: "Cannot call meeting: game or player not ready.", variant: "destructive" });
      return;
    }
    const player = gameState.players.find(p => p.id === localPlayerId);
    
    if (!player) {
      toast({ title: "Error", description: "Player not found in current game state.", variant: "destructive" });
      return;
    }
    if (player.hasCalledMeeting) {
      toast({ title: "Meeting Already Called", description: "You've already called an emergency meeting this game.", variant: "default" });
      return;
    }
    if (gameState.meetingsCalled >= gameState.maxMeetings) {
      toast({ title: "Meeting Limit Reached", description: "No more emergency meetings can be called this game.", variant: "default" });
      return;
    }
    if (gameState.status !== 'playing') { // Meetings can only be called during 'playing'
      toast({ title: "Invalid Time for Meeting", description: "Meetings can only be called during active gameplay.", variant: "default" });
      return;
    }

    const gameDocRef = doc(db, "games", gameState.gameId);
    const updatedPlayers = gameState.players.map(p => p.id === localPlayerId ? {...p, hasCalledMeeting: true} : p);
    try {
      await updateDoc(gameDocRef, {
        status: 'meeting', // Change status to meeting
        meetingsCalled: increment(1),
        players: updatedPlayers,
        gameLog: arrayUnion(`${player.name} called an emergency meeting! Imposters, this is your chance to accuse the Helper.`)
      });
    } catch (error) {
      console.error("Error calling meeting:", error);
      const firebaseError = error as { code?: string; message: string };
      toast({ title: "Meeting Error", description: `Could not call meeting: ${firebaseError.message}`, variant: "destructive" });
    }
  };
  
  const updatePlayerInContext = async (playerData: Partial<Player> & { id: string }) => {
    if (!gameState || !isInitialized || !gameState.players.find(p => p.id === playerData.id)) {
      toast({title: "Update Error", description: "Cannot update player: Game or player not found, or context not ready.", variant: "destructive"});
      return;
    }
    const gameDocRef = doc(db, "games", gameState.gameId);
    const updatedPlayers = gameState.players.map(p => p.id === playerData.id ? { ...p, ...playerData } : p);
    try {
      await updateDoc(gameDocRef, { players: updatedPlayers });
    } catch (error) {
      console.error("Error updating player data in Firestore:", error);
      const firebaseError = error as { code?: string; message: string };
      toast({ title: "Player Update Error", description: `Could not update player data: ${firebaseError.message}`, variant: "destructive" });
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
    dispatch,
    sendChatMessage,
    accuseHelper,
    leaveGame,
    callMeeting,
    updatePlayerInContext,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [gameState, localPlayerId, isLoading, isInitialized, toast]); // useCallback for functions if they cause re-renders

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

