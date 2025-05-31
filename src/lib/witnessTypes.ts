export type PlayerRole = 'judge' | 'witness' | 'suspect' | 'detective';

export type GameStage = 'location' | 'weapon' | 'suspect';

export type GamePhase = 
  | 'waiting'
  | 'location-prep'
  | 'location-discussion' 
  | 'location-voting'
  | 'weapon-prep'
  | 'weapon-discussion'
  | 'weapon-voting'
  | 'suspect-discussion'
  | 'suspect-voting'
  | 'imposter-counterattack'
  | 'reveal'
  | 'finished';

export interface WitnessPlayer {
  id: string;
  name: string;
  role?: PlayerRole;
  isAlive: boolean;
  isReady: boolean;
  lastSeen: number;
  // Detective clues (only for detective role)
  locationClue?: string;
  weaponClue?: string;
  // Bot support
  isBot?: boolean;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export interface WitnessGameState {
  id: string;
  players: WitnessPlayer[];
  phase: GamePhase;
  stage: GameStage;
  
  // Words and grids
  locationWords: string[];
  weaponWords: string[];
  correctLocation: string;
  correctWeapon: string;
  
  // Round results
  selectedLocation?: string;
  selectedWeapon?: string;
  selectedSuspect?: string;
  
  // Imposter counter-attack
  imposterWitnessGuess?: string; // playerId of who imposter thinks is witness
  
  // Voting
  suspectVotes: Record<string, string>; // suspect playerId -> witness playerId they voted for
  
  // Chat
  chatMessages: ChatMessage[];
  
  // Timing
  phaseStartTime: number;
  phaseEndTime: number;
  
  // Settings
  settings: {
    locationPrepTime: number; // 30s
    locationDiscussionTime: number; // 120s (2:00 min)
    weaponPrepTime: number; // 30s  
    weaponDiscussionTime: number; // 120s (2:00 min)
    suspectDiscussionTime: number; // 90s (1:30 min)
    imposterCounterattackTime: number; // 30s
  };
  
  // Game results
  teamWon?: boolean;
  gameEndTime?: number;
  createdAt: number;
  updatedAt: number;
}

export interface WitnessGameAction {
  type: 'select-location' | 'select-weapon' | 'select-suspect' | 'vote-witness' | 'start-game' | 'next-phase';
  playerId: string;
  data?: {
    word?: string;
    suspectedPlayerId?: string;
    witnessPlayerId?: string;
  };
  timestamp: number;
}

// Word banks for the game
export const LOCATION_WORDS = [
  'Rooftop', 'Casino', 'Kitchen', 'Library', 'Basement', 'Garden', 'Office', 'Theater', 'Museum',
  'Hospital', 'Bank', 'School', 'Park', 'Beach', 'Forest', 'Bridge', 'Subway', 'Airport',
  'Restaurant', 'Hotel', 'Warehouse', 'Factory', 'Church', 'Stadium', 'Mall', 'Garage'
];

export const WEAPON_WORDS = [
  'Knife', 'Poison', 'Gun', 'Rope', 'Hammer', 'Scissors', 'Candle', 'Wrench', 'Sword',
  'Bow', 'Axe', 'Chainsaw', 'Crowbar', 'Dagger', 'Spear', 'Club', 'Whip', 'Grenade',
  'Syringe', 'Wire', 'Brick', 'Shovel', 'Torch', 'Crossbow', 'Mace', 'Harpoon'
];

export function getRandomWords(wordBank: string[], count: number = 9): string[] {
  const shuffled = [...wordBank].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function assignRoles(playerCount: number): PlayerRole[] {
  const roles: PlayerRole[] = ['judge', 'witness'];
  
  // Add suspects based on player count
  if (playerCount >= 6) {
    roles.push('suspect', 'suspect');
  } else {
    roles.push('suspect');
  }
  
  // Fill remaining slots with detectives
  while (roles.length < playerCount) {
    roles.push('detective');
  }
  
  // Shuffle roles
  return roles.sort(() => Math.random() - 0.5);
}

export function checkWinCondition(gameState: WitnessGameState): { teamWon: boolean; reason: string } {
  const { selectedLocation, selectedWeapon, selectedSuspect, imposterWitnessGuess, correctLocation, correctWeapon, suspectVotes, players } = gameState;
  
  // Check if both words were guessed correctly and correct suspect was selected
  const locationCorrect = selectedLocation === correctLocation;
  const weaponCorrect = selectedWeapon === correctWeapon;
  const selectedPlayer = players.find(p => p.id === selectedSuspect);
  const suspectCorrect = selectedPlayer?.role === 'suspect';
  
  if (!locationCorrect || !weaponCorrect) {
    return {
      teamWon: false,
      reason: `Wrong ${!locationCorrect ? 'location' : 'weapon'} selected`
    };
  }
  
  if (!suspectCorrect) {
    return {
      teamWon: false,
      reason: 'Wrong suspect selected'
    };
  }
  
  // If everything was correct, check for imposter counter-attack
  const witness = players.find(p => p.role === 'witness');
  if (!witness) {
    return { teamWon: false, reason: 'No witness found' };
  }
  
  // If imposter made a guess and it was correct, imposter wins
  if (imposterWitnessGuess && imposterWitnessGuess === witness.id) {
    return {
      teamWon: false,
      reason: 'Imposter correctly identified the witness in counter-attack'
    };
  }
  
  // Check if witness was exposed during voting (original logic)
  const witnessExposed = Object.values(suspectVotes).some(vote => vote === witness.id);
  
  if (witnessExposed) {
    return {
      teamWon: false,
      reason: 'Witness was exposed by suspects during voting'
    };
  }
  
  return {
    teamWon: true,
    reason: 'Team successfully protected witness and guessed everything correctly'
  };
} 