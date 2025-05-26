
import type { Player, Role, GameWord, GameState, GameStatus } from './types';

export function generateShortId(length: number = 6): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
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
    return { updatedPlayers: players.map(p => ({...p, role: "ClueHolder", score: p.score || 0, clue: null, isRevealedImposter: false, isAlive: true, isHost: p.isHost || false})), gameWords: [] };
  }

  let rolesToAssign: Role[] = [];
  const imposterCount = playerCount >= 6 ? 2 : 1;
  const clueHolderCount = playerCount - 1 /* Communicator */ - 1 /* Helper */ - imposterCount;

  rolesToAssign.push("Communicator");
  rolesToAssign.push("Helper");
  for (let i = 0; i < imposterCount; i++) rolesToAssign.push("Imposter");
  for (let i = 0; i < clueHolderCount; i++) rolesToAssign.push("ClueHolder");
  
  // Ensure players list is already shuffled before calling this function if needed, or shuffle here.
  // For now, assume `players` param is already shuffled if that's intended.
  const shuffledRoles = [...rolesToAssign].sort(() => Math.random() - 0.5);


  const updatedPlayers = players.map((player, index) => {
    const role = shuffledRoles[index % shuffledRoles.length]; // Use modulo for safety, though lengths should match
    let clue: string | null = null;

    if (role === "Helper") {
      clue = aiData.helperClue;
    } else if (role === "ClueHolder") {
      clue = aiData.clueHolderClue; 
    }

    return {
      ...player,
      role,
      clue: clue,
      isAlive: true,
      score: player.score || 0, 
      isRevealedImposter: false,
    };
  });

  const gameWords: GameWord[] = aiData.words.map(word => ({
    text: word,
    isTarget: word === aiData.targetWord,
    isEliminated: false,
  }));

  if (aiData.words.length > 0 && !gameWords.find(w => w.isTarget)) {
      if (gameWords.length > 0) {
        gameWords[0].isTarget = true; // Fallback if AI target word isn't in its own list
        console.warn("Target word from AI was not in the word list. Fallback applied to first word:", aiData.targetWord, "New target:", gameWords[0].text);
      } else {
        console.error("AI returned empty word list, cannot assign target word.");
      }
  }


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
  players: [{ ...hostPlayer, score: 0, isRevealedImposter: false, clue: null }],
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
});

export function calculateScores(gameState: GameState): Player[] {
  const { players, winner, winningReason, words } = gameState;
  // Ensure scores are always initialized to 0 if not present, and work with a mutable copy.
  let updatedPlayers = players.map(p => ({ ...p, score: p.score || 0 }));

  const helper = updatedPlayers.find(p => p.role === 'Helper');
  const imposters = updatedPlayers.filter(p => p.role === 'Imposter');
  const goodTeamPlayers = updatedPlayers.filter(p => p.role !== 'Imposter'); // Includes Communicator, Helper, ClueHolders

  if (winner === 'Team') {
    const wrongEliminations = words.filter(w => w.isEliminated && !w.isTarget).length;
    // Perfect game: locked in correct word, helper hidden, no wrong eliminations
    const isPerfectGame = wrongEliminations === 0 && winningReason?.includes("Key:HELPER_HIDDEN");

    if (isPerfectGame) {
      goodTeamPlayers.forEach(gtPlayer => {
        const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
        if (playerToUpdate) playerToUpdate.score += 5; // All good team members get +5
      });
    } else if (winningReason?.includes("Key:HELPER_EXPOSED")) {
      // Team wins (word guessed), but Helper was exposed
      goodTeamPlayers.forEach(gtPlayer => {
        if (gtPlayer.id !== helper?.id) { // Exposed Helper doesn't get this point
          const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
          if (playerToUpdate) playerToUpdate.score += 1;
        }
      });
      imposters.forEach(imp => {
        const playerToUpdate = updatedPlayers.find(p => p.id === imp.id);
        if (playerToUpdate) playerToUpdate.score += 3;
      });
    } else if (winningReason?.includes("Key:HELPER_HIDDEN")) { 
      // Standard win: Team guessed word, Helper hidden, not a perfect game
      goodTeamPlayers.forEach(gtPlayer => {
        const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
        if (playerToUpdate) {
          playerToUpdate.score += (gtPlayer.id === helper?.id ? 3 : 2);
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
