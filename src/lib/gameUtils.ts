
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
  aiData: { targetWord: string; words: string[]; helperClue: string; clueHolderClue: string }
): { updatedPlayers: Player[]; gameWords: GameWord[] } {
  const playerCount = players.length;
  if (playerCount < 4 || playerCount > 8) {
    console.error("Role assignment called with unsupported player count:", playerCount);
    // Fallback to a default or handle error appropriately
    return { updatedPlayers: players.map(p => ({...p, role: "ClueHolder", score: p.score || 0})), gameWords: [] };
  }

  let rolesToAssign: Role[];
  const imposterCount = playerCount >= 6 ? 2 : 1;
  const clueHolderCount = playerCount - 1 /* Communicator */ - 1 /* Helper */ - imposterCount;

  rolesToAssign = ["Communicator", "Helper"];
  for (let i = 0; i < imposterCount; i++) rolesToAssign.push("Imposter");
  for (let i = 0; i < clueHolderCount; i++) rolesToAssign.push("ClueHolder");

  // Shuffle roles to ensure randomness in assignment to shuffled players
  const shuffledRoles = [...rolesToAssign].sort(() => Math.random() - 0.5);
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);


  const updatedPlayers = shuffledPlayers.map((player, index) => {
    const role = shuffledRoles[index];
    let clue: string | null = null;

    if (role === "Helper") {
      clue = aiData.helperClue;
    } else if (role === "ClueHolder") {
      clue = aiData.clueHolderClue; // All ClueHolders get the same clue from AI
    }

    return {
      ...player,
      role,
      clue: clue,
      isAlive: true,
      hasCalledMeeting: false, // This might be obsolete
      score: player.score || 0, // Preserve existing score or default to 0
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
        gameWords[0].isTarget = true;
        console.warn("Target word from AI was not in the word list. Fallback applied to first word.");
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
  players: [{ ...hostPlayer, score: hostPlayer.score || 0, isRevealedImposter: false }],
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
  actualPlayerCount: 1, // Starts with host
});

export function calculateScores(gameState: GameState): Player[] {
  const { players, winner, lockedInWordGuess, targetWord } = gameState;
  let updatedPlayers = players.map(p => ({ ...p })); // Create a mutable copy

  const helper = updatedPlayers.find(p => p.role === 'Helper');
  const imposters = updatedPlayers.filter(p => p.role === 'Imposter');
  const goodTeamPlayers = updatedPlayers.filter(p => p.role !== 'Imposter');

  if (winner === 'Imposters') {
    if (gameState.winningReason?.includes("eliminated the secret word")) {
      imposters.forEach(imp => {
        const playerToUpdate = updatedPlayers.find(p => p.id === imp.id);
        if(playerToUpdate) playerToUpdate.score += 2;
      });
    } else if (gameState.winningReason?.includes("locked in the wrong word")) {
       imposters.forEach(imp => {
        const playerToUpdate = updatedPlayers.find(p => p.id === imp.id);
        if(playerToUpdate) playerToUpdate.score += 2;
      });
    } else if (gameState.winningReason?.includes("Helper exposed")) {
      imposters.forEach(imp => {
        const playerToUpdate = updatedPlayers.find(p => p.id === imp.id);
        if(playerToUpdate) playerToUpdate.score += 3;
      });
      // Team (excluding helper) might still get some points if specified, for now, only imposters
      goodTeamPlayers.forEach(gtPlayer => {
        if (gtPlayer.id !== helper?.id) {
          const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
          if(playerToUpdate) playerToUpdate.score += 1; // Team wins (Helper exposed) team part
        }
      });
    }
  } else if (winner === 'Team') {
    const isHelperHidden = !gameState.winningReason?.includes("Helper exposed"); // This condition seems inverted from rules
    // Based on new rules: "If they’re wrong → Team wins" (Helper NOT exposed implies team wins)

    if (isHelperHidden) { // Helper successfully hidden
      goodTeamPlayers.forEach(gtPlayer => {
         const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
         if(playerToUpdate) playerToUpdate.score += (gtPlayer.id === helper?.id ? 3 : 2);
      });
      // Check for perfect game
      const wrongEliminations = gameState.words.filter(w => w.isEliminated && !w.isTarget).length;
      if (wrongEliminations === 0) {
        goodTeamPlayers.forEach(gtPlayer => {
          const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
          // Points are additive: +2/+3 initially, then +2 for perfect game (total +5 for helper, +4 for others)
          // Or if total is +5:
          if (playerToUpdate) playerToUpdate.score = (gtPlayer.id === helper?.id ? 5 : 5); // Overwrites previous points for simplicity. Revisit if additive.
        });
      }
    }
    // If team wins because Imposters failed to expose helper, score is handled above.
  }
  return updatedPlayers;
}
