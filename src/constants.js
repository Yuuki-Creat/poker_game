/**
 * ゲーム全体で使用する定数定義
 * 全ての金額計算はミリBB（1BB = 1000, 0.1BB = 100）の整数で行う
 */
export const MILLI_BB = 1000;
export const MIN_CHIP_UNIT = 100; // 0.1 BB (最小ベット単位・端数処理単位)

export const SUITS = {
  SPADE: 1,
  HEART: 2,
  DIAMOND: 3,
  CLUB: 4
};

export const SUIT_SYMBOLS = {
  1: '♠',
  2: '♥',
  3: '♦',
  4: '♣'
};

export const RANK_NAMES = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
};

export const HAND_RANKS = {
  HIGH_CARD: { id: 1, name: 'ハイカード' },
  ONE_PAIR: { id: 2, name: 'ワンペア' },
  TWO_PAIR: { id: 3, name: 'ツーペア' },
  THREE_OF_A_KIND: { id: 4, name: 'スリーカード' },
  STRAIGHT: { id: 5, name: 'ストレート' },
  FLUSH: { id: 6, name: 'フラッシュ' },
  FULL_HOUSE: { id: 7, name: 'フルハウス' },
  FOUR_OF_A_KIND: { id: 8, name: 'フォーカード' },
  STRAIGHT_FLUSH: { id: 9, name: 'ストレートフラッシュ' },
  ROYAL_FLUSH: { id: 10, name: 'ロイヤルフラッシュ' }
};

export const AI_STRATEGIES = ['GTO', 'TAG', 'LAG', 'Nit', 'Station'];