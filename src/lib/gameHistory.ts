/**
 * @fileOverview Utility functions for managing lobby-level game history
 * to ensure unique content across multiple games in the same lobby.
 */

export interface GameHistory {
  usedDescriptions: string[];
  usedThemes: string[];
  gameCount: number;
  lastTheme?: string;
}

export interface LobbyGameHistory {
  [lobbyId: string]: GameHistory;
}

// In-memory storage for lobby game histories
// In production, this should be stored in a database or Redis
const lobbyHistories: LobbyGameHistory = {};

/**
 * Get the game history for a specific lobby
 */
export function getLobbyGameHistory(lobbyId: string): GameHistory {
  if (!lobbyHistories[lobbyId]) {
    lobbyHistories[lobbyId] = {
      usedDescriptions: [],
      usedThemes: [],
      gameCount: 0,
      lastTheme: undefined,
    };
  }
  return lobbyHistories[lobbyId];
}

/**
 * Update the game history for a specific lobby
 */
export function updateLobbyGameHistory(lobbyId: string, updatedHistory: GameHistory): void {
  lobbyHistories[lobbyId] = updatedHistory;
  
  // Clean up old descriptions if the list gets too long (keep last 20 games worth)
  const maxDescriptions = 80; // 20 games * 4 items average
  if (updatedHistory.usedDescriptions.length > maxDescriptions) {
    lobbyHistories[lobbyId].usedDescriptions = updatedHistory.usedDescriptions.slice(-maxDescriptions);
  }
  
  console.log(`📚 [LOBBY-HISTORY] Updated lobby ${lobbyId}:`, {
    totalGames: updatedHistory.gameCount,
    uniqueItems: updatedHistory.usedDescriptions.length,
    themesUsed: updatedHistory.usedThemes.length,
    lastTheme: updatedHistory.lastTheme,
  });
}

/**
 * Reset game history for a lobby (when lobby is reset or cleared)
 */
export function resetLobbyGameHistory(lobbyId: string): void {
  delete lobbyHistories[lobbyId];
  console.log(`🔄 [LOBBY-HISTORY] Reset history for lobby ${lobbyId}`);
}

/**
 * Clean up histories for lobbies that might be inactive
 * Call this periodically to prevent memory leaks
 */
export function cleanupOldLobbyHistories(activeLobbies: string[]): void {
  const allLobbyIds = Object.keys(lobbyHistories);
  const toDelete = allLobbyIds.filter(id => !activeLobbies.includes(id));
  
  toDelete.forEach(lobbyId => {
    delete lobbyHistories[lobbyId];
  });
  
  if (toDelete.length > 0) {
    console.log(`🧹 [LOBBY-HISTORY] Cleaned up ${toDelete.length} inactive lobby histories`);
  }
}

/**
 * Get statistics about a lobby's game history
 */
export function getLobbyHistoryStats(lobbyId: string): {
  totalGames: number;
  uniqueItemsGenerated: number;
  themesExplored: number;
  currentThemeStreak: number;
} {
  const history = getLobbyGameHistory(lobbyId);
  
  // Calculate theme streak (how many times the same theme was used recently)
  let currentThemeStreak = 0;
  if (history.lastTheme) {
    for (let i = history.usedThemes.length - 1; i >= 0; i--) {
      if (history.usedThemes[i] === history.lastTheme) {
        currentThemeStreak++;
      } else {
        break;
      }
    }
  }
  
  return {
    totalGames: history.gameCount,
    uniqueItemsGenerated: history.usedDescriptions.length,
    themesExplored: new Set(history.usedThemes).size,
    currentThemeStreak,
  };
} 