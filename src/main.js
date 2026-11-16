import { store } from './state/Store.js';
import { UIManager } from './ui/UIManager.js';

/**
 * アプリケーションエントリーポイント
 */
window.addEventListener('DOMContentLoaded', () => {
  new UIManager(store);
});