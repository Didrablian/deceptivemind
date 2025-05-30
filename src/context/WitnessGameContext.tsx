"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  WitnessGameState, 
  WitnessPlayer, 
  WitnessGameAction,
  PlayerRole,
  GamePhase,
  GameStage,
  LOCATION_WORDS,
  WEAPON_WORDS,
  getRandomWords,
  assignRoles,
  checkWinCondition
} from '@/lib/witnessTypes';
import { generateDetectiveClues } from '@/lib/witnessAI';
import { db } from '@/lib/firebase';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  setDoc, 
  arrayUnion, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface WitnessGameContextType {
  gameState: WitnessGameState | null;
  localPlayerId: string | null;
  localPlayer: WitnessPlayer | null;
  isHost: boolean;
  
  // Game actions
  createGame: (hostName: string) => Promise<string | null>;
  joinGame: (gameId: string, playerName: string) => Promise<boolean>;
  startGame: () => Promise<void>;
  selectWord: (word: string) => Promise<void>;
  selectSuspect: (playerId: string) => Promise<void>;
  voteWitness: (playerId: string) => Promise<void>;
  nextPhase: () => Promise<void>;
  restartGame: () => Promise<void>;
  
  // Utility
  isLoading: boolean;
  timeRemaining: number;
}

const WitnessGameContext = createContext<WitnessGameContextType | undefined>(undefined);

export function useWitnessGame() {
  const context = useContext(WitnessGameContext);
  if (context === undefined) {
    throw new Error('useWitnessGame must be used within a WitnessGameProvider');
  }
  return context;
}

export function WitnessGameProvider({ children }: { children: React.ReactNode }) {
  const [gameState, setGameState] = useState<WitnessGameState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const { toast } = useToast();

  // Initialize local player ID
  useEffect(() => {
    let playerId = localStorage.getItem('witness_player_id');
    if (!playerId) {
      playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('witness_player_id', playerId);
    }
    setLocalPlayerId(playerId);
  }, []);

  // Timer for phase countdown
  useEffect(() => {
    if (!gameState || !gameState.phaseEndTime || gameState.phase === 'reveal' || gameState.phase === 'finished') return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, gameState.phaseEndTime - Date.now());
      setTimeRemaining(Math.ceil(remaining / 1000));
      
      if (remaining <= 0) {
        clearInterval(interval);
        if (gameState.phase !== 'finished' && gameState.phase !== 'waiting' && gameState.phase !== 'reveal') {
          nextPhase();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.phaseEndTime, gameState?.phase]);

  const localPlayer = gameState?.players.find(p => p.id === localPlayerId) || null;
  const isHost = localPlayer?.id === gameState?.players[0]?.id;

  const generateGameId = (): string => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const getPhaseEndTime = (phase: GamePhase, settings: WitnessGameState['settings']): number => {
    const now = Date.now();
    switch (phase) {
      case 'location-prep': return now + settings.locationPrepTime * 1000;
      case 'location-discussion': return now + settings.locationDiscussionTime * 1000;
      case 'weapon-prep': return now + settings.weaponPrepTime * 1000;
      case 'weapon-discussion': return now + settings.weaponDiscussionTime * 1000;
      case 'suspect-discussion': return now + settings.suspectDiscussionTime * 1000;
      default: return now + 10000; // 10 seconds default
    }
  };

  const createGame = useCallback(async (hostName: string): Promise<string | null> => {
    if (!localPlayerId) return null;
    setIsLoading(true);

    try {
      const gameId = generateGameId();
      const locationWords = getRandomWords(LOCATION_WORDS, 26);
      const weaponWords = getRandomWords(WEAPON_WORDS, 26);
      const correctLocation = locationWords[Math.floor(Math.random() * locationWords.length)];
      const correctWeapon = weaponWords[Math.floor(Math.random() * weaponWords.length)];
      
      const initialGameState: WitnessGameState = {
        id: gameId,
        players: [{
          id: localPlayerId,
          name: hostName,
          isAlive: true,
          isReady: false,
          lastSeen: Date.now()
        }],
        phase: 'waiting',
        stage: 'location',
        locationWords,
        weaponWords,
        correctLocation,
        correctWeapon,
        suspectVotes: {},
        phaseStartTime: Date.now(),
        phaseEndTime: 0,
        settings: {
          locationPrepTime: 30,
          locationDiscussionTime: 90,
          weaponPrepTime: 30,
          weaponDiscussionTime: 90,
          suspectDiscussionTime: 90
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await setDoc(doc(db, 'witnessGames', gameId), initialGameState);
      return gameId;
    } catch (error) {
      console.error('Error creating game:', error);
      toast({ title: "Error", description: "Failed to create game.", variant: "destructive" });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [localPlayerId, toast]);

  const joinGame = useCallback(async (gameId: string, playerName: string): Promise<boolean> => {
    if (!localPlayerId) return false;
    setIsLoading(true);

    try {
      const gameRef = doc(db, 'witnessGames', gameId);
      await updateDoc(gameRef, {
        players: arrayUnion({
          id: localPlayerId,
          name: playerName,
          isAlive: true,
          isReady: false,
          lastSeen: Date.now()
        }),
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error joining game:', error);
      toast({ title: "Error", description: "Failed to join game. Check the Game ID.", variant: "destructive" });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [localPlayerId, toast]);

  const startGame = useCallback(async (): Promise<void> => {
    if (!gameState || !isHost || gameState.players.length < 4) return;

    try {
      setIsLoading(true);
      toast({ title: "Generating clues...", description: "Creating detective clues with AI..." });

      // First assign roles
      const roles = assignRoles(gameState.players.length);
      const playersWithRoles = gameState.players.map((player, index) => ({
        ...player,
        role: roles[index]
      }));

      const locationWords = getRandomWords(LOCATION_WORDS, 26);
      const weaponWords = getRandomWords(WEAPON_WORDS, 26);
      const correctLocation = locationWords[Math.floor(Math.random() * locationWords.length)];
      const correctWeapon = weaponWords[Math.floor(Math.random() * weaponWords.length)];
      
      // Generate AI clues for detectives
      const detectives = playersWithRoles.filter(p => p.role === 'detective');
      const detectiveClues = await generateDetectiveClues(
        locationWords,
        weaponWords, 
        correctLocation,
        correctWeapon,
        detectives.length
      );
      
      // Assign clues to detective players
      const updatedPlayers = playersWithRoles.map(player => {
        if (player.role === 'detective') {
          const detectiveIndex = detectives.findIndex(d => d.id === player.id);
          const clue = detectiveClues[detectiveIndex];
          return {
            ...player,
            locationClue: clue?.locationClue,
            weaponClue: clue?.weaponClue
          };
        }
        return player;
      });

      const updates = {
        phase: 'location-prep' as GamePhase,
        stage: 'location' as GameStage,
        locationWords,
        weaponWords,
        correctLocation,
        correctWeapon,
        players: updatedPlayers,
        phaseStartTime: Date.now(),
        phaseEndTime: Date.now() + gameState.settings.locationPrepTime * 1000,
        selectedLocation: null,
        selectedWeapon: null,
        selectedSuspect: null,
        suspectVotes: {},
        teamWon: null,
        gameEndTime: null,
        updatedAt: Date.now()
      };

      // Remove undefined values
      const filteredUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== undefined)
      );

      await updateDoc(doc(db, 'witnessGames', gameState.id), filteredUpdates);
      toast({ title: "Game Started!", description: "Roles have been assigned. Get ready!" });
    } catch (error) {
      console.error('Error starting game:', error);
      toast({ title: "Error", description: "Failed to start game.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [gameState, isHost, toast]);

  const selectWord = useCallback(async (word: string): Promise<void> => {
    if (!gameState || !localPlayer || localPlayer.role !== 'judge') return;

    try {
      const updateData: any = { updatedAt: serverTimestamp() };
      
      // Handle location selection during any location phase
      if (gameState.phase === 'location-prep' || gameState.phase === 'location-discussion' || gameState.phase === 'location-voting') {
        updateData.selectedLocation = word;
        
        // Check if location is correct
        if (word !== gameState.correctLocation) {
          // Wrong location - suspects win immediately
          updateData.phase = 'reveal';
          updateData.teamWon = false;
          updateData.gameEndTime = serverTimestamp();
        } else {
          // Correct location - continue to weapon phase
          updateData.phase = 'weapon-prep';
          updateData.stage = 'weapon';
          updateData.phaseStartTime = serverTimestamp();
          const endTime = getPhaseEndTime('weapon-prep', gameState.settings);
          if (endTime && endTime > 0) {
            updateData.phaseEndTime = endTime;
          }
        }
      } 
      // Handle weapon selection during any weapon phase
      else if (gameState.phase === 'weapon-prep' || gameState.phase === 'weapon-discussion' || gameState.phase === 'weapon-voting') {
        updateData.selectedWeapon = word;
        
        // Check if weapon is correct
        if (word !== gameState.correctWeapon) {
          // Wrong weapon - suspects win immediately
          updateData.phase = 'reveal';
          updateData.teamWon = false;
          updateData.gameEndTime = serverTimestamp();
        } else {
          // Correct weapon - continue to suspect phase
          updateData.phase = 'suspect-discussion';
          updateData.stage = 'suspect';
          updateData.phaseStartTime = serverTimestamp();
          const endTime = getPhaseEndTime('suspect-discussion', gameState.settings);
          if (endTime && endTime > 0) {
            updateData.phaseEndTime = endTime;
          }
        }
      }

      // Remove any undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      await updateDoc(doc(db, 'witnessGames', gameState.id), updateData);
    } catch (error) {
      console.error('Error selecting word:', error);
      toast({ title: "Error", description: "Failed to select word.", variant: "destructive" });
    }
  }, [gameState, localPlayer, toast]);

  const selectSuspect = useCallback(async (playerId: string): Promise<void> => {
    if (!gameState || !localPlayer || localPlayer.role !== 'judge') return;

    try {
      const selectedPlayer = gameState.players.find(p => p.id === playerId);
      const updateData: any = {
        selectedSuspect: playerId,
        phase: 'reveal',
        gameEndTime: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      // Check if selected player is actually a suspect
      if (selectedPlayer?.role !== 'suspect') {
        // Wrong suspect - suspects win
        updateData.teamWon = false;
      } else {
        // Correct suspect selected - team wins
        updateData.teamWon = true;
      }

      // Remove any undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      await updateDoc(doc(db, 'witnessGames', gameState.id), updateData);
    } catch (error) {
      console.error('Error selecting suspect:', error);
      toast({ title: "Error", description: "Failed to select suspect.", variant: "destructive" });
    }
  }, [gameState, localPlayer, toast]);

  const voteWitness = useCallback(async (witnessPlayerId: string): Promise<void> => {
    if (!gameState || !localPlayer || localPlayer.role !== 'suspect') return;

    try {
      const updateData: any = {
        [`suspectVotes.${localPlayer.id}`]: witnessPlayerId,
        updatedAt: serverTimestamp()
      };

      // Remove any undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      await updateDoc(doc(db, 'witnessGames', gameState.id), updateData);
    } catch (error) {
      console.error('Error voting for witness:', error);
      toast({ title: "Error", description: "Failed to vote.", variant: "destructive" });
    }
  }, [gameState, localPlayer, toast]);

  const restartGame = useCallback(async (): Promise<void> => {
    if (!gameState || !isHost) return;

    try {
      const locationWords = getRandomWords(LOCATION_WORDS, 9);
      const weaponWords = getRandomWords(WEAPON_WORDS, 9);
      
      // Reset game state but keep players - set role to null instead of undefined
      const resetPlayers = gameState.players.map(player => ({
        ...player,
        role: null,
        isReady: false
      }));

      const updateData: any = {
        players: resetPlayers,
        phase: 'waiting',
        stage: 'location',
        locationWords,
        weaponWords,
        correctLocation: locationWords[Math.floor(Math.random() * locationWords.length)],
        correctWeapon: weaponWords[Math.floor(Math.random() * weaponWords.length)],
        selectedLocation: null,
        selectedWeapon: null,
        selectedSuspect: null,
        suspectVotes: {},
        teamWon: null,
        gameEndTime: null,
        phaseStartTime: Date.now(),
        phaseEndTime: 0,
        updatedAt: serverTimestamp()
      };

      // Remove any undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      await updateDoc(doc(db, 'witnessGames', gameState.id), updateData);

      toast({ title: "Game Restarted!", description: "Starting a new round with the same players." });
    } catch (error) {
      console.error('Error restarting game:', error);
      toast({ title: "Error", description: "Failed to restart game.", variant: "destructive" });
    }
  }, [gameState, isHost, toast]);

  const nextPhase = useCallback(async (): Promise<void> => {
    if (!gameState) return;

    try {
      let nextPhase: GamePhase = gameState.phase;
      let updateData: any = { updatedAt: serverTimestamp() };

      switch (gameState.phase) {
        case 'location-prep':
          // Skip to weapon prep if location already selected
          if (gameState.selectedLocation) {
            if (gameState.selectedLocation !== gameState.correctLocation) {
              nextPhase = 'reveal';
              updateData.teamWon = false;
              updateData.gameEndTime = serverTimestamp();
            } else {
              nextPhase = 'weapon-prep';
              updateData.stage = 'weapon';
            }
          } else {
            nextPhase = 'location-discussion';
          }
          break;
        case 'location-discussion':
          // Skip to weapon prep if location already selected
          if (gameState.selectedLocation) {
            if (gameState.selectedLocation !== gameState.correctLocation) {
              nextPhase = 'reveal';
              updateData.teamWon = false;
              updateData.gameEndTime = serverTimestamp();
            } else {
              nextPhase = 'weapon-prep';
              updateData.stage = 'weapon';
            }
          } else {
            nextPhase = 'location-voting';
          }
          break;
        case 'location-voting':
          // Auto-select random location if not selected
          if (!gameState.selectedLocation) {
            const randomLocation = gameState.locationWords[Math.floor(Math.random() * gameState.locationWords.length)];
            updateData.selectedLocation = randomLocation;
            
            // Check if random selection is correct
            if (randomLocation !== gameState.correctLocation) {
              updateData.phase = 'reveal';
              updateData.teamWon = false;
              updateData.gameEndTime = serverTimestamp();
              break;
            }
          }
          nextPhase = 'weapon-prep';
          updateData.stage = 'weapon';
          break;
        case 'weapon-prep':
          // Skip to suspect discussion if weapon already selected
          if (gameState.selectedWeapon) {
            if (gameState.selectedWeapon !== gameState.correctWeapon) {
              nextPhase = 'reveal';
              updateData.teamWon = false;
              updateData.gameEndTime = serverTimestamp();
            } else {
              nextPhase = 'suspect-discussion';
              updateData.stage = 'suspect';
            }
          } else {
            nextPhase = 'weapon-discussion';
          }
          break;
        case 'weapon-discussion':
          // Skip to suspect discussion if weapon already selected
          if (gameState.selectedWeapon) {
            if (gameState.selectedWeapon !== gameState.correctWeapon) {
              nextPhase = 'reveal';
              updateData.teamWon = false;
              updateData.gameEndTime = serverTimestamp();
            } else {
              nextPhase = 'suspect-discussion';
              updateData.stage = 'suspect';
            }
          } else {
            nextPhase = 'weapon-voting';
          }
          break;
        case 'weapon-voting':
          // Auto-select random weapon if not selected
          if (!gameState.selectedWeapon) {
            const randomWeapon = gameState.weaponWords[Math.floor(Math.random() * gameState.weaponWords.length)];
            updateData.selectedWeapon = randomWeapon;
            
            // Check if random selection is correct
            if (randomWeapon !== gameState.correctWeapon) {
              updateData.phase = 'reveal';
              updateData.teamWon = false;
              updateData.gameEndTime = serverTimestamp();
              break;
            }
          }
          nextPhase = 'suspect-discussion';
          updateData.stage = 'suspect';
          break;
        case 'suspect-discussion':
          // Move to suspect voting if suspect not already selected
          if (!gameState.selectedSuspect) {
            nextPhase = 'suspect-voting';
          } else {
            // Skip to checking win condition if suspect already selected
            const result = checkWinCondition(gameState);
            nextPhase = 'reveal';
            updateData.teamWon = result.teamWon;
            updateData.gameEndTime = serverTimestamp();
          }
          break;
        case 'suspect-voting':
          // Auto-select random suspect if not selected
          if (!gameState.selectedSuspect) {
            const nonJudgePlayers = gameState.players.filter(p => p.role !== 'judge');
            const randomSuspect = nonJudgePlayers[Math.floor(Math.random() * nonJudgePlayers.length)];
            updateData.selectedSuspect = randomSuspect.id;
            
            // Check if random selection is correct
            if (randomSuspect.role !== 'suspect') {
              updateData.phase = 'reveal';
              updateData.teamWon = false;
              updateData.gameEndTime = serverTimestamp();
              break;
            }
          }
          // Check win condition and end game
          const result = checkWinCondition(gameState);
          nextPhase = 'reveal';
          updateData.teamWon = result.teamWon;
          updateData.gameEndTime = serverTimestamp();
          break;
        case 'reveal':
          nextPhase = 'finished';
          break;
      }

      if (nextPhase !== gameState.phase) {
        updateData.phase = nextPhase;
        updateData.phaseStartTime = serverTimestamp();
        const endTime = getPhaseEndTime(nextPhase, gameState.settings);
        if (endTime && endTime > 0) {
          updateData.phaseEndTime = endTime;
        }
      }

      // Remove any undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      await updateDoc(doc(db, 'witnessGames', gameState.id), updateData);
    } catch (error) {
      console.error('Error advancing phase:', error);
    }
  }, [gameState]);

  // Subscribe to game updates
  useEffect(() => {
    const gameId = window.location.pathname.split('/').pop();
    if (!gameId) return;

    const unsubscribe = onSnapshot(
      doc(db, 'witnessGames', gameId),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          // Convert Firestore timestamps to numbers
          const gameState: WitnessGameState = {
            ...data,
            phaseStartTime: data.phaseStartTime?.toMillis?.() || data.phaseStartTime || Date.now(),
            phaseEndTime: data.phaseEndTime?.toMillis?.() || data.phaseEndTime || Date.now(),
            createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
            updatedAt: data.updatedAt?.toMillis?.() || data.updatedAt || Date.now(),
            gameEndTime: data.gameEndTime?.toMillis?.() || data.gameEndTime
          } as WitnessGameState;
          setGameState(gameState);
        }
      },
      (error) => {
        console.error('Error listening to game updates:', error);
      }
    );

    return unsubscribe;
  }, []);

  const value: WitnessGameContextType = {
    gameState,
    localPlayerId,
    localPlayer,
    isHost,
    createGame,
    joinGame,
    startGame,
    selectWord,
    selectSuspect,
    voteWitness,
    nextPhase,
    restartGame,
    isLoading,
    timeRemaining
  };

  return (
    <WitnessGameContext.Provider value={value}>
      {children}
    </WitnessGameContext.Provider>
  );
} 