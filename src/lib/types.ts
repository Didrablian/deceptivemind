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

export interface GameItem { // Renamed from GameWord
  text: string; // For words, this is the word. For images, this is the description.
  isTarget: boolean;
  isEliminated?: boolean;
  imageUrl?: string; // Optional URL for the image if in image mode
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName:string;
  text: string;
  timestamp: number;
}

export type GameStatus =
  | "lobby"
  | "role-reveal"
  | "role-understanding" // 30 seconds after clicking "Understanding roles"
  | "identification" // 3 minutes for helper/clueholder/communicator to identify
  | "discussion"
  | "word-elimination" // This status might be merged with 'discussion' or re-evaluated
  | "word-lock-in-attempt" // This status might be merged or re-evaluated
  | "post-guess-reveal"
  | "finished";

export type GameMode = 'words' | 'images';

export interface GameState {
  gameId: string;
  players: Player[];
  status: GameStatus;
  items: GameItem[]; // Renamed from words
  targetWord: string; // Represents the target item's text/description
  hostId: string;
  
  eliminationCount: number;
  maxEliminations: number;

  lockedInWordGuess?: { wordText: string, playerId: string, isCorrect: boolean } | null; // wordText here will refer to item's text

  winner: "Imposters" | "Team" | "GoodTeam" | "NoOne" | null;
  winningReason?: string;
  
  gameLog: string[];
  chatMessages: ChatMessage[];
  
  minPlayers: number;
  maxPlayers: number;
  actualPlayerCount?: number;

  playerScoresBeforeRound?: Record<string, number>;

  gameMode: GameMode; // New: 'words' or 'images'
  numberOfItems: number; // New: 9 for words, 4 for images
  
  // Timer fields
  phaseStartTime?: number; // Timestamp when current phase started
  phaseDuration?: number; // Duration in seconds for current timed phase
  timeRemaining?: number; // Remaining time in seconds (real-time updated)
}

// Unified AI output type
export interface AIGameDataOutput {
  targetItemDescription: string; // Description of the target (word or image)
  items: Array<{ text: string; imageUrl?: string }>; // Array of words or image objects
  clueHolderClue: string;
}
