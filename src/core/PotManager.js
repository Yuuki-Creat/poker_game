import { MIN_CHIP_UNIT } from '../constants.js';

/**
 * メインポット・サイドポットの構築およびショーダウン時の分配（端数処理含む）を行うクラス
 */
export class PotManager {
  /**
   * 全プレイヤーのハンド累計投資額(totalInvested)からメインポット・サイドポットを再計算する
   * @param {Array} players 
   * @returns {Array} [{ amount, eligiblePlayerIds }]
   */
  static calculatePots(players) {
    const investors = players.filter(p => p.totalInvested > 0);
    if (investors.length === 0) {
      return [{ amount: 0, eligiblePlayerIds: [] }];
    }

    // 投資額のユニークな境界値を昇順で取得
    const levels = [...new Set(investors.map(p => p.totalInvested))].sort((a, b) => a - b);
    const pots = [];
    let prevLevel = 0;

    for (const level of levels) {
      const diff = level - prevLevel;
      const contributors = investors.filter(p => p.totalInvested >= level);
      const potAmount = diff * contributors.length;

      // このポットを獲得する権利があるのはFoldしていないプレイヤーのみ
      const eligibleIds = contributors
        .filter(p => p.status !== 'FOLDED')
        .map(p => p.id);

      // 直前のポットと対象者が全く同じなら統合する（不要なサイドポット分割を防ぐ）
      if (pots.length > 0 && JSON.stringify(pots[pots.length - 1].eligiblePlayerIds) === JSON.stringify(eligibleIds)) {
        pots[pots.length - 1].amount += potAmount;
      } else {
        pots.push({ amount: potAmount, eligiblePlayerIds: eligibleIds });
      }

      prevLevel = level;
    }

    return pots;
  }

  /**
   * 各ポットを勝者へ分配する。
   * 割り切れない端数（0.1BB = 100ミリBB単位）はディーラーボタンの左隣（アーリーポジション）の勝者へ付与。
   */
  static distributePots(pots, players, dealerSeatIndex) {
    const winningsMap = {}; // playerId -> { amount, handName }

    for (const pot of pots) {
      if (pot.amount === 0 || pot.eligiblePlayerIds.length === 0) continue;

      const contenders = players.filter(p => pot.eligiblePlayerIds.includes(p.id));
      let maxScore = -1;
      for (const p of contenders) {
        if (p.currentHandRank.score > maxScore) {
          maxScore = p.currentHandRank.score;
        }
      }

      const winners = contenders.filter(p => p.currentHandRank.score === maxScore);

      // 0.1BB(100ミリBB)単位で切り捨て除算
      const totalUnits = Math.floor(pot.amount / MIN_CHIP_UNIT);
      const shareUnits = Math.floor(totalUnits / winners.length);
      const remainderUnits = totalUnits % winners.length;

      const baseShare = shareUnits * MIN_CHIP_UNIT;
      const remainderAmount = remainderUnits * MIN_CHIP_UNIT;

      // アーリーポジション（ディーラーの左隣）順にソートして端数を付与
      const totalSeats = players.length;
      const sortedWinners = [...winners].sort((a, b) => {
        const distA = (a.seatIndex - dealerSeatIndex - 1 + totalSeats) % totalSeats;
        const distB = (b.seatIndex - dealerSeatIndex - 1 + totalSeats) % totalSeats;
        return distA - distB;
      });

      sortedWinners.forEach((winner, idx) => {
        const gain = baseShare + (idx === 0 ? remainderAmount : 0);
        winner.stack += gain;
        if (!winningsMap[winner.id]) {
          winningsMap[winner.id] = {
            playerId: winner.id,
            name: winner.name,
            wonAmount: 0,
            handName: winner.currentHandRank.name
          };
        }
        winningsMap[winner.id].wonAmount += gain;
      });
    }

    return Object.values(winningsMap);
  }
}