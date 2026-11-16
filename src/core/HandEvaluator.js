import { HAND_RANKS } from '../constants.js';

/**
 * 役判定クラス
 * プリフロップ（2枚）〜リバー（7枚）までの可変長カード配列に対応し、
 * 現在の役名・比較用スコア・役を構成する最大5枚のカードを即座に返却する。
 */
export class HandEvaluator {
  /**
   * ホールカードとコミュニティカードから現在の最良役を判定する
   * @param {Array} holeCards - プレイヤーの手札(2枚)
   * @param {Array} communityCards - 場のカード(0〜5枚)
   */
  static evaluateCurrentHand(holeCards, communityCards = []) {
    const allCards = [...holeCards, ...communityCards];

    if (allCards.length === 0) {
      return { id: 0, name: '待機中', score: 0, bestFiveCards: [] };
    }

    // プリフロップ（計2枚〜4枚）の場合のリアルタイム判定
    if (allCards.length < 5) {
      return this.evaluatePartialHand(allCards);
    }

    // 5枚以上（フロップ以降）は5枚の全組み合わせ(5C5=1, 6C5=6, 7C5=21通り)から最高スコアを算出
    const combinations = this.getCombinations(allCards, 5);
    let bestResult = null;

    for (const fiveCards of combinations) {
      const result = this.evaluateFiveCards(fiveCards);
      if (!bestResult || result.score > bestResult.score) {
        bestResult = result;
      }
    }

    return bestResult;
  }

  /**
   * 5枚未満（プリフロップ等）での簡易役判定
   */
  static evaluatePartialHand(cards) {
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    const counts = {};
    for (const c of sorted) {
      counts[c.rank] = (counts[c.rank] || 0) + 1;
    }

    const pairs = Object.entries(counts).filter(([, cnt]) => cnt >= 2);
    if (pairs.length > 0) {
      const pairRank = Number(pairs[0][0]);
      const highlight = sorted.filter(c => c.rank === pairRank);
      return {
        id: HAND_RANKS.ONE_PAIR.id,
        name: HAND_RANKS.ONE_PAIR.name,
        score: (HAND_RANKS.ONE_PAIR.id << 20) + (pairRank << 16),
        bestFiveCards: highlight
      };
    }

    // ハイカード（最も強い1枚をハイライト）
    return {
      id: HAND_RANKS.HIGH_CARD.id,
      name: HAND_RANKS.HIGH_CARD.name,
      score: (HAND_RANKS.HIGH_CARD.id << 20) + (sorted[0].rank << 16),
      bestFiveCards: [sorted[0]]
    };
  }

  /**
   * 5枚のカードから正確な役とタイブレーク用スコアを算出する
   */
  static evaluateFiveCards(fiveCards) {
    const sorted = [...fiveCards].sort((a, b) => b.rank - a.rank);
    const ranks = sorted.map(c => c.rank);
    const suits = sorted.map(c => c.suit);

    const isFlush = suits.every(s => s === suits[0]);

    // ストレート判定（A-5-4-3-2のホイールストレート対応）
    let isStraight = false;
    let straightHighRank = ranks[0];

    const isNormalStraight = ranks.every((r, i) => i === 0 || ranks[i - 1] - r === 1);
    const isWheelStraight = JSON.stringify(ranks) === JSON.stringify([14, 5, 4, 3, 2]);

    if (isNormalStraight) {
      isStraight = true;
    } else if (isWheelStraight) {
      isStraight = true;
      straightHighRank = 5; // 5ハイストレートとして扱う
    }

    // ランクの出現回数集計（回数降順 → ランク降順でソート）
    const countMap = {};
    for (const r of ranks) countMap[r] = (countMap[r] || 0) + 1;

    const groups = Object.entries(countMap)
      .map(([rank, count]) => ({ rank: Number(rank), count }))
      .sort((a, b) => b.count - a.count || b.rank - a.rank);

    let handType = HAND_RANKS.HIGH_CARD;
    let activeCards = sorted; // 役を直接構成するカード（UIハイライト用）

    if (isFlush && isStraight) {
      handType = straightHighRank === 14 ? HAND_RANKS.ROYAL_FLUSH : HAND_RANKS.STRAIGHT_FLUSH;
    } else if (groups[0].count === 4) {
      handType = HAND_RANKS.FOUR_OF_A_KIND;
      activeCards = sorted.filter(c => c.rank === groups[0].rank);
    } else if (groups[0].count === 3 && groups[1].count === 2) {
      handType = HAND_RANKS.FULL_HOUSE;
    } else if (isFlush) {
      handType = HAND_RANKS.FLUSH;
    } else if (isStraight) {
      handType = HAND_RANKS.STRAIGHT;
    } else if (groups[0].count === 3) {
      handType = HAND_RANKS.THREE_OF_A_KIND;
      activeCards = sorted.filter(c => c.rank === groups[0].rank);
    } else if (groups[0].count === 2 && groups[1].count === 2) {
      handType = HAND_RANKS.TWO_PAIR;
      activeCards = sorted.filter(c => c.rank === groups[0].rank || c.rank === groups[1].rank);
    } else if (groups[0].count === 2) {
      handType = HAND_RANKS.ONE_PAIR;
      activeCards = sorted.filter(c => c.rank === groups[0].rank);
    } else {
      handType = HAND_RANKS.HIGH_CARD;
      activeCards = [sorted[0]];
    }

    // ビットシフトによる一意のスコア算出 (役ID + キッカー順序)
    const kickerOrder = isWheelStraight
      ? [5, 4, 3, 2, 1]
      : groups.flatMap(g => Array(g.count).fill(g.rank));

    let kickerScore = 0;
    for (let i = 0; i < 5; i++) {
      kickerScore |= (kickerOrder[i] << ((4 - i) * 4));
    }

    const totalScore = (handType.id * 0x100000) + kickerScore;

    return {
      id: handType.id,
      name: handType.name,
      score: totalScore,
      bestFiveCards: activeCards
    };
  }

  /**
   * 配列からk個を選ぶ組み合わせを生成
   */
  static getCombinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const head = arr[0];
    const tail = arr.slice(1);
    const withHead = this.getCombinations(tail, k - 1).map(c => [head, ...c]);
    const withoutHead = this.getCombinations(tail, k);
    return [...withHead, ...withoutHead];
  }
}