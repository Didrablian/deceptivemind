
import type { Timestamp } from 'firebase/firestore';

export type Role = "Communicator" | "Helper" | "Imposter" | "ClueHolder";

export interface Player {
  id: string;
  name: string;
  role: Role;
  isHost?: boolean;
  isAlive: boolean;
  clue: string | null;
  hasCalledMeeting?: boolean; // May become obsolete with new flow
  score: number; // New: Player's score for the session/game
  isRevealedImposter?: boolean; // New: For post-guess twist
}

export interface GameWord {
  text: string;
  isTarget: boolean;
  isEliminated?: boolean; // New: To mark eliminated words
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName:string;
  text: string;
  timestamp: Timestamp | number;
}

export type GameStatus =
  | "lobby"
  | "role-reveal"
  | "discussion" // New: Replaces "playing" for clarity
  | "word-elimination" // Communicator's turn
  | "word-lock-in-attempt" // Team attempts to lock in a word
  | "post-guess-reveal" // Imposters reveal and accuse helper
  | "finished";

export interface GameState {
  gameId: string;
  players: Player[];
  status: GameStatus;
  words: GameWord[];
  targetWord: string;
  hostId: string;
  
  // Old accusation/meeting fields - to be removed or re-evaluated
  // accusationsMadeByImposters: number; (Replaced by post-guess twist)
  // meetingsCalled: number; (Replaced by game flow)
  // maxMeetings: number; (Replaced by game flow)

  eliminationCount: number; // New: Tracks number of eliminations
  maxEliminations: number; // New: Typically 3

  lockedInWordGuess?: { wordText: string, playerId: string } | null; // New: Tracks the team's final guess

  winner: "Imposters" | "Team" | "GoodTeam" | "NoOne" | null; // "Team" can be used generally for non-imposters
  winningReason?: string; // New: More descriptive win reason
  
  gameLog: string[];
  chatMessages: ChatMessage[];
  
  minPlayers: number;
  maxPlayers: number;
  actualPlayerCount?: number; // Number of players when game starts

  // Scoring related
  playerScores?: Record<string, number>; // Optional: if storing separately, for now score is on Player object
}

export type Action =
  | { type: 'SET_GAME_STATE_FROM_FIRESTORE'; payload: GameState }
  ;

export interface AIWordsAndClues {
  targetWord: string;
  words: string[];
  helperClue: string;
  clueHolderClue: string; // One clue for all clue holders, or individual if AI provides more
}
