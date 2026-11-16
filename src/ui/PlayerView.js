import { formatBB } from '../utils/currency.js';
import { RANK_NAMES, SUIT_SYMBOLS } from '../constants.js';

/**
 * 人間プレイヤー自身のホールカード、リアルタイム役バッジ、スタックの描画クラス
 */
export class PlayerView {
  constructor() {
    this.panelEl = document.getElementById('human-panel');
    this.cardsEl = document.getElementById('human-cards');
    this.rankBadgeEl = document.getElementById('human-hand-rank');
    this.stackEl = document.getElementById('human-stack');
    this.dealerBtnEl = document.getElementById('human-dealer-btn');
    this.betBadgeEl = document.getElementById('human-bet-badge');
    this.actionBubbleEl = document.getElementById('human-action-bubble');
  }

  render(state) {
    const human = state.players[0];
    if (!human) return;

    // アクティブターン枠の強調
    const isMyTurn = state.gameStatus === 'PLAYING' && state.table.currentTurnIndex === 0;
    this.panelEl.classList.toggle('active-turn', isMyTurn);

    // リアルタイム役表示の即時反映
    if (human.status === 'FOLDED') {
      this.rankBadgeEl.textContent = 'FOLDED';
      this.rankBadgeEl.style.background = '#64748b';
    } else {
      this.rankBadgeEl.textContent = human.currentHandRank?.name || '待機中';
      this.rankBadgeEl.style.background = '#2563eb';
    }

    this.stackEl.textContent = `${formatBB(human.stack)} BB`;

    // 役構成カードのハイライト判定
    const highlightIds = new Set(
      (human.status !== 'FOLDED' && human.currentHandRank?.bestFiveCards || []).map(c => c.id)
    );

    // ホールカード2枚の描画
    if (human.cards && human.cards.length === 2) {
      this.cardsEl.innerHTML = human.cards.map(card => {
        const isHighlight = highlightIds.has(card.id);
        return `
          <div class="card suit-${card.suit} ${isHighlight ? 'highlight-card' : ''}">
            <div class="card-rank">${RANK_NAMES[card.rank]}</div>
            <div class="card-suit-center">${SUIT_SYMBOLS[card.suit]}</div>
          </div>
        `;
      }).join('');
    } else {
      this.cardsEl.innerHTML = `
        <div class="card empty-card"></div>
        <div class="card empty-card"></div>
      `;
    }

    // ディーラーボタン、現在ベット額、アクション吹き出し
    this.dealerBtnEl.style.display = state.table.dealerSeatIndex === 0 ? 'flex' : 'none';

    if (human.currentBet > 0) {
      this.betBadgeEl.style.display = 'block';
      this.betBadgeEl.textContent = `${formatBB(human.currentBet)} BB`;
    } else {
      this.betBadgeEl.style.display = 'none';
    }

    if (human.lastActionText) {
      this.actionBubbleEl.style.display = 'block';
      this.actionBubbleEl.textContent = human.lastActionText;
    } else {
      this.actionBubbleEl.style.display = 'none';
    }
  }
}