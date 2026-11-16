/**
 * Global Stateの初期構造を生成するファクトリ関数
 */
export function createInitialState() {
  return {
    config: {
      npcCount: 6,
      initialStack: 100000, // 100.0 BB
      sbAmount: 500,        // 0.5 BB
      bbAmount: 1000        // 1.0 BB
    },
    gameStatus: 'LOBBY',    // 'LOBBY' | 'PLAYING' | 'HAND_RESULT' | 'GAME_OVER'
    phase: 'PREFLOP',       // 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN'
    isFastForwarding: false,

    table: {
      deck: [],
      communityCards: [],
      dealerSeatIndex: 0,
      currentTurnIndex: -1,
      highestBet: 0,
      lastRaiseDiff: 1000,
      pots: [{ amount: 0, eligiblePlayerIds: [] }],
      actionLogs: []
    },

    players: [],

    uiControl: {
      isPlayerTurn: false,
      canCheck: false,
      callAmount: 0,
      minRaiseAmount: 2000,
      maxRaiseAmount: 100000
    },

    resultData: {
      winners: [],
      showdownPlayers: []
    }
  };
}