"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { GameState, Action, Player } from '@/lib/types';
import { initialGameState } from '@/lib/gameUtils';
import { useRouter } from 'next/navigation';

interface GameContextProps {
  gameState: GameState | null;
  dispatch: React.Dispatch<Action>;
  localPlayerId: string | null;
  setLocalPlayerId: (id: string | null) => void;
}

const GameContext = createContext<GameContextProps | undefined>(undefined);

// A simple reducer. In a real app, this would interact with a backend.
const gameReducer = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'SET_GAME_STATE':
      return action.payload;
    case 'ADD_PLAYER':
      if (state.players.find(p => p.id === action.payload.id)) return state; // Avoid duplicates
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
        players: action.payload.playersWithRoles, // Ensure players have roles and clues assigned
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
        winner = 'GoodTeam'; // Imposters lose if they accuse incorrectly
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
};

export const GameProvider = ({ children, gameIdFromParams }: { children: ReactNode, gameIdFromParams?: string }) => {
  const [localPlayerId, setLocalPlayerIdState] = React.useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dm_localPlayerId');
    }
    return null;
  });
  
  const router = useRouter();

  const [gameState, dispatch] = useReducer(gameReducer, null, () => {
     // This initializer runs only once
    if (typeof window !== 'undefined' && gameIdFromParams) {
      const storedGame = localStorage.getItem(`dm_gameState_${gameIdFromParams}`);
      if (storedGame) {
        try {
          const parsedGame = JSON.parse(storedGame) as GameState;
          if (parsedGame.gameId === gameIdFromParams) { // Ensure it's for the current game
            return parsedGame;
          }
        } catch (error) {
          console.error("Failed to parse stored game state:", error);
        }
      }
    }
    // Default if no stored game or if it's for a different gameId
    // This part might be tricky if user directly lands on /game/[id] without creating/joining
    // For now, let's return a minimal state or rely on an effect to initialize or redirect.
    return initialGameState(gameIdFromParams || "default_game_id_placeholder", {id: localPlayerId || "default_player_id", name: "Host", role: "Communicator", isHost: true, isAlive: true});
  });
  
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

  useEffect(() => {
    // Persist game state to localStorage for demo purposes
    // In a real app, this would sync with Firebase/backend
    if (typeof window !== 'undefined' && gameState && gameState.gameId) {
      localStorage.setItem(`dm_gameState_${gameState.gameId}`, JSON.stringify(gameState));
    }
  }, [gameState]);

  // Effect to initialize or redirect if gameIdFromParams is present but no valid state.
  useEffect(() => {
    if (gameIdFromParams && (!gameState || gameState.gameId !== gameIdFromParams)) {
        // Attempt to load from local storage again or initialize.
        const storedGame = localStorage.getItem(`dm_gameState_${gameIdFromParams}`);
        if (storedGame) {
            try {
                const parsedGame = JSON.parse(storedGame) as GameState;
                if (parsedGame.gameId === gameIdFromParams) {
                    dispatch({ type: 'SET_GAME_STATE', payload: parsedGame });
                    return;
                }
            } catch (e) { /* ignore */ }
        }
        // If no valid stored game for this gameId, and not in lobby, maybe redirect
        if (gameState?.status !== 'lobby') {
           // For now, this is a placeholder. A real app would need robust state loading.
           console.warn(`No valid game state for ${gameIdFromParams}, current state is for ${gameState?.gameId}`);
           // router.push('/'); // Or handle appropriately
        }
    }
  }, [gameIdFromParams, gameState, router]);


  return (
    <GameContext.Provider value={{ gameState, dispatch, localPlayerId, setLocalPlayerId }}>
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
