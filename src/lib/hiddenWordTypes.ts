import type { Timestamp } from 'firebase/firestore';

export type PlayerRole = "villager" | "imposter" | "jester";

export interface HiddenWordPlayer {
  id: string;
  name: string;
  isHost?: boolean;
  role?: PlayerRole;
  isAlive: boolean;
  votedFor?: string;
  isReady: boolean;
}

export interface Accusation {
  accuserId: string;
  accuserName: string;
  accusedId: string;
  accusedName: string;
  questions: AccusationQuestion[];
  timestamp: number;
}

export interface AccusationQuestion {
  question: string;
  answer?: boolean;
  timestamp: number;
}

export interface VoteResult {
  playerId: string;
  playerName: string;
  votedForId: string;
  votedForName: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
  isSystemMessage?: boolean;
}

export type HiddenWordGameStatus = 
  | "lobby"
  | "role-assignment"
  | "discussion"
  | "interrogation"
  | "voting"
  | "execution"
  | "imposter-kill"
  | "game-finished";

export interface HiddenWordGameState {
  gameId: string;
  gameType: "hidden-word";
  players: HiddenWordPlayer[];
  status: HiddenWordGameStatus;
  hostId: string;
  
  // Game content
  secretWord: string;
  secretImage?: string;
  
  // Current round data
  currentRound: number;
  maxRounds: number;
  
  // Phase timing
  phaseStartTime?: number;
  discussionDuration: number; // in seconds
  interrogationDuration: number;
  votingDuration: number;
  timeRemaining?: number;
  
  // Current accusations and voting
  currentAccusation?: Accusation;
  pendingAccusations?: Accusation[]; // Multiple accusations during interrogation
  votes: VoteResult[];
  
  // Game history
  executedPlayers: string[];
  killedPlayers: string[];
  roundHistory: string[];
  
  // Game settings
  minPlayers: number;
  maxPlayers: number;
  
  // Chat and logs
  chatMessages: ChatMessage[];
  gameLog: string[];
  
  // Winner
  winner?: "villagers" | "imposters" | "jester";
  winnerMessage?: string;
}

export interface HiddenWordGameSettings {
  maxRounds: number;
  discussionDuration: number;
  interrogationDuration: number;
  votingDuration: number;
  minPlayers: number;
  maxPlayers: number;
  imposterCount: number;
  hasJester: boolean;
}

export const defaultHiddenWordGameSettings: HiddenWordGameSettings = {
  maxRounds: 10,
  discussionDuration: 240, // 4 minutes
  interrogationDuration: 10, // 10 seconds for interrogation phase
  votingDuration: 30, // 30 seconds
  minPlayers: 4,
  maxPlayers: 10,
  imposterCount: 1, // Will scale with player count
  hasJester: true,
};

// Secret words for the game
export const secretWords: string[] = [
  "COFFEE", "SUNSET", "BICYCLE", "LIBRARY", "GUITAR", "RAINBOW", "CASTLE", "OCEAN",
  "BUTTERFLY", "MOUNTAIN", "CHOCOLATE", "TELESCOPE", "GARDEN", "FIREWORKS", "SANDWICH",
  "UMBRELLA", "VOLCANO", "KEYBOARD", "WATERFALL", "PENGUIN", "LIGHTHOUSE", "DRAGONFLY",
  "TELESCOPE", "HAMMOCK", "CAMPFIRE", "SNOWFLAKE", "TELESCOPE", "CAROUSEL", "LANTERN",
  "MEADOW", "COMPASS", "STARFISH", "WINDMILL", "PEACOCK", "GAZEBO", "CONSTELLATION"
];

export const calculateRoleDistribution = (playerCount: number, hasJester: boolean = true): {
  villagers: number;
  imposters: number;
  jester: number;
} => {
  const jesterCount = hasJester ? 1 : 0;
  let imposterCount: number;
  let villagerCount: number;

  // New role distribution table
  switch (playerCount) {
    case 4:
      villagerCount = 2;
      imposterCount = 1;
      break;
    case 5:
      villagerCount = 3;
      imposterCount = 1;
      break;
    case 6:
      villagerCount = 4;
      imposterCount = 1;
      break;
    case 7:
      villagerCount = 4;
      imposterCount = 2;
      break;
    case 8:
      villagerCount = 5;
      imposterCount = 2;
      break;
    case 9:
      villagerCount = 6;
      imposterCount = 2;
      break;
    case 10:
      villagerCount = 7;
      imposterCount = 2;
      break;
    default:
      // Fallback for other player counts
      imposterCount = Math.max(1, Math.floor(playerCount / 4));
      villagerCount = playerCount - imposterCount - jesterCount;
      break;
  }

  return {
    villagers: villagerCount,
    imposters: imposterCount,
    jester: jesterCount,
  };
};

export const assignRoles = (players: HiddenWordPlayer[], hasJester: boolean = true): HiddenWordPlayer[] => {
  const distribution = calculateRoleDistribution(players.length, hasJester);
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
  
  let roleIndex = 0;
  
  // Assign roles
  return shuffledPlayers.map((player) => {
    let role: PlayerRole;
    
    if (roleIndex < distribution.imposters) {
      role = "imposter";
    } else if (hasJester && roleIndex < distribution.imposters + distribution.jester) {
      role = "jester";
    } else {
      role = "villager";
    }
    
    roleIndex++;
    
    return {
      ...player,
      role,
      isAlive: true,
      isReady: false,
    };
  });
};

export const checkWinConditions = (players: HiddenWordPlayer[]): {
  winner?: "villagers" | "imposters" | "jester";
  message?: string;
} => {
  const alivePlayers = players.filter(p => p.isAlive);
  const aliveVillagers = alivePlayers.filter(p => p.role === "villager");
  const aliveImposters = alivePlayers.filter(p => p.role === "imposter");
  const aliveJester = alivePlayers.filter(p => p.role === "jester");

  // Jester wins if executed
  const executedJester = players.find(p => !p.isAlive && p.role === "jester");
  if (executedJester) {
    return {
      winner: "jester",
      message: "The Jester wins by being executed!"
    };
  }

  // Imposters win if they equal or outnumber villagers
  if (aliveImposters.length >= aliveVillagers.length && aliveImposters.length > 0) {
    return {
      winner: "imposters",
      message: "Imposters win by equaling the villager count!"
    };
  }

  // Villagers win if all imposters are eliminated
  if (aliveImposters.length === 0) {
    return {
      winner: "villagers",
      message: "Villagers win by eliminating all imposters!"
    };
  }

  return {};
};

// Categories and word lists
export interface WordCategory {
  name: string;
  words: string[];
}

export const wordCategories: WordCategory[] = [
  {
    name: "Animals",
    words: ["ELEPHANT", "BUTTERFLY", "PENGUIN", "GIRAFFE", "DOLPHIN", "KANGAROO", "OCTOPUS", "FLAMINGO"]
  },
  {
    name: "Food",
    words: ["PIZZA", "HAMBURGER", "CHOCOLATE", "SPAGHETTI", "SANDWICH", "PANCAKE", "AVOCADO", "STRAWBERRY"]
  },
  {
    name: "Objects",
    words: ["TELEPHONE", "COMPUTER", "BICYCLE", "UMBRELLA", "CAMERA", "KEYBOARD", "BACKPACK", "CALCULATOR"]
  },
  {
    name: "Nature",
    words: ["MOUNTAIN", "RAINBOW", "WATERFALL", "FOREST", "DESERT", "VOLCANO", "GLACIER", "MEADOW"]
  },
  {
    name: "Professions",
    words: ["DOCTOR", "TEACHER", "FIREFIGHTER", "PILOT", "CHEF", "SCIENTIST", "ARTIST", "ENGINEER"]
  }
];

export const generateClueForWord = (word: string, category: string): string => {
  const clues: Record<string, Record<string, string>> = {
    "Animals": {
      "ELEPHANT": "Large gray mammal with a trunk",
      "BUTTERFLY": "Colorful insect that transforms from a caterpillar",
      "PENGUIN": "Black and white bird that can't fly but swims well",
      "GIRAFFE": "Tallest animal with a very long neck",
      "DOLPHIN": "Intelligent marine mammal that clicks and whistles",
      "KANGAROO": "Australian animal that hops and carries babies in a pouch",
      "OCTOPUS": "Sea creature with eight arms and three hearts",
      "FLAMINGO": "Pink bird that stands on one leg"
    },
    "Food": {
      "PIZZA": "Italian dish with cheese and tomato sauce on dough",
      "HAMBURGER": "Grilled meat patty served in a bun",
      "CHOCOLATE": "Sweet brown treat made from cocoa beans",
      "SPAGHETTI": "Long thin pasta often served with sauce",
      "SANDWICH": "Food item with filling between two slices of bread",
      "PANCAKE": "Flat round cake eaten for breakfast with syrup",
      "AVOCADO": "Green fruit with a large pit, popular in guacamole",
      "STRAWBERRY": "Red berry with seeds on the outside"
    },
    "Objects": {
      "TELEPHONE": "Device used to talk to people far away",
      "COMPUTER": "Electronic machine for processing information",
      "BICYCLE": "Two-wheeled vehicle powered by pedaling",
      "UMBRELLA": "Collapsible canopy that protects from rain",
      "CAMERA": "Device used to take photographs",
      "KEYBOARD": "Input device with letters and numbers for typing",
      "BACKPACK": "Bag carried on shoulders for holding items",
      "CALCULATOR": "Electronic device for doing math"
    },
    "Nature": {
      "MOUNTAIN": "Very tall natural elevation of land",
      "RAINBOW": "Colorful arc in the sky after rain",
      "WATERFALL": "Water cascading down from a height",
      "FOREST": "Large area covered with trees",
      "DESERT": "Dry sandy region with little rainfall",
      "VOLCANO": "Mountain that can erupt with lava",
      "GLACIER": "Slow-moving mass of ice",
      "MEADOW": "Grassy field with wildflowers"
    },
    "Professions": {
      "DOCTOR": "Medical professional who treats patients",
      "TEACHER": "Person who educates students in school",
      "FIREFIGHTER": "Brave person who puts out fires",
      "PILOT": "Person who flies airplanes",
      "CHEF": "Professional cook in a restaurant",
      "SCIENTIST": "Person who studies and experiments",
      "ARTIST": "Creative person who makes paintings or sculptures",
      "ENGINEER": "Person who designs and builds things"
    }
  };
  
  return clues[category]?.[word] || `A word in the ${category} category`;
}; 