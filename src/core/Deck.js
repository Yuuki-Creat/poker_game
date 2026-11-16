import { SUITS } from '../constants.js';

/**
 * トランプ52枚の生成とFisher-Yatesアルゴリズムによる厳密なシャッフル
 */
export class Deck {
  static createShuffledDeck() {
    const cards = [];
    const suits = [SUITS.SPADE, SUITS.HEART, SUITS.DIAMOND, SUITS.CLUB];

    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++) {
        cards.push({ rank, suit, id: `${rank}_${suit}` });
      }
    }

    // Fisher-Yates Shuffle
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    return cards;
  }
}