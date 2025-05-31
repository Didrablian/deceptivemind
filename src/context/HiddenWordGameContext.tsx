"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, runTransaction, Timestamp, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { 
  HiddenWordGameState, 
  HiddenWordPlayer, 
  PlayerRole,
  Accusation,
  AccusationQuestion,
  VoteResult,
  ChatMessage as HWChatMessage, 
  HiddenWordGameSettings
} from '@/lib/hiddenWordTypes';
import { 
  defaultHiddenWordGameSettings, 
  secretWords,
  assignRoles,
  checkWinConditions
} from '@/lib/hiddenWordTypes';
import { generateShortId } from '@/lib/gameUtils';
import { useToast } from '@/hooks/use-toast';

interface HiddenWordGameContextProps {
  gameState: HiddenWordGameState | null;
  localPlayerId: string | null;
  setLocalPlayerId: (id: string | null) => void;
  isLoading: boolean;
  isInitialized: boolean;
  createGame: (username: string, settings?: Partial<HiddenWordGameSettings>) => Promise<string | null>;
  joinGame: (gameIdToJoin: string, username: string) => Promise<boolean>;
  startGame: () => Promise<void>;
  makeAccusation: (accusedId: string) => Promise<void>;
  answerQuestion: (answer: boolean) => Promise<void>;
  askQuestion: (question: string) => Promise<void>;
  submitVote: (votedForId: string) => Promise<void>;
  killPlayer: (playerId: string) => Promise<void>;
  sendChatMessage: (text: string) => Promise<void>;
  leaveGame: () => Promise<void>;
  startNextPhase: () => Promise<void>;
  updateGameSettings: (settings: Partial<HiddenWordGameSettings>) => Promise<void>;
}

const HiddenWordGameContext = createContext<HiddenWordGameContextProps | undefined>(undefined);

export const HiddenWordGameProvider = ({ 
  children, 
  gameIdFromParams 
}: { 
  children: ReactNode; 
  gameIdFromParams?: string;
}) => {
  const [gameState, setGameState] = useState<HiddenWordGameState | null>(null);
  const [localPlayerId, setLocalPlayerIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedPlayerId = localStorage.getItem('hw_localPlayerId');
      if (storedPlayerId) {
        setLocalPlayerIdState(storedPlayerId);
      } else {
        const newPlayerId = generateShortId(10);
        localStorage.setItem('hw_localPlayerId', newPlayerId);
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
    const gameDocRef = doc(db, "hidden-word-games", gameIdFromParams);
    const unsubscribe = onSnapshot(gameDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as HiddenWordGameState;
        const processedData: HiddenWordGameState = {
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
            return { ...msg, timestamp: processedTimestamp };
          }).sort((a, b) => a.timestamp - b.timestamp) : [],
          players: data.players ? data.players.map(p => ({
            ...p,
            isHost: p.isHost === undefined ? (p.id === data.hostId) : p.isHost,
            isReady: p.isReady || false,
            isAlive: p.isAlive !== undefined ? p.isAlive : true,
          })) : [],
          votes: data.votes || [],
          gameLog: data.gameLog || [],
          currentRound: data.currentRound || 1,
          phaseStartTime: data.phaseStartTime || undefined,
          timeRemaining: data.timeRemaining || data.discussionDuration,
          executedPlayers: data.executedPlayers || [],
          killedPlayers: data.killedPlayers || [],
          roundHistory: data.roundHistory || [],
          pendingAccusations: data.pendingAccusations || [],
          minPlayers: data.minPlayers,
          maxPlayers: data.maxPlayers,
          discussionDuration: data.discussionDuration,
          interrogationDuration: data.interrogationDuration,
          votingDuration: data.votingDuration,
        };
        setGameState(processedData);
      } else {
        setGameState(null);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error listening to Hidden Word game state:", error);
      toast({ title: "Connection Error", description: "Could not connect to game session.", variant: "destructive" });
      setIsLoading(false);
      setGameState(null);
    });

    return () => unsubscribe();
  }, [isInitialized, gameIdFromParams, toast]);

  const setLocalPlayerId = (id: string | null) => {
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('hw_localPlayerId', id);
      } else {
        localStorage.removeItem('hw_localPlayerId');
      }
    }
    setLocalPlayerIdState(id);
  };

  const selectRandomWord = (): string => {
    return secretWords[Math.floor(Math.random() * secretWords.length)];
  };

  const createInitialGameState = (gameId: string, hostPlayer: HiddenWordPlayer, settings: HiddenWordGameSettings): HiddenWordGameState => {
    return {
      gameId,
      gameType: "hidden-word",
      players: [hostPlayer],
      status: "lobby",
      hostId: hostPlayer.id,
      currentRound: 0,
      maxRounds: settings.maxRounds,
      secretWord: "",
      discussionDuration: settings.discussionDuration,
      interrogationDuration: settings.interrogationDuration,
      votingDuration: settings.votingDuration,
      votes: [],
      pendingAccusations: [],
      executedPlayers: [],
      killedPlayers: [],
      roundHistory: [],
      minPlayers: settings.minPlayers,
      maxPlayers: settings.maxPlayers,
      chatMessages: [],
      gameLog: [`Game created by ${hostPlayer.name}`],
    };
  };

  const createGame = async (username: string, settings?: Partial<HiddenWordGameSettings>): Promise<string | null> => {
    if (!isInitialized || !localPlayerId) {
      toast({ title: "Context not ready", description: "Player ID not available. Please refresh.", variant: "destructive" });
      return null;
    }

    const newGameId = generateShortId(6).toUpperCase();
    const hostPlayer: HiddenWordPlayer = {
      id: localPlayerId,
      name: username,
      isHost: true,
      isAlive: true,
      isReady: false,
    };

    const gameSettings = { ...defaultHiddenWordGameSettings, ...settings };
    const newGame = createInitialGameState(newGameId, hostPlayer, gameSettings);

    try {
      const gameDocRef = doc(db, "hidden-word-games", newGameId);
      await setDoc(gameDocRef, newGame);
      return newGameId;
    } catch (error) {
      console.error("Error creating Hidden Word game:", error);
      toast({ title: "Error Creating Game", description: (error as Error).message, variant: "destructive" });
      return null;
    }
  };

  const joinGame = async (gameIdToJoin: string, username: string): Promise<boolean> => {
    if (!isInitialized || !localPlayerId) {
      toast({ title: "Context not ready", description: "Player ID not available. Please refresh.", variant: "destructive" });
      return false;
    }

    const gameDocRef = doc(db, "hidden-word-games", gameIdToJoin);
    try {
      return await runTransaction(db, async (transaction) => {
        const gameSnap = await transaction.get(gameDocRef);
        if (!gameSnap.exists()) {
          toast({ title: "Game Not Found", description: `Game with ID ${gameIdToJoin} does not exist.`, variant: "destructive" });
          return false;
        }

        const currentGameData = gameSnap.data() as HiddenWordGameState;
        
        if (currentGameData.players.find(p => p.id === localPlayerId)) {
          return true; // Player already in game
        }

        if (currentGameData.players.length >= currentGameData.maxPlayers) {
          toast({ title: "Lobby Full", description: `This game lobby is full (${currentGameData.maxPlayers} players max).`, variant: "destructive" });
          return false;
        }

        if (currentGameData.status !== 'lobby') {
          // Check if player was previously in the game by ID (allow rejoin)
          const wasInGame = currentGameData.players.some(p => p.id === localPlayerId);
          if (!wasInGame) {
            toast({ title: "Game in Progress", description: "This game has already started.", variant: "destructive" });
            return false;
          }
          // If they were in the game before, allow them to rejoin
          return true;
        }

        const joiningPlayer: HiddenWordPlayer = {
          id: localPlayerId,
          name: username,
          isHost: false,
          isAlive: true,
          isReady: false,
        };

        transaction.update(gameDocRef, {
          players: arrayUnion(joiningPlayer),
          gameLog: arrayUnion(`${username} joined the game`),
        });

        return true;
      });
    } catch (error) {
      console.error("Error joining Hidden Word game:", error);
      toast({ title: "Error Joining Game", description: (error as Error).message, variant: "destructive" });
      return false;
    }
  };

  const startGame = async () => {
    if (!gameState || !localPlayerId || gameState.hostId !== localPlayerId) {
      toast({ title: "Error", description: "Only the host can start the game.", variant: "destructive" });
      return;
    }

    if (gameState.players.length < gameState.minPlayers) {
      toast({ title: "Not Enough Players", description: `Need at least ${gameState.minPlayers} players to start.`, variant: "destructive" });
      return;
    }

    const gameDocRef = doc(db, "hidden-word-games", gameState.gameId);
    const secretWord = selectRandomWord();
    const playersWithRoles = assignRoles(gameState.players);
    
    try {
      await updateDoc(gameDocRef, {
        status: "role-assignment",
        currentRound: 1,
        secretWord: secretWord,
        players: playersWithRoles,
        chatMessages: [],
        currentAccusation: null,
        pendingAccusations: [],
        votes: [],
        executedPlayers: [],
        killedPlayers: [],
        roundHistory: [],
        phaseStartTime: deleteField(),
        timeRemaining: deleteField(),
        gameLog: arrayUnion(`Game started! Round 1 begins.`, `Secret word assigned.`),
      });
      
      // Auto-advance to discussion after 3 seconds
      setTimeout(async () => {
        await updateDoc(gameDocRef, {
          status: "discussion",
          phaseStartTime: serverTimestamp(),
          timeRemaining: gameState.discussionDuration,
          gameLog: arrayUnion(`Discussion phase started (${gameState.discussionDuration/60} minutes)`),
        });
      }, 3000);
      
      toast({ title: "Game Started!", description: "Roles assigned! Discussion begins soon.", variant: "default" });
    } catch (error) {
      console.error("Error starting game:", error);
      toast({ title: "Error", description: "Failed to start the game.", variant: "destructive" });
    }
  };

  const makeAccusation = async (accusedId: string) => {
    if (!gameState || !localPlayerId || gameState.status !== "interrogation") {
      return;
    }

    const accuser = gameState.players.find(p => p.id === localPlayerId);
    const accused = gameState.players.find(p => p.id === accusedId);
    
    if (!accuser || !accused || !accuser.isAlive || !accused.isAlive) {
      return;
    }

    const accusation: Accusation = {
      accuserId: localPlayerId,
      accuserName: accuser.name,
      accusedId,
      accusedName: accused.name,
      questions: [],
      timestamp: Date.now(),
    };

    const gameDocRef = doc(db, "hidden-word-games", gameState.gameId);
    
    try {
      const currentPendingAccusations = gameState.pendingAccusations || [];
      const updatedPendingAccusations = [...currentPendingAccusations, accusation];
      
      await updateDoc(gameDocRef, {
        pendingAccusations: updatedPendingAccusations,
        gameLog: arrayUnion(`${accuser.name} accused ${accused.name}!`),
      });
    } catch (error) {
      console.error("Error making accusation:", error);
    }
  };

  const askQuestion = async (question: string) => {
    if (!gameState || !localPlayerId || !gameState.currentAccusation) {
      return;
    }

    if (gameState.currentAccusation.accuserId !== localPlayerId) {
      return;
    }

    if (gameState.currentAccusation.questions.length >= 3) {
      toast({ title: "Question Limit", description: "Maximum 3 questions per accusation.", variant: "destructive" });
      return;
    }

    const newQuestion: AccusationQuestion = {
      question,
      timestamp: Date.now(),
    };

    const gameDocRef = doc(db, "hidden-word-games", gameState.gameId);
    const updatedQuestions = [...gameState.currentAccusation.questions, newQuestion];
    
    try {
      await updateDoc(gameDocRef, {
        "currentAccusation.questions": updatedQuestions,
        gameLog: arrayUnion(`${gameState.currentAccusation.accuserName} asked: "${question}"`),
      });
    } catch (error) {
      console.error("Error asking question:", error);
    }
  };

  const answerQuestion = async (answer: boolean) => {
    if (!gameState || !localPlayerId || !gameState.currentAccusation) {
      return;
    }

    if (gameState.currentAccusation.accusedId !== localPlayerId) {
      return;
    }

    const lastQuestion = gameState.currentAccusation.questions[gameState.currentAccusation.questions.length - 1];
    if (!lastQuestion || lastQuestion.answer !== undefined) {
      return;
    }

    const gameDocRef = doc(db, "hidden-word-games", gameState.gameId);
    const updatedQuestions = gameState.currentAccusation.questions.map((q, index) => 
      index === gameState.currentAccusation!.questions.length - 1 
        ? { ...q, answer }
        : q
    );
    
    try {
      // Add answer as both game log and chat message for visibility
      const answerMessage: HWChatMessage = {
        id: generateShortId(8),
        playerId: localPlayerId,
        playerName: gameState.currentAccusation.accusedName,
        text: `Answered: ${answer ? "Yes" : "No"}`,
        timestamp: Date.now(),
      };

      await updateDoc(gameDocRef, {
        "currentAccusation.questions": updatedQuestions,
        gameLog: arrayUnion(`${gameState.currentAccusation.accusedName} answered: ${answer ? "Yes" : "No"}`),
        chatMessages: arrayUnion(answerMessage),
      });

      // If this was the 3rd question, move to voting
      if (updatedQuestions.length === 3) {
        setTimeout(async () => {
          await updateDoc(gameDocRef, {
            status: "voting",
            votes: [],
            phaseStartTime: serverTimestamp(),
            timeRemaining: gameState.votingDuration,
            gameLog: arrayUnion("Voting phase started!"),
          });

          // Auto-advance after voting duration
          setTimeout(async () => {
            const currentGameSnap = await getDoc(gameDocRef);
            if (currentGameSnap.exists()) {
              const currentGameData = currentGameSnap.data() as HiddenWordGameState;
              if (currentGameData.status === "voting") {
                // Time's up, process votes regardless of completion
                processVotingResults();
              }
            }
          }, gameState.votingDuration * 1000);
        }, 2000);
      }
    } catch (error) {
      console.error("Error answering question:", error);
    }
  };

  const submitVote = async (votedForId: string) => {
    if (!gameState || !localPlayerId || gameState.status !== "voting") {
      return;
    }

    const voter = gameState.players.find(p => p.id === localPlayerId);
    const votedFor = gameState.players.find(p => p.id === votedForId);
    
    if (!voter || !votedFor || !voter.isAlive) {
      return;
    }

    if (gameState.votes.find(v => v.playerId === localPlayerId)) {
      return; // Already voted
    }

    const vote: VoteResult = {
      playerId: localPlayerId,
      playerName: voter.name,
      votedForId,
      votedForName: votedFor.name,
      timestamp: Date.now(),
    };

    const gameDocRef = doc(db, "hidden-word-games", gameState.gameId);
    
    try {
      await updateDoc(gameDocRef, {
        votes: arrayUnion(vote),
        gameLog: arrayUnion(`Vote submitted (${gameState.votes.length + 1}/${gameState.players.filter(p => p.isAlive).length})`),
      });

      // Check if all players have voted
      const alivePlayers = gameState.players.filter(p => p.isAlive);
      if (gameState.votes.length + 1 >= alivePlayers.length) {
        // All votes submitted, process immediately
        setTimeout(() => processVotingResults(), 1000);
      }
    } catch (error) {
      console.error("Error submitting vote:", error);
    }
  };

  const killPlayer = async (playerId: string) => {
    if (!gameState || !localPlayerId || gameState.status !== "imposter-kill") {
      return;
    }

    const killer = gameState.players.find(p => p.id === localPlayerId);
    const victim = gameState.players.find(p => p.id === playerId);
    
    if (!killer || !victim || killer.role !== "imposter" || !victim.isAlive) {
      return;
    }

    const gameDocRef = doc(db, "hidden-word-games", gameState.gameId);
    const updatedPlayers = gameState.players.map(p => 
      p.id === playerId ? { ...p, isAlive: false } : p
    );
    
    try {
      await updateDoc(gameDocRef, {
        players: updatedPlayers,
        killedPlayers: arrayUnion(playerId),
        gameLog: arrayUnion(`${victim.name} was eliminated during the night.`),
      });

      // Check win conditions and advance phase
      const winCheck = checkWinConditions(updatedPlayers, false);
      if (winCheck.winner) {
        await updateDoc(gameDocRef, {
          status: "game-finished",
          winner: winCheck.winner,
          winnerMessage: winCheck.message,
        });
      } else {
        // Start next round
        setTimeout(async () => {
          await updateDoc(gameDocRef, {
            status: "discussion",
            currentRound: gameState.currentRound + 1,
            phaseStartTime: serverTimestamp(),
            timeRemaining: gameState.discussionDuration,
            currentAccusation: null,
            votes: [],
            gameLog: arrayUnion(`Round ${gameState.currentRound + 1} discussion begins.`),
          });
        }, 3000);
      }
    } catch (error) {
      console.error("Error killing player:", error);
    }
  };

  const sendChatMessage = async (text: string) => {
    if (!gameState || !localPlayerId) return;

    const player = gameState.players.find(p => p.id === localPlayerId);
    if (!player || !player.isAlive) return;

    const message: HWChatMessage = {
      id: generateShortId(8),
      playerId: localPlayerId,
      playerName: player.name,
      text,
      timestamp: Date.now(),
    };

    const gameDocRef = doc(db, "hidden-word-games", gameState.gameId);
    try {
      await updateDoc(gameDocRef, {
        chatMessages: arrayUnion(message),
      });
    } catch (error) {
      console.error("Error sending chat message:", error);
    }
  };

  const processVotingResults = async () => {
    if (!gameState) return;

    const gameDocRef = doc(db, "hidden-word-games", gameState.gameId);
    
    // Get current game state to ensure we have latest votes
    const currentGameSnap = await getDoc(gameDocRef);
    if (!currentGameSnap.exists()) return;
    
    const currentGameData = currentGameSnap.data() as HiddenWordGameState;
    const alivePlayers = currentGameData.players.filter(p => p.isAlive);
    
    // Count votes
    const voteCounts: Record<string, number> = {};
    currentGameData.votes.forEach(vote => {
      voteCounts[vote.votedForId] = (voteCounts[vote.votedForId] || 0) + 1;
    });

    // Find player with most votes
    let maxVotes = 0;
    let playersWithMaxVotes: string[] = [];
    
    Object.entries(voteCounts).forEach(([playerId, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        playersWithMaxVotes = [playerId];
      } else if (count === maxVotes) {
        playersWithMaxVotes.push(playerId);
      }
    });

    let executedPlayerId: string;
    
    // If tied, execute the accuser
    if (playersWithMaxVotes.length > 1 && currentGameData.currentAccusation) {
      executedPlayerId = currentGameData.currentAccusation.accuserId;
    } else if (playersWithMaxVotes.length > 0) {
      executedPlayerId = playersWithMaxVotes[0];
    } else {
      // No votes cast, skip execution
      const aliveImposters = alivePlayers.filter(p => p.role === "imposter");
      if (aliveImposters.length > 0) {
        await updateDoc(gameDocRef, {
          status: "imposter-kill",
          currentAccusation: null,
          votes: [],
          phaseStartTime: deleteField(),
          timeRemaining: deleteField(),
          gameLog: arrayUnion("No votes cast. Night phase begins."),
        });
      } else {
        await updateDoc(gameDocRef, {
          status: "discussion",
          currentRound: currentGameData.currentRound + 1,
          phaseStartTime: serverTimestamp(),
          timeRemaining: currentGameData.discussionDuration,
          currentAccusation: null,
          votes: [],
          gameLog: arrayUnion(`Round ${currentGameData.currentRound + 1} discussion begins.`),
        });
      }
      return;
    }

    const executedPlayer = currentGameData.players.find(p => p.id === executedPlayerId);
    const updatedPlayers = currentGameData.players.map(p => 
      p.id === executedPlayerId ? { ...p, isAlive: false } : p
    );

    await updateDoc(gameDocRef, {
      status: "execution",
      players: updatedPlayers,
      executedPlayers: arrayUnion(executedPlayerId),
      phaseStartTime: deleteField(),
      timeRemaining: deleteField(),
      gameLog: arrayUnion(`${executedPlayer?.name} was executed by vote!`),
    });

    // Check win conditions
    const winCheck = checkWinConditions(updatedPlayers, true);
    if (winCheck.winner) {
      await updateDoc(gameDocRef, {
        status: "game-finished",
        winner: winCheck.winner,
        winnerMessage: winCheck.message,
      });
    } else {
      // Continue to night phase or next round
      setTimeout(async () => {
        const aliveImposters = updatedPlayers.filter(p => p.isAlive && p.role === "imposter");
        if (aliveImposters.length > 0) {
          await updateDoc(gameDocRef, {
            status: "imposter-kill",
            currentAccusation: null,
            votes: [],
            gameLog: arrayUnion("Night phase begins."),
          });
        } else {
          await updateDoc(gameDocRef, {
            status: "discussion",
            currentRound: currentGameData.currentRound + 1,
            phaseStartTime: serverTimestamp(),
            timeRemaining: currentGameData.discussionDuration,
            currentAccusation: null,
            votes: [],
            gameLog: arrayUnion(`Round ${currentGameData.currentRound + 1} discussion begins.`),
          });
        }
      }, 3000);
    }
  };

  const startNextPhase = async () => {
    if (!gameState || !localPlayerId) return;

    const gameDocRef = doc(db, "hidden-word-games", gameState.gameId);

    try {
      switch (gameState.status) {
        case "discussion":
          // Start interrogation phase
          await updateDoc(gameDocRef, {
            status: "interrogation",
            phaseStartTime: serverTimestamp(),
            timeRemaining: gameState.interrogationDuration,
            pendingAccusations: [],
            gameLog: arrayUnion("Interrogation phase started! 10 seconds to make accusations."),
          });

          // Auto-advance after 10 seconds
          setTimeout(async () => {
            const currentGameSnap = await getDoc(gameDocRef);
            if (currentGameSnap.exists()) {
              const currentGameData = currentGameSnap.data() as HiddenWordGameState;
              const pendingAccusations = currentGameData.pendingAccusations || [];
              
              if (pendingAccusations.length === 0) {
                // No accusations, skip to next round or night phase
                const aliveImposters = currentGameData.players.filter(p => p.isAlive && p.role === "imposter");
                if (aliveImposters.length > 0) {
                  await updateDoc(gameDocRef, {
                    status: "imposter-kill",
                    gameLog: arrayUnion("No accusations made. Night phase begins."),
                  });
                } else {
                  // Start next round
                  await updateDoc(gameDocRef, {
                    status: "discussion",
                    currentRound: currentGameData.currentRound + 1,
                    phaseStartTime: serverTimestamp(),
                    timeRemaining: currentGameData.discussionDuration,
                    gameLog: arrayUnion(`Round ${currentGameData.currentRound + 1} discussion begins.`),
                  });
                }
              } else {
                // Randomly select one accusation
                const selectedAccusation = pendingAccusations[Math.floor(Math.random() * pendingAccusations.length)];
                await updateDoc(gameDocRef, {
                  currentAccusation: selectedAccusation,
                  pendingAccusations: [],
                  gameLog: arrayUnion(`${selectedAccusation.accuserName} vs ${selectedAccusation.accusedName} selected for questioning!`),
                });
              }
            }
          }, gameState.interrogationDuration * 1000);
          break;

        default:
          break;
      }
    } catch (error) {
      console.error("Error advancing phase:", error);
    }
  };

  const updateGameSettings = async (settings: Partial<HiddenWordGameSettings>) => {
    if (!gameState || !localPlayerId || gameState.hostId !== localPlayerId || gameState.status !== 'lobby') {
      return;
    }

    const gameDocRef = doc(db, "hidden-word-games", gameState.gameId);
    try {
      await updateDoc(gameDocRef, settings);
    } catch (error) {
      console.error("Error updating game settings:", error);
    }
  };

  const leaveGame = async () => {
    if (!gameState || !localPlayerId) return;

    const gameDocRef = doc(db, "hidden-word-games", gameState.gameId);
    const player = gameState.players.find(p => p.id === localPlayerId);
    
    if (player) {
      try {
        await runTransaction(db, async (transaction) => {
          const gameSnap = await transaction.get(gameDocRef);
          if (gameSnap.exists()) {
            const currentData = gameSnap.data() as HiddenWordGameState;
            const updatedPlayers = currentData.players.filter(p => p.id !== localPlayerId);
            
            transaction.update(gameDocRef, {
              players: updatedPlayers,
              gameLog: arrayUnion(`${player.name} left the game`),
            });
          }
        });
      } catch (error) {
        console.error("Error leaving game:", error);
      }
    }
  };

  const contextValue: HiddenWordGameContextProps = {
    gameState,
    localPlayerId,
    setLocalPlayerId,
    isLoading,
    isInitialized,
    createGame,
    joinGame,
    startGame,
    makeAccusation,
    answerQuestion,
    askQuestion,
    submitVote,
    killPlayer,
    sendChatMessage,
    leaveGame,
    startNextPhase,
    updateGameSettings,
  };

  return (
    <HiddenWordGameContext.Provider value={contextValue}>
      {children}
    </HiddenWordGameContext.Provider>
  );
};

export const useHiddenWordGame = () => {
  const context = useContext(HiddenWordGameContext);
  if (context === undefined) {
    throw new Error('useHiddenWordGame must be used within a HiddenWordGameProvider');
  }
  return context;
}; 