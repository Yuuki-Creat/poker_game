import { RANK_NAMES, SUIT_SYMBOLS } from '../constants.js';
import { formatBB } from '../utils/currency.js';

/**
 * テーブル中央（コミュニティカード、メイン/サイドポット、フェーズ表示、ログ）の描画クラス
 */
export class TableView {
  constructor() {
    this.phaseEl = document.getElementById('phase-indicator');
    this.totalPotEl = document.getElementById('total-pot-amount');
    this.sidePotsEl = document.getElementById('side-pots-list');
    this.communityEl = document.getElementById('community-cards');
    this.logListEl = document.getElementById('action-log-list');
  }

  render(state) {
    this.phaseEl.textContent = state.gameStatus === 'LOBBY' ? 'LOBBY' : state.phase;

    // ポット総額とサイドポットの描画
    const totalPot = state.table.pots.reduce((sum, p) => sum + p.amount, 0);
    this.totalPotEl.textContent = `${formatBB(totalPot)} BB`;

    if (state.table.pots.length > 1) {
      this.sidePotsEl.innerHTML = state.table.pots
        .map((p, idx) => `<span class="side-pot-item">${idx === 0 ? 'Main' : `Side ${idx}`}: ${formatBB(p.amount)} BB</span>`)
        .join('');
    } else {
      this.sidePotsEl.innerHTML = '';
    }

    // 人間プレイヤーの現在の役を構成するカードIDセット（ハイライト表示用）
    const human = state.players[0];
    const highlightIds = new Set(
      (human && human.status !== 'FOLDED' && human.currentHandRank?.bestFiveCards || []).map(c => c.id)
    );

    // コミュニティカード5枠の描画
    let cardsHtml = '';
    for (let i = 0; i < 5; i++) {
      const card = state.table.communityCards[i];
      if (card) {
        const isHighlight = highlightIds.has(card.id);
        cardsHtml += this.createCardHtml(card, isHighlight);
      } else {
        cardsHtml += `<div class="card empty-card"></div>`;
      }
    }
    this.communityEl.innerHTML = cardsHtml;

    // アクションログの描画
    this.logListEl.innerHTML = state.table.actionLogs
      .map(msg => `<li>${msg}</li>`)
      .join('');
    this.logListEl.scrollTop = this.logListEl.scrollHeight;
  }

  createCardHtml(card, isHighlight = false, isSmall = false) {
    const rankStr = RANK_NAMES[card.rank];
    const suitSym = SUIT_SYMBOLS[card.suit];
    const sizeClass = isSmall ? 'card-sm' : '';
    const highlightClass = isHighlight ? 'highlight-card' : '';

    return `
      <div class="card ${sizeClass} suit-${card.suit} ${highlightClass}">
        <div class="card-rank">${rankStr}</div>
        <div class="card-suit-center">${suitSym}</div>
      </div>
    `;
  }
}