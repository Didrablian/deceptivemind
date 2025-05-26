export type Role = "Communicator" | "Helper" | "Imposter" | "ClueHolder";

export interface Player {
  id: string;
  name: string;
  role: Role;
  isHost?: boolean;
  isAlive: boolean;
  clue?: string; 
  hasCalledMeeting?: boolean; // Track if player has used their emergency meeting
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
  timestamp: number;
}

export interface GameState {
  gameId: string;
  players: Player[];
  status: "lobby" | "role-reveal" | "playing" | "meeting" | "accusation" | "finished";
  words: GameWord[];
  targetWord: string; // Just the text of the target word for easier access
  // Clues are now part of the Player object
  // helperClue?: string; // Stored in Helper's Player object
  // clueHolderClue?: string; // Stored in ClueHolder's Player object
  hostId: string;
  currentTurnPlayerId?: string; // May not be strictly turn-based, but could be useful
  accusationsMadeByImposters: number; // Count of helper accusations by imposters
  meetingsCalled: number;
  maxMeetings: number; // e.g., 2
  winner?: "Imposters" | "GoodTeam" | "NoOne"; // NoOne if imposters fail accusation
  gameLog: string[];
  chatMessages: ChatMessage[];
}

export type Action =
  | { type: 'SET_GAME_STATE'; payload: GameState }
  | { type: 'ADD_PLAYER'; payload: Player }
  | { type: 'REMOVE_PLAYER'; payload: string } // playerId
  | { type: 'UPDATE_PLAYER'; payload: Partial<Player> & { id: string } }
  | { type: 'START_GAME'; payload: { words: GameWord[]; targetWord: string; playersWithRoles: Player[] } }
  | { type: 'SET_STATUS'; payload: GameState['status'] }
  | { type: 'ADD_CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'PLAYER_VOTE'; payload: { voterId: string; votedPlayerId: string } } // Example for voting
  | { type: 'ACCUSE_HELPER'; payload: { accuserId: string; accusedPlayerId: string } }
  | { type: 'END_GAME'; payload: { winner: GameState['winner'], reason: string } };

// Using a more specific type for AI output based on its structure
export interface AIWordsAndClues {
  targetWord: string;
  words: string[]; // Array of word strings
  helperClue: string;
  clueHolderClue: string;
}
