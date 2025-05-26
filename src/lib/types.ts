
import type { Timestamp } from 'firebase/firestore';

export type Role = "Communicator" | "Helper" | "Imposter" | "ClueHolder";

export interface Player {
  id: string;
  name: string;
  role: Role;
  isHost?: boolean;
  isAlive: boolean;
  clue: string | null;
  score: number;
  isRevealedImposter?: boolean;
}

export interface GameWord {
  text: string;
  isTarget: boolean;
  isEliminated?: boolean;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName:string;
  text: string;
  timestamp: number; // Numeric timestamp (Date.now())
}

export type GameStatus =
  | "lobby"
  | "role-reveal"
  | "discussion"
  | "word-elimination"
  | "word-lock-in-attempt"
  | "post-guess-reveal"
  | "finished";

export interface GameState {
  gameId: string;
  players: Player[];
  status: GameStatus;
  words: GameWord[];
  targetWord: string;
  hostId: string;
  
  eliminationCount: number;
  maxEliminations: number;

  lockedInWordGuess?: { wordText: string, playerId: string, isCorrect: boolean } | null;

  winner: "Imposters" | "Team" | "GoodTeam" | "NoOne" | null;
  winningReason?: string;
  
  gameLog: string[];
  chatMessages: ChatMessage[];
  
  minPlayers: number;
  maxPlayers: number;
  actualPlayerCount?: number;

  playerScoresBeforeRound?: Record<string, number>; // Stores scores at the start of the current round
}

export interface AIWordsAndClues {
  targetWord: string;
  words: string[];
  helperClue: string;
  clueHolderClue: string;
}
