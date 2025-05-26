import type { Player, Role, GameWord, GameState } from './types';

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
  if (players.length !== 5) {
    throw new Error("Role assignment requires exactly 5 players.");
  }

  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
  const roles: Role[] = ["Communicator", "Helper", "Imposter", "Imposter", "ClueHolder"];

  const updatedPlayers = shuffledPlayers.map((player, index) => {
    const role = roles[index];
    let clue: string | undefined = undefined;

    if (role === "Helper") {
      clue = aiData.helperClue;
    } else if (role === "ClueHolder") {
      clue = aiData.clueHolderClue;
    }

    return {
      ...player,
      role,
      clue,
      isAlive: true,
      hasCalledMeeting: false,
    };
  });

  const gameWords: GameWord[] = aiData.words.map(word => ({
    text: word,
    isTarget: word === aiData.targetWord,
  }));

  // Ensure target word is one of the 9 words
  if (!gameWords.find(w => w.isTarget)) {
      // This case should ideally not happen if AI is consistent
      // As a fallback, make the first word the target if AI fails this.
      if (gameWords.length > 0) gameWords[0].isTarget = true;
      console.warn("Target word from AI was not in the word list. Fallback applied.")
  }


  return { updatedPlayers, gameWords };
}

export function getRoleExplanation(role: Role, targetWord?: string, clue?: string): string {
  switch (role) {
    case "Communicator":
      return "Your Role: Communicator 🕵️‍♂️\nObjective: Observe the other players. Identify the two Imposters and vote them out. You do not know the target word or any clues. Pay attention to how players discuss the words and clues.";
    case "Helper":
      return `Your Role: Helper 💡\nObjective: You know the target word: "${targetWord}". Your clue is: "${clue}". Guide the others to the target word subtly using your clue, pretending you are a Clue Holder. If the Imposters identify you as the Helper, they win!`;
    case "Imposter":
      return `Your Role: Imposter 👺\nObjective: You know the target word: "${targetWord}". Blend in with the Clue Holders. Mislead others. Your main goal is to identify the Helper. If you correctly accuse the Helper, you win. If you are identified by the Communicator and Clue Holders, you lose. You have one chance to accuse someone of being the Helper.`;
    case "ClueHolder":
      return `Your Role: Clue Holder 🧩\nObjective: You do NOT know the target word. Your clue is: "${clue}". Use your clue to help the group identify the target word. Work with the Communicator to find the Imposters.`;
    default:
      return "Role information not available.";
  }
}

export const initialGameState = (gameId: string, hostPlayer: Player): GameState => ({
  gameId,
  players: [hostPlayer],
  status: "lobby",
  words: [],
  targetWord: "",
  hostId: hostPlayer.id,
  accusationsMadeByImposters: 0,
  meetingsCalled: 0,
  maxMeetings: 1, // Each Imposter effectively gets one chance, or one meeting for all.
  gameLog: [`Game ${gameId} created by ${hostPlayer.name}.`],
  chatMessages: [],
});
