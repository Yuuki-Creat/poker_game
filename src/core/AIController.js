import { roundToChipUnit } from '../utils/currency.js';

/**
 * NPCの5つの戦略（GTO, TAG, LAG, Nit, Station）に基づく意思決定エンジン
 */
export class AIController {
  /**
   * NPCのアクションを決定する
   * @param {Object} npc - 行動するNPCオブジェクト
   * @param {Object} state - Global State
   * @returns {Object} { type: 'FOLD'|'CHECK'|'CALL'|'RAISE', amount: number }
   */
  static decideAction(npc, state) {
    const { table, config } = state;
    const toCall = Math.max(0, table.highestBet - npc.currentBet);
    const canCheck = toCall === 0;

    // 現在のハンド強度を0.0〜1.0に正規化評価
    const strength = this.evaluateHandStrength(npc, state.phase);

    // 戦略別のパラメータ定義（参加閾値・アグレッション・ブラフ頻度）
    const profile = {
      Nit:     { callThreshold: 0.58, raiseThreshold: 0.78, bluffRate: 0.02 },
      TAG:     { callThreshold: 0.42, raiseThreshold: 0.65, bluffRate: 0.08 },
      GTO:     { callThreshold: 0.36, raiseThreshold: 0.60, bluffRate: 0.14 },
      LAG:     { callThreshold: 0.25, raiseThreshold: 0.48, bluffRate: 0.28 },
      Station: { callThreshold: 0.15, raiseThreshold: 0.85, bluffRate: 0.03 }
    }[npc.aiStrategy] || { callThreshold: 0.4, raiseThreshold: 0.65, bluffRate: 0.1 };

    // コール額がスタックに対して大きすぎる場合のプレッシャー補正（Stationは気にしない）
    const potTotal = table.pots.reduce((sum, p) => sum + p.amount, 0);
    const costRatio = toCall / Math.max(potTotal, config.bbAmount);
    const pressure = npc.aiStrategy === 'Station' ? 0 : Math.min(0.25, costRatio * 0.12);

    const effectiveStrength = strength - pressure;
    const isBluff = Math.random() < profile.bluffRate;

    // レイズ判定
    if ((effectiveStrength >= profile.raiseThreshold || isBluff) && npc.stack > toCall) {
      const minRaiseTotal = table.highestBet + table.lastRaiseDiff;
      const maxRaiseTotal = npc.currentBet + npc.stack;

      // ポットの60%〜100%程度のサイズを計算
      const targetBet = table.highestBet + roundToChipUnit(potTotal * 0.7);
      const raiseTotal = Math.max(minRaiseTotal, Math.min(targetBet, maxRaiseTotal));

      if (raiseTotal > table.highestBet) {
        return { type: 'RAISE', amount: raiseTotal };
      }
    }

    // コール / チェック判定
    if (canCheck) {
      return { type: 'CHECK', amount: 0 };
    }

    if (effectiveStrength >= profile.callThreshold) {
      return { type: 'CALL', amount: Math.min(toCall, npc.stack) };
    }

    return { type: 'FOLD', amount: 0 };
  }

  /**
   * プリフロップおよびポストフロップのハンド強度を0.0〜1.0で簡易算出
   */
  static evaluateHandStrength(npc, phase) {
    if (phase === 'PREFLOP') {
      const [c1, c2] = npc.cards;
      if (!c1 || !c2) return 0.2;
      const high = Math.max(c1.rank, c2.rank);
      const low = Math.min(c1.rank, c2.rank);
      const isPair = high === low;
      const isSuited = c1.suit === c2.suit;

      if (isPair) return 0.55 + (high / 14) * 0.45; // ペアは0.63〜1.0
      let score = (high * 1.5 + low) / 35;
      if (isSuited) score += 0.08;
      if (high - low === 1) score += 0.05;
      return Math.min(0.85, score);
    }

    // ポストフロップは役ID（1〜10）をベースに評価
    const rankId = npc.currentHandRank?.id || 1;
    if (rankId === 1) return 0.22; // ハイカード
    if (rankId === 2) return 0.52; // ワンペア
    if (rankId === 3) return 0.74; // ツーペア
    if (rankId === 4) return 0.85; // スリーカード
    return 0.95;                   // ストレート以上
  }
}