
import type { Timestamp } from 'firebase/firestore';

export type Role = "Communicator" | "Helper" | "Imposter" | "ClueHolder";

export interface Player {
  id: string;
  name: string;
  role: Role; 
  isHost?: boolean;
  isAlive: boolean;
  clue: string | null; // Allow null
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
  timestamp: Timestamp | number; // Allow Firestore Timestamp or number for client-side display
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
  winner: "Imposters" | "GoodTeam" | "NoOne" | null;
  gameLog: string[];
  chatMessages: ChatMessage[];
}

export type Action =
  | { type: 'SET_GAME_STATE_FROM_FIRESTORE'; payload: GameState }
  ;

export interface AIWordsAndClues {
  targetWord: string;
  words: string[];
  helperClue: string;
  clueHolderClue: string;
}
