import { gameEngine } from '../core/GameEngine.js';
import { formatBB } from '../utils/currency.js';

/**
 * ロビー画面モーダルおよびハンド終了時のリザルトバーの制御クラス
 */
export class ModalView {
  constructor() {
    this.lobbyModalEl = document.getElementById('lobby-modal');
    this.selectBtns = document.querySelectorAll('.btn-select');
    this.btnStartGame = document.getElementById('btn-start-game');
    this.btnBackLobby = document.getElementById('btn-back-lobby');

    this.resultBarEl = document.getElementById('result-bar');
    this.resultTitleEl = document.getElementById('result-title');
    this.resultSubEl = document.getElementById('result-sub');
    this.btnNextHand = document.getElementById('btn-next-hand');
    this.btnGameoverLobby = document.getElementById('btn-gameover-lobby');

    this.selectedNpcCount = 6;
    this.bindEvents();
  }

  bindEvents() {
    this.selectBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedNpcCount = Number(btn.dataset.count);
      });
    });

    this.btnStartGame.addEventListener('click', () => {
      gameEngine.startNewGame(this.selectedNpcCount);
    });

    this.btnBackLobby.addEventListener('click', () => {
      this.lobbyModalEl.style.display = 'flex';
    });

    this.btnNextHand.addEventListener('click', () => {
      gameEngine.startNewHand();
    });

    this.btnGameoverLobby.addEventListener('click', () => {
      this.lobbyModalEl.style.display = 'flex';
    });
  }

  render(state) {
    // ロビー表示制御
    this.lobbyModalEl.style.display = state.gameStatus === 'LOBBY' ? 'flex' : 'none';

    // ハンド結果 / ゲームオーバーバー表示制御
    if (state.gameStatus === 'HAND_RESULT' || state.gameStatus === 'GAME_OVER') {
      this.resultBarEl.style.display = 'flex';
      const winners = state.resultData.winners;

      if (winners.length > 0) {
        const summary = winners
          .map(w => `${w.name} (+${formatBB(w.wonAmount)} BB / ${w.handName})`)
          .join(', ');
        this.resultTitleEl.textContent = `Winner: ${summary}`;
      } else {
        this.resultTitleEl.textContent = 'ハンド終了';
      }

      if (state.gameStatus === 'GAME_OVER') {
        this.resultSubEl.textContent = 'スタックが0になりました。全NPCの戦略が開示されています。';
        this.btnNextHand.style.display = 'none';
        this.btnGameoverLobby.style.display = 'inline-block';
      } else {
        this.resultSubEl.textContent = '各NPCの頭上に戦略バッジ（GTO/TAG/LAG/Nit/Station）が開示されました';
        this.btnNextHand.style.display = 'inline-block';
        this.btnGameoverLobby.style.display = 'none';
      }
    } else {
      this.resultBarEl.style.display = 'none';
    }
  }
}