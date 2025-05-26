
import type { Player, Role, GameWord, GameState, GameStatus } from './types';

export function generateShortId(length: number = 6): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array]; // Create a copy to avoid mutating the original
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]]; // Swap elements
  }
  return newArray;
}

export function assignRolesAndClues(
  players: Player[],
  aiData: { targetWord: string; words: string[]; helperClue: string; clueHolderClue: string },
  minPlayers: number,
  maxPlayers: number
): { updatedPlayers: Player[]; gameWords: GameWord[] } {
  const playerCount = players.length;
  if (playerCount < minPlayers || playerCount > maxPlayers) {
    console.error("Role assignment called with unsupported player count:", playerCount);
    // Return players with default safe roles and empty game words
    return { 
      updatedPlayers: players.map(p => ({
        ...p, 
        role: "ClueHolder" as Role, 
        clue: null, 
        isAlive: true, 
        isRevealedImposter: false, 
        score: p.score || 0, // Preserve score
        isHost: p.isHost || false // Preserve host status
      })), 
      gameWords: [] 
    };
  }

  let rolesToAssign: Role[] = [];
  const imposterCount = playerCount >= 6 ? 2 : 1;
  const communicatorCount = 1;
  const helperCount = 1;
  const clueHolderCount = playerCount - communicatorCount - helperCount - imposterCount;

  rolesToAssign.push("Communicator");
  rolesToAssign.push("Helper");
  for (let i = 0; i < imposterCount; i++) rolesToAssign.push("Imposter");
  for (let i = 0; i < clueHolderCount; i++) rolesToAssign.push("ClueHolder");
  
  const shuffledRoles = shuffleArray(rolesToAssign); // Shuffle roles for random assignment

  const updatedPlayers = players.map((player, index) => {
    const role = shuffledRoles[index % shuffledRoles.length];
    let clue: string | null = null;

    if (role === "Helper") {
      clue = aiData.helperClue;
    } else if (role === "ClueHolder") {
      clue = aiData.clueHolderClue; 
    }

    return {
      ...player, // Preserves id, name, score, isHost
      role,
      clue: clue,
      isAlive: true,
      isRevealedImposter: false, // Reset for new round/game
    };
  });

  let gameWords: GameWord[] = aiData.words.map(word => ({
    text: word,
    isTarget: word.toLowerCase() === aiData.targetWord.toLowerCase(), // Case-insensitive comparison for target
    isEliminated: false,
  }));

  // Ensure there's exactly one target word, even if AI data was imperfect
  const targetWordsInGrid = gameWords.filter(w => w.isTarget);
  if (targetWordsInGrid.length === 0 && gameWords.length > 0) {
    console.warn("Target word from AI was not in the word list or matched incorrectly. Fallback: setting first word as target.");
    // Clear any potential false targets first
    gameWords.forEach(w => w.isTarget = false);
    gameWords[0].isTarget = true;
  } else if (targetWordsInGrid.length > 1) {
     console.warn("Multiple target words found in grid. Fallback: keeping only the first match as target.");
     let foundFirstTarget = false;
     gameWords.forEach(w => {
        if (w.isTarget) {
            if (foundFirstTarget) w.isTarget = false; // Demote subsequent targets
            else foundFirstTarget = true;
        }
     });
  }
  
  // Shuffle the gameWords array to randomize display order on the grid
  gameWords = shuffleArray(gameWords);

  return { updatedPlayers, gameWords };
}

export function getRoleExplanation(role: Role, targetWord?: string, clue?: string | null): string {
  switch (role) {
    case "Communicator":
      return `Your Role: Communicator 🕵️‍♂️\nObjective: Lead the discussion. You will choose up to 3 words to eliminate from the grid. Your goal is to help the team identify the secret word without eliminating it. If the secret word is eliminated, your team loses.`;
    case "Helper":
      return `Your Role: Helper 💡\nObjective: You know the secret word: "${targetWord || 'TARGET_WORD_ERROR'}". Your clue is: "${clue || 'CLUE_ERROR'}". Subtly guide the team to the secret word. If the team locks in the correct word, Imposters will try to identify YOU. If they fail, your team wins big! If they succeed, the Imposters get points.`;
    case "Imposter":
      return `Your Role: Imposter 👺\nObjective: You know the secret word: "${targetWord || 'TARGET_WORD_ERROR'}". Blend in and mislead the team. Try to get them to eliminate the secret word or lock in a wrong word. If the team *does* lock in the correct word, you and any other Imposters will get a chance to identify the Helper to steal the win or gain points.`;
    case "ClueHolder":
      return `Your Role: Clue Holder 🧩\nObjective: You do NOT know the secret word. Your clue is: "${clue || 'CLUE_ERROR'}". Use your clue to help the group identify the secret word and the Imposters.`;
    default:
      return "Role information not available.";
  }
}

export const initialGameState = (gameId: string, hostPlayer: Player): GameState => ({
  gameId,
  players: [{ ...hostPlayer, score: 0, isRevealedImposter: false, clue: null, isAlive: true }],
  status: "lobby" as GameStatus,
  words: [],
  targetWord: "",
  hostId: hostPlayer.id,
  eliminationCount: 0,
  maxEliminations: 3,
  lockedInWordGuess: null,
  winner: null, // Firestore accepts null, not undefined
  winningReason: "",
  gameLog: [`Game ${gameId} created by ${hostPlayer.name}. Waiting for ${4}-${8} players.`], // Updated default players
  chatMessages: [],
  minPlayers: 4, 
  maxPlayers: 8, 
  actualPlayerCount: 1,
});

export function calculateScores(gameState: GameState): Player[] {
  const { players, winner, winningReason, words, lockedInWordGuess, targetWord } = gameState;
  let updatedPlayers = players.map(p => ({ ...p, score: p.score || 0 }));

  const helper = updatedPlayers.find(p => p.role === 'Helper');
  const imposters = updatedPlayers.filter(p => p.role === 'Imposter');
  const goodTeamPlayers = updatedPlayers.filter(p => p.role !== 'Imposter');

  if (winner === 'Team') { // "Team" means non-imposters collectively won the round's main objective
    const wrongEliminations = words.filter(w => w.isEliminated && !w.isTarget).length;
    
    if (winningReason?.includes("Key:PERFECT_GAME")) { // Perfect game (no wrong elims, helper hidden)
      goodTeamPlayers.forEach(gtPlayer => {
        const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
        if (playerToUpdate) playerToUpdate.score += (playerToUpdate.id === helper?.id ? 5 : 5); // All good team +5
      });
    } else if (winningReason?.includes("Key:HELPER_EXPOSED")) { // Word guessed, but Helper exposed
      goodTeamPlayers.forEach(gtPlayer => {
        if (gtPlayer.id !== helper?.id) { // Exposed Helper doesn't get these team points
          const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
          if (playerToUpdate) playerToUpdate.score += 1;
        }
      });
      imposters.forEach(imp => {
        const playerToUpdate = updatedPlayers.find(p => p.id === imp.id);
        if (playerToUpdate) playerToUpdate.score += 3;
      });
    } else if (winningReason?.includes("Key:HELPER_HIDDEN")) { // Word guessed, Helper NOT exposed
      goodTeamPlayers.forEach(gtPlayer => {
        const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
        if (playerToUpdate) {
          playerToUpdate.score += (playerToUpdate.id === helper?.id ? 3 : 2);
        }
      });
    }
  } else if (winner === 'Imposters') {
    // Covers:
    // - Team loses (wrong word locked in - Key:IMPOSTER_WIN_WRONG_WORD)
    // - Team loses (Communicator eliminated target word - Key:IMPOSTER_WIN_TARGET_ELIMINATED)
    imposters.forEach(imp => {
      const playerToUpdate = updatedPlayers.find(p => p.id === imp.id);
      if (playerToUpdate) playerToUpdate.score += 2;
    });
  }
  
  return updatedPlayers;
}
