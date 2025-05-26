
export type Role = "Communicator" | "Helper" | "Imposter" | "ClueHolder";

export interface Player {
  id: string;
  name: string;
  role: Role; // Will be assigned when game starts, defaults to "Communicator" or similar on join
  isHost?: boolean;
  isAlive: boolean;
  clue?: string; 
  hasCalledMeeting?: boolean;
}

export interface GameWord {
  text: string;
  isTarget: boolean;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number; // Consider using Firestore ServerTimestamp for more accuracy if needed
}

export interface GameState {
  gameId: string;
  players: Player[];
  status: "lobby" | "role-reveal" | "playing" | "meeting" | "accusation" | "finished";
  words: GameWord[];
  targetWord: string;
  hostId: string;
  accusationsMadeByImposters: number;
  meetingsCalled: number;
  maxMeetings: number;
  winner: "Imposters" | "GoodTeam" | "NoOne" | null; // Changed to explicitly include null
  gameLog: string[]; // Array of log messages
  chatMessages: ChatMessage[]; // Array of chat messages
}

// Actions are now mostly represented by functions in GameContext, 
// but keeping a generic type for SET_GAME_STATE might be useful if dispatch is partially kept.
// For this refactor, direct async functions in context are preferred.
export type Action =
  | { type: 'SET_GAME_STATE_FROM_FIRESTORE'; payload: GameState }
  // Other actions are handled by specific functions in GameContext
  // Example (if you were still using a reducer for local optimistic updates, which we are moving away from for writes):
  // | { type: 'LOCAL_ADD_PLAYER_OPTIMISTIC'; payload: Player }
  ;

export interface AIWordsAndClues {
  targetWord: string;
  words: string[];
  helperClue: string;
  clueHolderClue: string;
}

