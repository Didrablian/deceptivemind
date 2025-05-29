
import type { Player, Role, GameItem, GameState, GameStatus, AIGameDataOutput, GameMode, GameType, RoleHW, GameRole, GamePhase, PlayerTHW, AIGameDataOutputHW } from './types';

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

// For Deceptive Minds
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
    console.error("Role assignment called with unsupported player count for Deceptive Minds:", playerCount);
    return {
      updatedPlayers: players.map(p => ({
        ...p,
        role: "ClueHolder" as Role,
        clue: null,
        isAlive: true,
        isRevealedImposter: false,
        score: p.score || 0,
        isHost: p.isHost || false,
        secretItemKnowledge: null,
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

    if (role === "ClueHolder") { // Only ClueHolder gets the textual clue
      clue = aiData.clueHolderClue;
    } else { // Communicator, Helper, Imposter get no specific clue text
      clue = null;
    }

    return {
      ...player,
      role,
      clue: clue,
      isAlive: true,
      isRevealedImposter: false,
      secretItemKnowledge: (role === "Helper" || role === "Imposter") ? aiData.targetItemDescription : null,
    };
  });

  let gameItems: GameItem[] = aiData.items.map(item => ({
    text: item.text,
    imageUrl: item.imageUrl,
    isTarget: item.text.toLowerCase() === aiData.targetItemDescription.toLowerCase(),
    isEliminated: false,
  }));

  // Validate and potentially fix target item assignment
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

// For The Hidden Word
export function assignRolesHW(
  players: PlayerTHW[],
  aiData: AIGameDataOutputHW,
  minPlayers: number,
  maxPlayers: number
): PlayerTHW[] {
  const playerCount = players.length;
   if (playerCount < minPlayers || playerCount > maxPlayers) {
    console.error("Role assignment called with unsupported player count for The Hidden Word:", playerCount);
    return players.map(p => ({ ...p, role: "Villager" as RoleHW, isAlive: true, secretItemKnowledge: aiData.secretItem }));
  }

  let rolesToAssign: RoleHW[] = [];
  const imposterCount = playerCount >= 7 ? 2 : 1; // Example: 1 imposter for <7, 2 for 7+
  const jesterCount = 1; // Always one jester
  const villagerCount = playerCount - imposterCount - jesterCount;

  for (let i = 0; i < imposterCount; i++) rolesToAssign.push("ImposterHW");
  if (jesterCount > 0) rolesToAssign.push("Jester");
  for (let i = 0; i < villagerCount; i++) rolesToAssign.push("Villager");

  const shuffledRoles = shuffleArray(rolesToAssign);

  return players.map((player, index) => {
    const role = shuffledRoles[index % shuffledRoles.length];
    return {
      ...player,
      role,
      isAlive: true,
      secretItemKnowledge: role === "Villager" ? aiData.secretItem : null,
    };
  });
}


export function getRoleExplanation(
  role: GameRole,
  targetItemDescription?: string | null,
  clue?: string | null,
  gameMode?: GameMode,
  gameType?: GameType
): string {
  
  if (gameType === 'hiddenWord') {
    const secretItemText = targetItemDescription || 'SECRET_ITEM_ERROR';
    switch (role as RoleHW) {
      case "Villager":
        return `Your Role: Villager 🛡️\nObjective: You know the secret item: "${secretItemText}". Work with other Villagers to identify and execute the Imposters before they outnumber you. Do not reveal the secret item directly!`;
      case "ImposterHW":
        return `Your Role: Imposter 💀\nObjective: You do NOT know the secret item. Blend in with the Villagers, pretend you know the item, and try to mislead them. Each night, you (and other Imposters) will secretly vote to kill a player. Survive until Imposters equal or outnumber Villagers.`;
      case "Jester":
        return `Your Role: Jester 🃏\nObjective: You do NOT know the secret item. Your goal is to get yourself executed during the Interrogation/Voting phase. If you succeed, you win the game instantly, regardless of Villagers or Imposters!`;
      default:
        return "Role information not available for The Hidden Word.";
    }
  } else { // Deceptive Minds
    const itemType = gameMode === 'images' ? "secret item/object" : "secret word";
    const targetText = targetItemDescription || (gameMode === 'images' ? 'TARGET_OBJECT_ERROR' : 'TARGET_WORD_ERROR');
    switch (role as Role) {
      case "Communicator":
        return `Your Role: Communicator 🕵️‍♂️\nObjective: Your role is known. Lead the discussion, eliminate up to 3 decoys from the grid, and make the team's final decision by confirming which item is the ${itemType}. If the true ${itemType} is eliminated, or you confirm the wrong one, your team loses.`;
      case "Helper":
        return `Your Role: Helper 💡\nObjective: You know the ${itemType}: "${targetText}". You do not receive a text clue. Subtly guide the team and the Communicator to the ${itemType}. If the team (via the Communicator) confirms the correct ${itemType}, Imposters will try to identify YOU. If they fail, your team wins big! If they succeed, Imposters get points.`;
      case "Imposter":
        return `Your Role: Imposter 👺\nObjective: You know the ${itemType}: "${targetText}". Blend in and mislead the team. Try to get them to eliminate the ${itemType} or have the Communicator confirm a wrong one. If the team *does* confirm the correct ${itemType}, you and any other Imposters will get a chance to identify the Helper.`;
      case "ClueHolder":
        return `Your Role: Clue Holder 🧩\nObjective: You do NOT know the ${itemType}. Your single, vague, one-word clue is: "${clue || 'CLUE_ERROR'}". Use this clue to help the group identify the ${itemType} and the Imposters. Remember, this clue might relate to multiple items on the board!`;
      default:
        return "Role information not available for Deceptive Minds.";
    }
  }
}

export const initialGameState = (
  gameId: string,
  hostPlayer: Player,
  gameType: GameType = 'deceptiveMinds' // Default to Deceptive Minds
): GameState => {
  if (gameType === 'hiddenWord') {
    return {
      gameId,
      gameType: 'hiddenWord',
      players: [{ ...hostPlayer, score: 0, isRevealedImposter: false, clue: null, isAlive: true, secretItemKnowledge: null, role: 'Villager' as RoleHW, gameSpecific: { hasVotedTHW: false }}],
      status: "lobby" as GamePhase,
      items: [], // Not used directly by THW core logic, but structure kept for GameItem
      targetWord: "", // Not used for THW, use secretItemHW
      hostId: hostPlayer.id,
      eliminationCount: 0, // DM specific
      maxEliminations: 0, // DM specific
      lockedInWordGuess: null, // DM specific
      winner: null,
      winningReason: "",
      gameLog: [`Game ${gameId} (The Hidden Word) created by ${hostPlayer.name}.`],
      chatMessages: [],
      minPlayers: 4, // THW specific
      maxPlayers: 7, // THW specific
      actualPlayerCount: 1,
      playerScoresBeforeRound: { [hostPlayer.id]: 0 },
      gameMode: null, // DM specific, set to null for THW
      numberOfItems: 0, // DM specific, set to 0 for THW
      // THW specific fields
      secretItemHW: null,
      currentRoundTHW: 1,
      timerDeadline: null,
      activeInterrogationTHW: null,
      interrogationVotesTHW: {},
    };
  }
  // Default to Deceptive Minds
  return {
    gameId,
    gameType: 'deceptiveMinds',
    players: [{ ...hostPlayer, score: 0, isRevealedImposter: false, clue: null, isAlive: true, secretItemKnowledge: null, role: 'ClueHolder' as Role, gameSpecific: null }],
    status: "lobby" as GamePhase,
    items: [],
    targetWord: "",
    hostId: hostPlayer.id,
    eliminationCount: 0,
    maxEliminations: 3,
    lockedInWordGuess: null,
    winner: null,
    winningReason: "",
    gameLog: [`Game ${gameId} (Deceptive Minds) created by ${hostPlayer.name}.`],
    chatMessages: [],
    minPlayers: 4,
    maxPlayers: 8,
    actualPlayerCount: 1,
    playerScoresBeforeRound: { [hostPlayer.id]: 0 },
    gameMode: 'words' as GameMode,
    numberOfItems: 9,
    // THW fields set to null or default for DM
    secretItemHW: null,
    currentRoundTHW: 0,
    timerDeadline: null,
    activeInterrogationTHW: null,
    interrogationVotesTHW: null,
  };
};


export function calculateScores(gameState: GameState): Player[] {
  const { players, winner, winningReason } = gameState;
  let updatedPlayers = players.map(p => ({ ...p, score: p.score || 0 }));

  if (gameState.gameType === 'deceptiveMinds') {
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
  } else if (gameState.gameType === 'hiddenWord') {
    // Scoring for The Hidden Word
    if (winner === 'Jester') {
      const jester = updatedPlayers.find(p => p.role === 'Jester');
      if (jester) jester.score += 5; // Example: Jester gets 5 points
    } else if (winner === 'Villagers') {
      updatedPlayers.forEach(p => {
        if (p.role === 'Villager') p.score += 2; // Villagers get 2 points
      });
    } else if (winner === 'ImpostersHW') {
      updatedPlayers.forEach(p => {
        if (p.role === 'ImposterHW') p.score += 3; // Imposters get 3 points
      });
    }
  }

  return updatedPlayers;
}

export function checkTHWWinConditions(players: PlayerTHW[], executedPlayerId?: string): { winner?: 'Villagers' | 'ImpostersHW' | 'Jester'; message?: string } {
  const alivePlayers = players.filter(p => p.isAlive);
  const aliveVillagers = alivePlayers.filter(p => p.role === 'Villager');
  const aliveImposters = alivePlayers.filter(p => p.role === 'ImposterHW');

  // Jester wins if executed
  if (executedPlayerId) {
    const executedPlayer = players.find(p => p.id === executedPlayerId);
    if (executedPlayer?.role === 'Jester') {
      return { winner: 'Jester', message: `${executedPlayer.name} (The Jester) was executed and wins!` };
    }
  }

  // Imposters win if they equal or outnumber Villagers (and there are imposters left)
  if (aliveImposters.length > 0 && aliveImposters.length >= aliveVillagers.length) {
    return { winner: 'ImpostersHW', message: 'Imposters have overwhelmed the Villagers and win!' };
  }

  // Villagers win if all Imposters are eliminated
  if (aliveImposters.length === 0 && aliveVillagers.length > 0) {
    return { winner: 'Villagers', message: 'All Imposters have been eliminated! Villagers win!' };
  }
  
  // Villagers also win if all Imposters AND Jester are eliminated, and villagers remain
  if (aliveImposters.length === 0 && alivePlayers.every(p => p.role === 'Villager')) {
      return { winner: 'Villagers', message: 'All threats have been eliminated! Villagers win!' };
  }


  return {}; // No winner yet
}

    