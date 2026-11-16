import { createInitialState } from './initialState.js';

/**
 * Pub/Subパターンを用いた状態管理クラス
 * ファストフォワード時のパフォーマンス劣化を防ぐため、バッチ更新（通知ミュート）機能を備える
 */
export class Store {
  constructor() {
    this.state = createInitialState();
    this.listeners = new Set();
    this.isMuted = false;
  }

  getState() {
    return this.state;
  }

  /**
   * 状態変更の購読登録
   * @param {Function} listener 
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 状態の更新と購読者への通知
   * @param {Function} updater - (state) => void
   */
  update(updater) {
    updater(this.state);
    if (!this.isMuted) {
      this.notify();
    }
  }

  /**
   * バッチ更新：複数回の状態更新中、UIへの通知を抑制し最後に1度だけ通知する
   * （プレイヤーFold後のNPC高速ループ処理で使用）
   * @param {Function} batchFn 
   */
  batchUpdate(batchFn) {
    this.isMuted = true;
    try {
      batchFn(this.state);
    } finally {
      this.isMuted = false;
      this.notify();
    }
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export const store = new Store();