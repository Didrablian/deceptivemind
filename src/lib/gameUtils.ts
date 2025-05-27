
import type { Player, Role, GameItem, GameState, GameStatus, AIGameDataOutput, GameMode } from './types';

export function generateShortId(length: number = 6): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export function assignRolesAndClues(
  players: Player[],
  aiData: AIGameDataOutput,
  minPlayers: number,
  maxPlayers: number,
  gameMode: GameMode,
  numberOfItems: number
): { updatedPlayers: Player[]; gameItems: GameItem[] } {
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
      gameItems: [] 
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
      clue = null;
    }

    return {
      ...player, 
      role,
      clue: clue,
      isAlive: true,
      isRevealedImposter: false,
    };
  });

  let gameItems: GameItem[] = aiData.items.map(item => ({
    text: item.text,
    imageUrl: item.imageUrl, // Will be undefined if item doesn't have imageUrl (e.g. word mode)
    isTarget: item.text.toLowerCase() === aiData.targetItemDescription.toLowerCase(),
    isEliminated: false,
  }));

  const targetItemsInGrid = gameItems.filter(w => w.isTarget);
  if (targetItemsInGrid.length === 0 && gameItems.length > 0) {
    console.warn("Target item from AI was not in the item list or matched incorrectly. Fallback: setting random item as target.");
    gameItems.forEach(w => w.isTarget = false); 
    const randomIndex = Math.floor(Math.random() * gameItems.length);
    gameItems[randomIndex].isTarget = true;
    aiData.targetItemDescription = gameItems[randomIndex].text; 
  } else if (targetItemsInGrid.length > 1) {
     console.warn("Multiple target items found in grid. Fallback: keeping only the first match as target.");
     let foundFirstTarget = false;
     gameItems.forEach(item => {
        if (item.isTarget) {
            if (foundFirstTarget) item.isTarget = false;
            else {
              foundFirstTarget = true;
              aiData.targetItemDescription = item.text; 
            }
        }
     });
  }
  
  gameItems = shuffleArray(gameItems);

  return { updatedPlayers, gameItems };
}

export function getRoleExplanation(role: Role, targetItemDescription?: string, clue?: string | null, gameMode?: GameMode): string {
  const itemType = gameMode === 'images' ? "secret item/object" : "secret word";
  const targetText = targetItemDescription || (gameMode === 'images' ? 'TARGET_OBJECT_ERROR' : 'TARGET_WORD_ERROR');
  
  switch (role) {
    case "Communicator":
      return `Your Role: Communicator 🕵️‍♂️\nObjective: You are known to all. Lead the discussion. You will choose up to 3 items to eliminate from the grid. Crucially, you will also make the final decision on which item the team believes is the ${itemType}. If the ${itemType} is eliminated, or you confirm the wrong item, your team loses.`;
    case "Helper":
      return `Your Role: Helper 💡\nObjective: You know the ${itemType}: "${targetText}". You do NOT have a specific clue to share. Subtly guide the team and the Communicator to the ${itemType}. If the team (via the Communicator) confirms the correct ${itemType}, Imposters will try to identify YOU. If they fail, your team wins big! If they succeed, the Imposters get points.`;
    case "Imposter":
      return `Your Role: Imposter 👺\nObjective: You know the ${itemType}: "${targetText}". Blend in and mislead the team. Try to get them to eliminate the ${itemType} or have the Communicator confirm a wrong item. If the team *does* confirm the correct ${itemType}, you and any other Imposters will get a chance to identify the Helper to steal the win or gain points.`;
    case "ClueHolder":
      return `Your Role: Clue Holder 🧩\nObjective: You do NOT know the ${itemType}. Your single, vague clue is: "${clue || 'CLUE_ERROR'}". Use this word to help the group identify the ${itemType} and the Imposters. Remember, this clue might relate to multiple items on the board!`;
    default:
      return "Role information not available.";
  }
}

export const initialGameState = (gameId: string, hostPlayer: Player): GameState => ({
  gameId,
  players: [{ ...hostPlayer, score: 0, isRevealedImposter: false, clue: null, isAlive: true }],
  status: "lobby" as GameStatus,
  items: [],
  targetWord: "", // Will store target item's text description
  hostId: hostPlayer.id,
  eliminationCount: 0,
  maxEliminations: 3,
  lockedInWordGuess: null,
  winner: null, 
  winningReason: "",
  gameLog: [`Game ${gameId} created by ${hostPlayer.name}. Configure game settings and start when ready.`],
  chatMessages: [],
  minPlayers: 4, 
  maxPlayers: 8, 
  actualPlayerCount: 1,
  playerScoresBeforeRound: { [hostPlayer.id]: 0 },
  gameMode: 'words' as GameMode, // Default to word mode
  numberOfItems: 9, // Default for word mode
});

export function calculateScores(gameState: GameState): Player[] {
  const { players, winner, winningReason } = gameState; // Removed unused variables
  let updatedPlayers = players.map(p => ({ ...p, score: p.score || 0 }));

  const helper = updatedPlayers.find(p => p.role === 'Helper');
  const imposters = updatedPlayers.filter(p => p.role === 'Imposter');
  const goodTeamPlayers = updatedPlayers.filter(p => p.role !== 'Imposter'); 

  if (winningReason?.includes("Key:PERFECT_GAME")) { 
    goodTeamPlayers.forEach(gtPlayer => {
      const playerToUpdate = updatedPlayers.find(p => p.id === gtPlayer.id);
      if (playerToUpdate) playerToUpdate.score += (playerToUpdate.id === helper?.id ? 5 : 5); 
    });
  } else if (winningReason?.includes("Key:HELPER_EXPOSED")) { 
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
  } else if (winningReason?.includes("Key:HELPER_HIDDEN")) { 
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
