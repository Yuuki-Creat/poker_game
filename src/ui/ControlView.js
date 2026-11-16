import { formatBB, roundToChipUnit } from '../utils/currency.js';
import { gameEngine } from '../core/GameEngine.js';

/**
 * 右下アクションコントロール（ベットスライダー・ショートカットボタン・アクションボタン）の制御クラス
 */
export class ControlView {
  constructor() {
    this.panelEl = document.getElementById('control-panel');
    this.sliderEl = document.getElementById('bet-slider');
    this.sliderDisplayEl = document.getElementById('slider-amount-display');
    this.btnFold = document.getElementById('btn-fold');
    this.btnCheckCall = document.getElementById('btn-check-call');
    this.btnRaise = document.getElementById('btn-raise');
    this.shortcutBtns = document.querySelectorAll('[data-shortcut]');

    this.currentState = null;
    this.bindEvents();
  }

  bindEvents() {
    // スライダー変更時にミリBBをBB表示へリアルタイム変換
    this.sliderEl.addEventListener('input', () => {
      const val = Number(this.sliderEl.value);
      this.updateRaiseButtonText(val);
    });

    // ショートカットボタン（Min, 1/3 Pot, 1/2 Pot, Pot, All-In）
    this.shortcutBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.currentState) return;
        const type = btn.dataset.shortcut;
        const { uiControl, table } = this.currentState;
        const totalPot = table.pots.reduce((sum, p) => sum + p.amount, 0);

        let target = uiControl.minRaiseAmount;
        if (type === 'min') target = uiControl.minRaiseAmount;
        if (type === '1/3') target = table.highestBet + roundToChipUnit(totalPot / 3);
        if (type === '1/2') target = table.highestBet + roundToChipUnit(totalPot / 2);
        if (type === 'pot') target = table.highestBet + roundToChipUnit(totalPot);
        if (type === 'allin') target = uiControl.maxRaiseAmount;

        // 最小レイズ額〜最大レイズ額（All-in）の範囲に厳密にクランプ
        const clamped = Math.max(uiControl.minRaiseAmount, Math.min(target, uiControl.maxRaiseAmount));
        this.sliderEl.value = clamped;
        this.updateRaiseButtonText(clamped);
      });
    });

    this.btnFold.addEventListener('click', () => gameEngine.handleHumanAction('FOLD'));

    this.btnCheckCall.addEventListener('click', () => {
      if (!this.currentState) return;
      const action = this.currentState.uiControl.canCheck ? 'CHECK' : 'CALL';
      gameEngine.handleHumanAction(action);
    });

    this.btnRaise.addEventListener('click', () => {
      const amount = Number(this.sliderEl.value);
      gameEngine.handleHumanAction('RAISE', amount);
    });
  }

  updateRaiseButtonText(milliBBAmount) {
    this.sliderDisplayEl.textContent = formatBB(milliBBAmount);
    const isAllIn = this.currentState && milliBBAmount >= this.currentState.uiControl.maxRaiseAmount;
    this.btnRaise.textContent = isAllIn
      ? `ALL-IN (${formatBB(milliBBAmount)} BB)`
      : `RAISE TO ${formatBB(milliBBAmount)} BB`;
  }

  render(state) {
    this.currentState = state;
    const { uiControl } = state;

    if (!uiControl.isPlayerTurn) {
      this.panelEl.classList.add('disabled');
      return;
    }

    this.panelEl.classList.remove('disabled');

    // Check / Call ボタンの表示切り替え
    if (uiControl.canCheck) {
      this.btnCheckCall.textContent = 'CHECK';
    } else {
      this.btnCheckCall.textContent = `CALL ${formatBB(uiControl.callAmount)} BB`;
    }

    // レイズ余地があるかどうか
    const canRaise = uiControl.maxRaiseAmount > state.table.highestBet &&
                     uiControl.maxRaiseAmount > uiControl.callAmount;
    this.btnRaise.disabled = !canRaise;
    this.sliderEl.disabled = !canRaise;

    if (canRaise) {
      this.sliderEl.min = uiControl.minRaiseAmount;
      this.sliderEl.max = uiControl.maxRaiseAmount;
      this.sliderEl.value = uiControl.minRaiseAmount;
      this.updateRaiseButtonText(uiControl.minRaiseAmount);
    } else {
      this.btnRaise.textContent = 'RAISE不可';
    }
  }
}