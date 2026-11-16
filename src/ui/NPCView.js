import { formatBB } from '../utils/currency.js';
import { RANK_NAMES, SUIT_SYMBOLS } from '../constants.js';

/**
 * NPC座席のレスポンシブ配置、裏向き/ショーダウンカード、吹き出し、戦略アンヴェイルバッジの描画
 */
export class NPCView {
  constructor() {
    this.containerEl = document.getElementById('npc-seats-container');
  }

  render(state) {
    const npcs = state.players.slice(1);
    const npcCount = state.config.npcCount;
    const showdownSet = new Set(state.resultData?.showdownPlayers || []);

    this.containerEl.innerHTML = npcs.map((npc, idx) => {
      const isTurn = state.gameStatus === 'PLAYING' && state.table.currentTurnIndex === npc.seatIndex;
      const isDealer = state.table.dealerSeatIndex === npc.seatIndex;
      const showFaceUp = showdownSet.has(npc.id) && npc.cards.length === 2;

      // 戦略バッジ（プレイ中は「???」、ハンド終了時に戦略名と専用カラーを開示）
      const strategyText = npc.isStrategyRevealed ? npc.aiStrategy : '???';
      const strategyClass = npc.isStrategyRevealed ? `revealed-${npc.aiStrategy}` : '';

      // カード描画（通常時は裏面、ショーダウン対象時は表面＋役名表示）
      let cardsHtml = '';
      if (npc.cards.length === 2) {
        if (showFaceUp) {
          cardsHtml = npc.cards.map(c => `
            <div class="card card-sm suit-${c.suit}">
              <div class="card-rank">${RANK_NAMES[c.rank]}</div>
              <div class="card-suit-center">${SUIT_SYMBOLS[c.suit]}</div>
            </div>
          `).join('');
        } else {
          cardsHtml = `
            <div class="card card-sm card-back"></div>
            <div class="card card-sm card-back"></div>
          `;
        }
      }

      return `
        <div class="npc-seat seat-${npcCount}-${idx} ${npc.status === 'FOLDED' ? 'folded' : ''}">
          ${isDealer ? '<div class="dealer-button">D</div>' : ''}
          ${npc.currentBet > 0 ? `<div class="bet-chip-badge">${formatBB(npc.currentBet)} BB</div>` : ''}
          ${npc.lastActionText ? `<div class="action-bubble">${npc.lastActionText}</div>` : ''}
          
          <div class="npc-panel ${isTurn ? 'active-turn' : ''}">
            <div class="npc-top-row">
              <div class="npc-avatar">🤖</div>
              <span class="npc-strategy-badge ${strategyClass}">${strategyText}</span>
            </div>
            <div class="npc-cards">${cardsHtml}</div>
            <div class="npc-name">${npc.name} ${showFaceUp ? `(${npc.currentHandRank.name})` : ''}</div>
            <div class="npc-stack">${formatBB(npc.stack)} BB</div>
          </div>
        </div>
      `;
    }).join('');
  }
}