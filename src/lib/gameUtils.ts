
import type { Player, Role, GameWord, GameState, GameStatus, AIWordsAndClues } from './types';

export function generateShortId(length: number = 6): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Fisher-Yates shuffle algorithm
export function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array]; // Create a copy to avoid mutating the original
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]]; // Swap elements
  }
  return newArray;
}

export function assignRolesAndClues(
  players: Player[],
  aiData: AIWordsAndClues,
  minPlayers: number,
  maxPlayers: number
): { updatedPlayers: Player[]; gameWords: GameWord[] } {
  const playerCount = players.length;
  if (playerCount < minPlayers || playerCount > maxPlayers) {
    console.error("Role assignment called with unsupported player count:", playerCount);
    return { 
      updatedPlayers: players.map(p => ({
        ...p, 
        role: "ClueHolder" as Role, 
        clue: null, 
        isAlive: true, 
        isRevealedImposter: false, 
        score: p.score || 0,
        isHost: p.isHost || false
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
  
  const shuffledRoles = shuffleArray(rolesToAssign);

  const updatedPlayers = players.map((player, index) => {
    const role = shuffledRoles[index % shuffledRoles.length];
    let clue: string | null = null;

    if (role === "ClueHolder") {
      clue = aiData.clueHolderClue; 
    } else {
      clue = null; // Helper, Communicator, and Imposters do not get the ClueHolderClue
    }

    return {
      ...player, 
      role,
      clue: clue,
      isAlive: true,
      isRevealedImposter: false,
    };
  });

  let gameWords: GameWord[] = aiData.words.map(word => ({
    text: word,
    isTarget: word.toLowerCase() === aiData.targetWord.toLowerCase(),
    isEliminated: false,
  }));

  const targetWordsInGrid = gameWords.filter(w => w.isTarget);
  if (targetWordsInGrid.length === 0 && gameWords.length > 0) {
    console.warn("Target word from AI was not in the word list or matched incorrectly. Fallback: setting first word as target.");
    gameWords.forEach(w => w.isTarget = false); // Reset all targets
    const randomIndex = Math.floor(Math.random() * gameWords.length);
    gameWords[randomIndex].isTarget = true; // Assign a random target if AI fails
    aiData.targetWord = gameWords[randomIndex].text; // Update aiData to reflect this change
  } else if (targetWordsInGrid.length > 1) {
     console.warn("Multiple target words found in grid. Fallback: keeping only the first match as target.");
     let foundFirstTarget = false;
     gameWords.forEach(w => {
        if (w.isTarget) {
            if (foundFirstTarget) w.isTarget = false;
            else {
              foundFirstTarget = true;
              aiData.targetWord = w.text; // Ensure aiData reflects the single target
            }
        }
     });
  }
  
  // Shuffle the game words for display after target is confirmed
  gameWords = shuffleArray(gameWords);

  return { updatedPlayers, gameWords };
}

export function getRoleExplanation(role: Role, targetWord?: string, clue?: string | null): string {
  switch (role) {
    case "Communicator":
      return `Your Role: Communicator 🕵️‍♂️\nObjective: You are known to all. Lead the discussion. You will choose up to 3 words to eliminate from the grid. Crucially, you will also make the final decision on which word the team believes is the secret word. If the secret word is eliminated, or you confirm the wrong word, your team loses.`;
    case "Helper":
      return `Your Role: Helper 💡\nObjective: You know the secret word: "${targetWord || 'TARGET_WORD_ERROR'}". You do NOT have a specific clue to share. Subtly guide the team and the Communicator to the secret word. If the team (via the Communicator) confirms the correct word, Imposters will try to identify YOU. If they fail, your team wins big! If they succeed, the Imposters get points.`;
    case "Imposter":
      return `Your Role: Imposter 👺\nObjective: You know the secret word: "${targetWord || 'TARGET_WORD_ERROR'}". Blend in and mislead the team. Try to get them to eliminate the secret word or have the Communicator confirm a wrong word. If the team *does* confirm the correct word, you and any other Imposters will get a chance to identify the Helper to steal the win or gain points.`;
    case "ClueHolder":
      return `Your Role: Clue Holder 🧩\nObjective: You do NOT know the secret word. Your single, vague clue is: "${clue || 'CLUE_ERROR'}". Use this word to help the group identify the secret word and the Imposters. Remember, this clue might relate to multiple words on the board!`;
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
  winner: null, 
  winningReason: "",
  gameLog: [`Game ${gameId} created by ${hostPlayer.name}. Waiting for 4-8 players.`],
  chatMessages: [],
  minPlayers: 4, 
  maxPlayers: 8, 
  actualPlayerCount: 1,
  playerScoresBeforeRound: { [hostPlayer.id]: 0 },
});

export function calculateScores(gameState: GameState): Player[] {
  const { players, winner, winningReason, words, lockedInWordGuess, targetWord } = gameState;
  let updatedPlayers = players.map(p => ({ ...p, score: p.score || 0 }));

  const helper = updatedPlayers.find(p => p.role === 'Helper');
  const imposters = updatedPlayers.filter(p => p.role === 'Imposter');
  const goodTeamPlayers = updatedPlayers.filter(p => p.role !== 'Imposter'); // Communicator, Helper, ClueHolders

  if (winningReason?.includes("Key:PERFECT_GAME")) { // Team wins, Helper hidden, no wrong elims
    goodTeamPlayers.forEach(gtPlayer => {
      const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
      if (playerToUpdate) playerToUpdate.score += (playerToUpdate.id === helper?.id ? 5 : 5); // All team (including helper) get +5 for perfect
    });
  } else if (winningReason?.includes("Key:HELPER_EXPOSED")) { // Team guessed word, Imposter found Helper
    goodTeamPlayers.forEach(gtPlayer => {
      if (gtPlayer.id !== helper?.id) { 
        const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
        if (playerToUpdate) playerToUpdate.score += 1;
      }
    });
    imposters.forEach(imp => {
      const playerToUpdate = updatedPlayers.find(p => p.id === imp.id);
      if (playerToUpdate) playerToUpdate.score += 3;
    });
  } else if (winningReason?.includes("Key:HELPER_HIDDEN")) { // Team guessed word, Imposter failed to find Helper
    goodTeamPlayers.forEach(gtPlayer => {
      const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
      if (playerToUpdate) {
        playerToUpdate.score += (playerToUpdate.id === helper?.id ? 3 : 2);
      }
    });
  } else if (winningReason?.includes("Key:IMPOSTER_WIN_WRONG_WORD") || winningReason?.includes("Key:IMPOSTER_WIN_TARGET_ELIMINATED") || winningReason?.includes("Key:IMPOSTER_WIN_COMM_WRONG_CONFIRM")) {
    imposters.forEach(imp => {
      const playerToUpdate = updatedPlayers.find(p => p.id === imp.id);
      if (playerToUpdate) playerToUpdate.score += 2;
    });
  }
  
  return updatedPlayers;
}

    