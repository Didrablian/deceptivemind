
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useReducer, useEffect, useState, useMemo } from 'react';
import type { GameState, Action, Player } from '@/lib/types';
import { initialGameState, generateShortId } from '@/lib/gameUtils'; // Ensure generateShortId is exported or defined here
// useRouter import was present but not used directly in the provided snippet, can be removed if not needed elsewhere in this file.
// import { useRouter } from 'next/navigation';

interface GameContextProps {
  gameState: GameState | null; // Can be null until initialized
  dispatch: React.Dispatch<Action>;
  localPlayerId: string | null;
  setLocalPlayerId: (id: string | null) => void;
}

const GameContext = createContext<GameContextProps | undefined>(undefined);

const gameReducer = (state: GameState | null, action: Action): GameState | null => {
  switch (action.type) {
    case 'SET_GAME_STATE':
      return action.payload; // Payload is the new, complete GameState or null
    default:
      // If state is null and action is not SET_GAME_STATE, this is likely an error or premature dispatch
      if (!state) {
        console.warn(`Action ${action.type} dispatched while game state is null.`);
        return null;
      }
      // Proceed with other actions, assuming state is a valid GameState object
      switch (action.type) {
        case 'ADD_PLAYER':
          if (state.players.find(p => p.id === action.payload.id)) return state;
          return { ...state, players: [...state.players, action.payload] };
        case 'REMOVE_PLAYER':
          return { ...state, players: state.players.filter(p => p.id !== action.payload) };
        case 'UPDATE_PLAYER':
          return {
            ...state,
            players: state.players.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p),
          };
        case 'START_GAME':
          return {
            ...state,
            status: 'role-reveal',
            words: action.payload.words,
            targetWord: action.payload.targetWord,
            players: action.payload.playersWithRoles,
            gameLog: [...state.gameLog, "Game started! Roles assigned."]
          };
        case 'SET_STATUS':
          return { ...state, status: action.payload, gameLog: [...state.gameLog, `Game status changed to ${action.payload}`] };
        case 'ADD_CHAT_MESSAGE':
          return { ...state, chatMessages: [...state.chatMessages, action.payload] };
        case 'ACCUSE_HELPER': {
          const { accuserId, accusedPlayerId } = action.payload;
          const accuser = state.players.find(p => p.id === accuserId);
          const accusedPlayer = state.players.find(p => p.id === accusedPlayerId);
          if (!accuser || !accusedPlayer || accuser.role !== 'Imposter') return state;

          let winner: GameState['winner'] = undefined;
          let logMessage = `${accuser.name} (Imposter) accused ${accusedPlayer.name} of being the Helper.`;
          if (accusedPlayer.role === 'Helper') {
            winner = 'Imposters';
            logMessage += " Correct! Imposters win!";
          } else {
            winner = 'GoodTeam';
            logMessage += " Incorrect! Imposters lose.";
          }
          return {
            ...state,
            status: 'finished',
            winner,
            gameLog: [...state.gameLog, logMessage],
            accusationsMadeByImposters: state.accusationsMadeByImposters + 1,
          };
        }
        case 'END_GAME':
          return {
            ...state,
            status: 'finished',
            winner: action.payload.winner,
            gameLog: [...state.gameLog, `Game Over. ${action.payload.reason}`],
          };
        default:
          return state;
      }
  }
};

export const GameProvider = ({ children, gameIdFromParams }: { children: ReactNode, gameIdFromParams?: string }) => {
  const [localPlayerId, setLocalPlayerIdState] = useState<string | null>(null);
  const [gameState, dispatch] = useReducer(gameReducer, null); // Initialize gameState to null
  const [isInitialized, setIsInitialized] = useState(false);

  // Effect 1: Initialize localPlayerId from localStorage (client-side only)
  useEffect(() => {
    const storedPlayerId = localStorage.getItem('dm_localPlayerId');
    if (storedPlayerId) {
      setLocalPlayerIdState(storedPlayerId);
    } else {
      const newPlayerId = generateShortId(8);
      localStorage.setItem('dm_localPlayerId', newPlayerId);
      setLocalPlayerIdState(newPlayerId);
    }
  }, []);

  // Effect 2: Initialize gameState from localStorage or create new (client-side only, after localPlayerId is known)
  useEffect(() => {
    if (localPlayerId === null) { // Wait for localPlayerId to be resolved
      return;
    }

    let effectiveGameId = gameIdFromParams;
    let loadedState: GameState | null = null;

    if (effectiveGameId) {
      const storedGame = localStorage.getItem(`dm_gameState_${effectiveGameId}`);
      if (storedGame) {
        try {
          const parsedGame = JSON.parse(storedGame) as GameState;
          if (parsedGame.gameId === effectiveGameId) {
            loadedState = parsedGame;
          }
        } catch (error) {
          console.error("Failed to parse stored game state:", error);
          localStorage.removeItem(`dm_gameState_${effectiveGameId}`); // Clear corrupted data
        }
      }
    }

    if (loadedState) {
      dispatch({ type: 'SET_GAME_STATE', payload: loadedState });
    } else {
      const newGameId = effectiveGameId || generateShortId(6);
      // Ensure localStorage access for username is guarded (though this effect is client-side)
      const hostName = typeof window !== 'undefined' ? (localStorage.getItem('dm_username') || "Player") : "Player";
      
      const newGameState = initialGameState(newGameId, {
        id: localPlayerId, // localPlayerId is guaranteed non-null here
        name: hostName,
        role: "Communicator",
        isHost: true, // New game instance, this player becomes host
        isAlive: true
      });
      dispatch({ type: 'SET_GAME_STATE', payload: newGameState });
    }
    setIsInitialized(true);
  }, [localPlayerId, gameIdFromParams]);

  const setLocalPlayerIdInternal = (id: string | null) => {
    // This function is called by components, implying client-side context for localStorage.
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('dm_localPlayerId', id);
      } else {
        localStorage.removeItem('dm_localPlayerId');
      }
    }
    setLocalPlayerIdState(id);
  };

  // Effect 3: Save gameState to localStorage when it changes (client-side only, after initialization)
  useEffect(() => {
    if (isInitialized && gameState && gameState.gameId && typeof window !== 'undefined') {
      localStorage.setItem(`dm_gameState_${gameState.gameId}`, JSON.stringify(gameState));
    }
  }, [gameState, isInitialized]);

  // Effect 4: Listen for storage changes from other tabs (client-side only, after initialization)
  useEffect(() => {
    if (!isInitialized || !gameIdFromParams || typeof window === 'undefined') return;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === `dm_gameState_${gameIdFromParams}` && event.newValue) {
        try {
          const newGameStateFromStorage = JSON.parse(event.newValue) as GameState;
          // Avoid dispatching if the state is identical to prevent potential loops
          if (JSON.stringify(newGameStateFromStorage) !== JSON.stringify(gameState)) {
             dispatch({ type: 'SET_GAME_STATE', payload: newGameStateFromStorage });
          }
        } catch (error) {
          console.error("Error parsing game state from storage event:", error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [gameState, gameIdFromParams, dispatch, isInitialized]);


  const contextValue = useMemo(() => ({
    gameState: isInitialized ? gameState : null,
    dispatch,
    localPlayerId,
    setLocalPlayerId: setLocalPlayerIdInternal
  }), [gameState, localPlayerId, isInitialized]);

  // Optional: Render children only after initialization, or show a loader.
  // For simplicity, we allow children to render; they must handle `gameState === null`.
  // if (!isInitialized && gameIdFromParams) {
  //   return <div className="flex flex-col items-center justify-center flex-grow"><p>Loading Game Context...</p></div>;
  // }

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
