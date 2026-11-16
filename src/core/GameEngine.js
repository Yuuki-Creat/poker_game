import { store } from '../state/Store.js';
import { AI_STRATEGIES, MIN_CHIP_UNIT } from '../constants.js';
import { Deck } from './Deck.js';
import { HandEvaluator } from './HandEvaluator.js';
import { PotManager } from './PotManager.js';
import { AIController } from './AIController.js';
import { formatBB, roundToChipUnit } from '../utils/currency.js';

/**
 * ゲーム進行・フェーズ遷移・ベッティングラウンド・早送り処理を統括するコアエンジン
 */
export class GameEngine {
  constructor() {
    this.npcTimer = null;
  }

  /**
   * 新規ゲームセッションの開始（ロビーから開始）
   */
  startNewGame(npcCount) {
    this.clearTimers();

    store.update(state => {
      state.config.npcCount = npcCount;
      state.gameStatus = 'PLAYING';
      state.table.dealerSeatIndex = 0;
      state.table.actionLogs = [];

      // プレイヤー配列の生成（0番目が人間、1〜N番目がNPC）
      const players = [];
      players.push(this.createPlayerObject('player_0', 'YOU', 0, true, state.config.initialStack, null));

      for (let i = 1; i <= npcCount; i++) {
        const randomStrategy = AI_STRATEGIES[Math.floor(Math.random() * AI_STRATEGIES.length)];
        players.push(
          this.createPlayerObject(`npc_${i}`, `NPC ${i}`, i, false, state.config.initialStack, randomStrategy)
        );
      }

      state.players = players;
    });

    this.startNewHand();
  }

  createPlayerObject(id, name, seatIndex, isHuman, stack, aiStrategy) {
    return {
      id,
      name,
      seatIndex,
      isHuman,
      stack,
      currentBet: 0,
      totalInvested: 0,
      cards: [],
      status: 'ACTIVE', // 'ACTIVE' | 'FOLDED' | 'ALL_IN' | 'BUSTED'
      hasActed: false,
      currentHandRank: { id: 0, name: '待機中', score: 0, bestFiveCards: [] },
      lastActionText: '',
      aiStrategy,
      isStrategyRevealed: false
    };
  }

  /**
   * 新しいハンドの開始（カード配布・ブラインド徴収・リアルタイム役計算の即時同期）
   */
  startNewHand() {
    this.clearTimers();

    store.update(state => {
      // 破産したNPCにリバイ（100BB補充）し、新しい戦略をランダム割り当て
      for (const p of state.players) {
        if (!p.isHuman && p.stack <= 0) {
          p.stack = state.config.initialStack;
          p.aiStrategy = AI_STRATEGIES[Math.floor(Math.random() * AI_STRATEGIES.length)];
        }
        p.currentBet = 0;
        p.totalInvested = 0;
        p.cards = [];
        p.status = p.stack > 0 ? 'ACTIVE' : 'BUSTED';
        p.hasActed = false;
        p.lastActionText = '';
        p.isStrategyRevealed = false;
      }

      state.gameStatus = 'PLAYING';
      state.phase = 'PREFLOP';
      state.isFastForwarding = false;
      state.resultData = { winners: [], showdownPlayers: [] };

      // ディーラーボタンを1つ進める
      const totalSeats = state.players.length;
      state.table.dealerSeatIndex = (state.table.dealerSeatIndex + 1) % totalSeats;

      // デッキ生成とホールカード2枚の配布
      const deck = Deck.createShuffledDeck();
      state.table.communityCards = [];

      for (const p of state.players) {
        if (p.status === 'ACTIVE') {
          p.cards = [deck.pop(), deck.pop()];
          // カード配布と同時に現在の役（ワンペア or ハイカード）を即座に計算してStateに格納
          p.currentHandRank = HandEvaluator.evaluateCurrentHand(p.cards, []);
        }
      }
      state.table.deck = deck;

      // ブラインド（SB / BB）の強制ベット
      const dealerIdx = state.table.dealerSeatIndex;
      const sbIdx = totalSeats === 2 ? dealerIdx : (dealerIdx + 1) % totalSeats;
      const bbIdx = totalSeats === 2 ? (dealerIdx + 1) % totalSeats : (dealerIdx + 2) % totalSeats;

      this.postBlind(state, sbIdx, state.config.sbAmount, 'SB');
      this.postBlind(state, bbIdx, state.config.bbAmount, 'BB');

      state.table.highestBet = state.config.bbAmount;
      state.table.lastRaiseDiff = state.config.bbAmount;
      state.table.pots = PotManager.calculatePots(state.players);

      // プリフロップの最初の手番はBBの左隣（UTG）
      state.table.currentTurnIndex = (bbIdx + 1) % totalSeats;
      this.addLog(state, `--- 新規ハンド開始 (BTN: ${state.players[dealerIdx].name}) ---`);
      this.syncUIControlState(state);
    });

    this.processTurnFlow();
  }

  postBlind(state, seatIdx, amount, label) {
    const player = state.players[seatIdx];
    const actual = Math.min(player.stack, amount);
    player.stack -= actual;
    player.currentBet = actual;
    player.totalInvested += actual;
    if (player.stack === 0) player.status = 'ALL_IN';
    player.lastActionText = `${label} ${formatBB(actual)} BB`;
  }

  /**
   * ターン進行制御（通常進行 vs Fold後のファストフォワード）
   */
  processTurnFlow() {
    const state = store.getState();
    if (state.gameStatus !== 'PLAYING') return;

    // プレイヤーがFold済みの場合はUI通知をミュートしてショーダウンまで一括計算
    if (state.isFastForwarding) {
      store.batchUpdate(batchState => {
        let safetyCounter = 0;
        while (batchState.gameStatus === 'PLAYING' && safetyCounter < 200) {
          safetyCounter++;
          if (this.isBettingRoundComplete(batchState)) {
            this.advancePhase(batchState);
          } else {
            const current = batchState.players[batchState.table.currentTurnIndex];
            if (current && current.status === 'ACTIVE') {
              const decision = AIController.decideAction(current, batchState);
              this.applyPlayerAction(batchState, current.seatIndex, decision.type, decision.amount);
            } else {
              this.moveToNextActiveSeat(batchState);
            }
          }
        }
      });
      return;
    }

    // 通常進行時：ベッティングラウンド終了判定
    if (this.isBettingRoundComplete(state)) {
      store.update(s => this.advancePhase(s));
      this.processTurnFlow();
      return;
    }

    const currentPlayer = state.players[state.table.currentTurnIndex];
    if (!currentPlayer || currentPlayer.status !== 'ACTIVE') {
      store.update(s => this.moveToNextActiveSeat(s));
      this.processTurnFlow();
      return;
    }

    // 人間のターンの場合は入力を待つ
    if (currentPlayer.isHuman) {
      store.update(s => this.syncUIControlState(s));
      return;
    }

    // NPCのターンの場合は思考ウェイトを入れて実行
    this.clearTimers();
    this.npcTimer = setTimeout(() => {
      store.update(s => {
        const npc = s.players[s.table.currentTurnIndex];
        if (!npc || npc.isHuman || npc.status !== 'ACTIVE') return;
        const decision = AIController.decideAction(npc, s);
        this.applyPlayerAction(s, npc.seatIndex, decision.type, decision.amount);
      });
      this.processTurnFlow();
    }, 480);
  }

  /**
   * 人間プレイヤーのアクション受付（UIから呼ばれる）
   */
  handleHumanAction(actionType, targetBetAmount = 0) {
    const state = store.getState();
    if (!state.uiControl.isPlayerTurn || state.gameStatus !== 'PLAYING') return;

    store.update(s => {
      this.applyPlayerAction(s, 0, actionType, targetBetAmount);
      // 人間がFoldしたら即座にファストフォワードモードへ移行
      if (actionType === 'FOLD') {
        s.isFastForwarding = true;
      }
    });

    this.processTurnFlow();
  }

  /**
   * プレイヤー（人間・NPC共通）のアクションをStateへ適用する
   */
  applyPlayerAction(state, seatIndex, type, amount) {
    const player = state.players[seatIndex];
    player.hasActed = true;

    if (type === 'FOLD') {
      player.status = 'FOLDED';
      player.lastActionText = 'Fold';
      this.addLog(state, `${player.name}: Fold`);
    } else if (type === 'CHECK') {
      player.lastActionText = 'Check';
      this.addLog(state, `${player.name}: Check`);
    } else if (type === 'CALL') {
      const toCall = Math.min(player.stack, state.table.highestBet - player.currentBet);
      player.stack -= toCall;
      player.currentBet += toCall;
      player.totalInvested += toCall;
      if (player.stack === 0) player.status = 'ALL_IN';
      player.lastActionText = player.status === 'ALL_IN' ? 'All-In Call' : `Call ${formatBB(player.currentBet)} BB`;
      this.addLog(state, `${player.name}: ${player.lastActionText}`);
    } else if (type === 'RAISE') {
      // amount はレイズ後のトータルベット額（ミリBB）
      const sanitizedTotal = roundToChipUnit(amount);
      const maxPossibleTotal = player.currentBet + player.stack;
      const finalTotalBet = Math.min(sanitizedTotal, maxPossibleTotal);
      const addedChips = finalTotalBet - player.currentBet;

      const raiseDiff = finalTotalBet - state.table.highestBet;
      // 見直し②対応：正規の最小レイズ幅以上のレイズ（またはAll-in）だった場合のみlastRaiseDiffを更新
      if (raiseDiff >= state.table.lastRaiseDiff) {
        state.table.lastRaiseDiff = raiseDiff;
      }

      if (finalTotalBet > state.table.highestBet) {
        state.table.highestBet = finalTotalBet;
        // 他プレイヤーの行動済みフラグをリセット
        for (const p of state.players) {
          if (p.id !== player.id && p.status === 'ACTIVE') {
            p.hasActed = false;
          }
        }
      }

      player.stack -= addedChips;
      player.currentBet = finalTotalBet;
      player.totalInvested += addedChips;
      if (player.stack === 0) player.status = 'ALL_IN';

      player.lastActionText = player.status === 'ALL_IN'
        ? `All-In ${formatBB(finalTotalBet)} BB`
        : `Raise to ${formatBB(finalTotalBet)} BB`;
      this.addLog(state, `${player.name}: ${player.lastActionText}`);
    }

    state.table.pots = PotManager.calculatePots(state.players);
    this.moveToNextActiveSeat(state);
    this.syncUIControlState(state);
  }

  /**
   * 現在のベッティングラウンドが完了したかを判定
   */
  isBettingRoundComplete(state) {
    const nonFolded = state.players.filter(p => p.status !== 'FOLDED' && p.status !== 'BUSTED');
    // 全員フォールドして最後の1人になった場合は即時決着へ
    if (nonFolded.length <= 1) return true;

    const activePlayers = state.players.filter(p => p.status === 'ACTIVE');
    if (activePlayers.length === 0) return true;

    return activePlayers.every(p => p.hasActed && p.currentBet === state.table.highestBet);
  }

  /**
   * 次のフェーズ（FLOP / TURN / RIVER / SHOWDOWN）へ進める
   * コミュニティカード追加と同時に全生存プレイヤーの役を再計算し、1フレーム内で同期させる
   */
  advancePhase(state) {
    const nonFolded = state.players.filter(p => p.status !== 'FOLDED' && p.status !== 'BUSTED');

    // 1人を除いて全員Foldした場合はショーダウンを待たずに即時ポット授与
    if (nonFolded.length === 1) {
      this.resolveHand(state, false);
      return;
    }

    // ストリート進行に伴うベット額リセット
    for (const p of state.players) {
      p.currentBet = 0;
      p.hasActed = false;
      if (p.status === 'ACTIVE') p.lastActionText = '';
    }
    state.table.highestBet = 0;
    state.table.lastRaiseDiff = state.config.bbAmount;

    if (state.phase === 'PREFLOP') {
      state.phase = 'FLOP';
      state.table.communityCards.push(
        state.table.deck.pop(),
        state.table.deck.pop(),
        state.table.deck.pop()
      );
      this.addLog(state, '=== FLOP ===');
    } else if (state.phase === 'FLOP') {
      state.phase = 'TURN';
      state.table.communityCards.push(state.table.deck.pop());
      this.addLog(state, '=== TURN ===');
    } else if (state.phase === 'TURN') {
      state.phase = 'RIVER';
      state.table.communityCards.push(state.table.deck.pop());
      this.addLog(state, '=== RIVER ===');
    } else if (state.phase === 'RIVER') {
      state.phase = 'SHOWDOWN';
      this.resolveHand(state, true);
      return;
    }

    // コミュニティカード公開と同時に、全プレイヤーの現在の役・ハイライト対象カードを即時更新
    for (const p of state.players) {
      if (p.cards.length > 0) {
        p.currentHandRank = HandEvaluator.evaluateCurrentHand(p.cards, state.table.communityCards);
      }
    }

    // アクティブ（All-inではない）プレイヤーが1人以下なら、残りのストリートも自動でめくる
    const activeCount = state.players.filter(p => p.status === 'ACTIVE').length;
    if (activeCount <= 1) {
      this.advancePhase(state);
      return;
    }

    // ポストフロップはディーラーの左隣から開始
    state.table.currentTurnIndex = (state.table.dealerSeatIndex + 1) % state.players.length;
    if (state.players[state.table.currentTurnIndex].status !== 'ACTIVE') {
      this.moveToNextActiveSeat(state);
    }
    this.syncUIControlState(state);
  }

  /**
   * ハンド決着処理（ポット分配・全NPCの戦略バッジアンヴェイル・破産チェック）
   */
  resolveHand(state, isShowdown) {
    state.phase = 'SHOWDOWN';

    // 最終役の確定
    for (const p of state.players) {
      if (p.status !== 'FOLDED' && p.cards.length > 0) {
        p.currentHandRank = HandEvaluator.evaluateCurrentHand(p.cards, state.table.communityCards);
      }
      // ハンド終了時に全NPCの戦略タイプを開示（アンヴェイル）
      if (!p.isHuman) {
        p.isStrategyRevealed = true;
      }
    }

    state.table.pots = PotManager.calculatePots(state.players);
    const winners = PotManager.distributePots(state.table.pots, state.players, state.table.dealerSeatIndex);

    state.resultData = {
      winners,
      showdownPlayers: isShowdown
        ? state.players.filter(p => p.status !== 'FOLDED').map(p => p.id)
        : []
    };

    for (const w of winners) {
      this.addLog(state, `★ ${w.name} が ${formatBB(w.wonAmount)} BB 獲得 (${w.handName})`);
    }

    // 人間プレイヤーの破産（スタック0）判定
    const human = state.players[0];
    if (human.stack <= 0) {
      state.gameStatus = 'GAME_OVER';
      this.addLog(state, '【GAME OVER】スタックが尽きました。');
    } else {
      state.gameStatus = 'HAND_RESULT';
    }

    this.syncUIControlState(state);
  }

  moveToNextActiveSeat(state) {
    const total = state.players.length;
    for (let i = 1; i <= total; i++) {
      const idx = (state.table.currentTurnIndex + i) % total;
      if (state.players[idx].status === 'ACTIVE') {
        state.table.currentTurnIndex = idx;
        return;
      }
    }
  }

  /**
   * 人間プレイヤーのアクションUI用の制約値（コール額、最小/最大レイズ額）を同期計算
   */
  syncUIControlState(state) {
    const human = state.players[0];
    const isTurn = state.gameStatus === 'PLAYING' &&
      !state.isFastForwarding &&
      state.table.currentTurnIndex === 0 &&
      human?.status === 'ACTIVE';

    if (!isTurn) {
      state.uiControl.isPlayerTurn = false;
      return;
    }

    const callAmount = Math.max(0, state.table.highestBet - human.currentBet);
    const maxRaiseAmount = human.currentBet + human.stack;
    const rawMinRaise = state.table.highestBet === 0
      ? state.config.bbAmount
      : state.table.highestBet + state.table.lastRaiseDiff;

    const minRaiseAmount = Math.min(maxRaiseAmount, Math.max(rawMinRaise, MIN_CHIP_UNIT));

    state.uiControl = {
      isPlayerTurn: true,
      canCheck: callAmount === 0,
      callAmount: Math.min(callAmount, human.stack),
      minRaiseAmount,
      maxRaiseAmount
    };
  }

  addLog(state, message) {
    state.table.actionLogs.push(message);
    if (state.table.actionLogs.length > 25) {
      state.table.actionLogs.shift();
    }
  }

  clearTimers() {
    if (this.npcTimer) {
      clearTimeout(this.npcTimer);
      this.npcTimer = null;
    }
  }
}

export const gameEngine = new GameEngine();