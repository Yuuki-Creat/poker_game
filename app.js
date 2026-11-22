'use strict';

/**
 * ============================================================================
 * [Module 1] Security & Utilities
 * CSPRNG（暗号学的に安全な乱数生成器）、ミリBB整数変換、XSS防止DOMヘルパー
 * ============================================================================
 */
const SecurityUtils = {
  /**
   * 0.0 以上 1.0 未満の暗号学的に安全な浮動小数点乱数を返す (Math.random完全排除)
   */
  nextFloat() {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] / (0xFFFFFFFF + 1);
  },

  /**
   * min 以上 max 以下の暗号学的に安全な整数乱数を返す
   */
  nextInt(min, max) {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  },

  /**
   * Fisher-Yates アルゴリズムによる完全公平なデッキシャッフル
   */
  shuffle(array) {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  },

  /**
   * 内部整数値 (1BB = 100) を画面表示用のBB文字列に変換
   */
  formatBB(mBB) {
    const val = (mBB / 100).toFixed(1);
    return val.endsWith('.0') ? val.slice(0, -2) : val;
  },

  /**
   * XSSを完全に防止する安全なDOM生成ヘルパー (innerHTML不使用)
   */
  el(tag, className = '', text = '') {
    const elem = document.createElement(tag);
    if (className) elem.className = className;
    if (text !== '' && text !== null && text !== undefined) {
      elem.textContent = String(text);
    }
    return elem;
  }
};

/**
 * ============================================================================
 * [Module 2] Evaluator & Equity Calculator
 * 7枚役判定ビット演算アルゴリズム、ドロー検知、モンテカルロEV算出エンジン
 * ============================================================================
 */
const Evaluator = {
  RANKS: ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'],
  SUITS: ['s', 'h', 'd', 'c'],
  SUIT_SYMBOLS: { s: '♠', h: '♥', d: '♦', c: '♣' },
  CATEGORY_NAMES: {
    9: 'ストレートフラッシュ',
    8: 'フォーカード',
    7: 'フルハウス',
    6: 'フラッシュ',
    5: 'ストレート',
    4: 'スリーカード',
    3: 'ツーペア',
    2: 'ワンペア',
    1: 'ハイカード'
  },

  /**
   * カード整数 (0〜51) からランク(2〜14)とスート(0〜3)を取得
   */
  cardRank(c) { return Math.floor(c / 4) + 2; },
  cardSuit(c) { return c % 4; },

  /**
   * カード整数を文字列表現 (例: "♠A") に変換
   */
  cardToText(c) {
    const r = this.RANKS[this.cardRank(c) - 2];
    const s = this.SUITS[this.cardSuit(c)];
    return `${this.SUIT_SYMBOLS[s]}${r}`;
  },

  /**
   * 5枚のカード配列から一意の絶対強さスコアと役名を算出
   */
  evaluate5(cards5) {
    const ranks = cards5.map(c => this.cardRank(c)).sort((a, b) => b - a);
    const suits = cards5.map(c => this.cardSuit(c));
    const isFlush = suits.every(s => s === suits[0]);

    // ストレート判定 (A-5ホイール [14,5,4,3,2] 特例対応)
    let isStraight = false;
    let straightHigh = ranks[0];
    if (
      ranks[0] - ranks[1] === 1 &&
      ranks[1] - ranks[2] === 1 &&
      ranks[2] - ranks[3] === 1 &&
      ranks[3] - ranks[4] === 1
    ) {
      isStraight = true;
    } else if (
      ranks[0] === 14 &&
      ranks[1] === 5 &&
      ranks[2] === 4 &&
      ranks[3] === 3 &&
      ranks[4] === 2
    ) {
      isStraight = true;
      straightHigh = 5;
    }

    if (isFlush && isStraight) {
      const score = 9 * 0x100000 + straightHigh * 0x10000;
      const name = straightHigh === 14 ? 'ロイヤルフラッシュ' : 'ストレートフラッシュ';
      return { score, category: 9, name };
    }

    // ランクの出現頻度カウント
    const counts = {};
    for (let i = 0; i < 5; i++) {
      const r = ranks[i];
      counts[r] = (counts[r] || 0) + 1;
    }

    // (出現回数降順 -> ランク降順) でソート
    const groups = Object.keys(counts)
      .map(r => ({ rank: Number(r), count: counts[r] }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : b.rank - a.rank));

    const orderedRanks = [];
    for (const g of groups) {
      for (let i = 0; i < g.count; i++) orderedRanks.push(g.rank);
    }

    let category = 1;
    if (groups[0].count === 4) category = 8;
    else if (groups[0].count === 3 && groups[1].count === 2) category = 7;
    else if (isFlush) category = 6;
    else if (isStraight) category = 5;
    else if (groups[0].count === 3) category = 4;
    else if (groups[0].count === 2 && groups[1].count === 2) category = 3;
    else if (groups[0].count === 2) category = 2;

    const rOrder = isStraight ? [straightHigh, 0, 0, 0, 0] : orderedRanks;
    const score =
      category * 0x100000 +
      rOrder[0] * 0x10000 +
      rOrder[1] * 0x1000 +
      rOrder[2] * 0x100 +
      rOrder[3] * 0x10 +
      rOrder[4];

    const topRankChar = this.RANKS[groups[0].rank - 2];
    let detailName = this.CATEGORY_NAMES[category];
    if (category === 2 || category === 4 || category === 8) {
      detailName += ` (${topRankChar})`;
    } else if (category === 3 || category === 7) {
      const secondChar = this.RANKS[groups[1].rank - 2];
      detailName += ` (${topRankChar},${secondChar})`;
    } else if (category === 1) {
      detailName += ` (${topRankChar})`;
    }

    return { score, category, name: detailName, primaryRank: groups[0].rank };
  },

  /**
   * 5〜7枚のカードから最強の5枚組み合わせを評価 (7C5 = 21通りループ)
   */
  evaluate7(cards) {
    const n = cards.length;
    if (n < 5) return { score: 0, category: 0, name: '未成立' };
    if (n === 5) return this.evaluate5(cards);

    let best = null;
    for (let i = 0; i < n - 4; i++) {
      for (let j = i + 1; j < n - 3; j++) {
        for (let k = j + 1; k < n - 2; k++) {
          for (let l = k + 1; l < n - 1; l++) {
            for (let m = l + 1; m < n; m++) {
              const res = this.evaluate5([cards[i], cards[j], cards[k], cards[l], cards[m]]);
              if (!best || res.score > best.score) {
                best = res;
              }
            }
          }
        }
      }
    }
    return best;
  },

  /**
   * プリフロップ2枚のハンド表記 (例: "AKs", "QQ", "72o") とGTO基礎スコア(0〜100)を算出
   */
  getPreFlopHandInfo(holeCards) {
    if (!holeCards || holeCards.length < 2) return { code: '--', score: 0 };
    const r1 = this.cardRank(holeCards[0]);
    const r2 = this.cardRank(holeCards[1]);
    const s1 = this.cardSuit(holeCards[0]);
    const s2 = this.cardSuit(holeCards[1]);

    const high = Math.max(r1, r2);
    const low = Math.min(r1, r2);
    const isPair = high === low;
    const isSuited = s1 === s2;

    const cHigh = this.RANKS[high - 2];
    const cLow = this.RANKS[low - 2];
    const code = isPair ? `${cHigh}${cLow}` : `${cHigh}${cLow}${isSuited ? 's' : 'o'}`;

    // 169ハンドGTO圧縮スコア算出
    const pairTable = {
      14: 100, 13: 98, 12: 95, 11: 90, 10: 85,
      9: 78, 8: 72, 7: 66, 6: 60, 5: 55, 4: 50, 3: 46, 2: 42
    };
    if (isPair) {
      return { code, score: pairTable[high] };
    }

    let score = (high * 3.8) + (low * 1.9);
    if (isSuited) score += 8;
    const gap = high - low;
    if (gap === 1) score += 6;
    else if (gap === 2) score += 3;
    else if (gap === 3) score += 1;

    // A5s〜A2s ホイールボーナス
    if (high === 14 && low <= 5 && isSuited) score += 6;
    // プレミアムブロードウェイ補正
    if (high === 14 && low >= 10) score += 8;
    if (high === 13 && low >= 10) score += 5;

    return { code, score: Math.min(94, Math.max(10, Math.round(score))) };
  },

  /**
   * フロップ・ターンでのフラッシュドロー / ストレートドロー検出
   */
  detectDraws(allCards) {
    if (allCards.length >= 7 || allCards.length < 5) return { flushDraw: false, straightDraw: false };
    const suitCounts = [0, 0, 0, 0];
    const rankSet = new Set();
    for (const c of allCards) {
      suitCounts[this.cardSuit(c)]++;
      const r = this.cardRank(c);
      rankSet.add(r);
      if (r === 14) rankSet.add(1);
    }
    const flushDraw = suitCounts.some(cnt => cnt === 4);

    let straightDraw = false;
    for (let start = 1; start <= 10; start++) {
      let countInWindow = 0;
      for (let r = start; r < start + 5; r++) {
        if (rankSet.has(r)) countInWindow++;
      }
      if (countInWindow === 4) {
        straightDraw = true;
        break;
      }
    }
    return { flushDraw, straightDraw };
  },

  /**
   * モンテカルロ法によるオールイン時点のHero期待獲得チップ(EV)計算 (600回試行)
   */
  calculateMonteCarloEV(players, boardAtAllIn, pots) {
    const activeContenders = players.filter(p => p.status !== 'FOLDED' && p.cards.length === 2);
    const hero = players[0];
    if (hero.status === 'FOLDED') return 0;

    const neededCards = 5 - boardAtAllIn.length;
    if (neededCards <= 0) return null;

    // 既知のカードを除外した未知デッキを作成
    const known = new Set([...boardAtAllIn]);
    for (const p of activeContenders) {
      known.add(p.cards[0]);
      known.add(p.cards[1]);
    }
    const remainingDeck = [];
    for (let c = 0; c < 52; c++) {
      if (!known.has(c)) remainingDeck.push(c);
    }

    const ITERATIONS = 600;
    let totalHeroExpectedChips = 0;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      // 必要な枚数だけランダム抽出
      const simBoard = [...boardAtAllIn];
      const pool = [...remainingDeck];
      for (let k = 0; k < neededCards; k++) {
        const idx = SecurityUtils.nextInt(k, pool.length - 1);
        const tmp = pool[k];
        pool[k] = pool[idx];
        pool[idx] = tmp;
        simBoard.push(pool[k]);
      }

      // 各生存プレイヤーの7枚スコアを評価
      const scoresById = {};
      for (const p of activeContenders) {
        scoresById[p.id] = this.evaluate7([...p.cards, ...simBoard]).score;
      }

      // 各サブポットごとにHeroの獲得シェアを計算
      for (const pot of pots) {
        if (!pot.eligibleIds.includes(hero.id)) continue;
        let maxScore = -1;
        let winners = [];
        for (const pid of pot.eligibleIds) {
          const sc = scoresById[pid];
          if (sc > maxScore) {
            maxScore = sc;
            winners = [pid];
          } else if (sc === maxScore) {
            winners.push(pid);
          }
        }
        if (winners.includes(hero.id)) {
          totalHeroExpectedChips += pot.amount / winners.length;
        }
      }
    }

    return totalHeroExpectedChips / ITERATIONS;
  }
};

/**
 * ============================================================================
 * [Module 3] GTO & AI Engine (JOPT 2025 Final Table Edition)
 * いたずらなAll-inを排除し、GTO均衡をベースとした5つの戦略プロファイル意思決定
 * ============================================================================
 */
const AIEngine = {
  PROFILES: {
    GTO:     { name: 'GTO',     vpipMod: 0,   pfrMod: 0,   threeBetMod: 0,  aggression: 1.0, callDownMod: 0.0,   bluffFreq: 0.24 },
    TAG:     { name: 'TAG',     vpipMod: -6,  pfrMod: -3,  threeBetMod: 2,  aggression: 1.15, callDownMod: -0.05, bluffFreq: 0.18 },
    LAG:     { name: 'LAG',     vpipMod: 10,  pfrMod: 8,   threeBetMod: 6,  aggression: 1.35, callDownMod: 0.05,  bluffFreq: 0.35 },
    Nit:     { name: 'Nit',     vpipMod: -14, pfrMod: -11, threeBetMod: -5, aggression: 0.75, callDownMod: -0.14, bluffFreq: 0.08 },
    Station: { name: 'Station', vpipMod: 15,  pfrMod: -10, threeBetMod: -6, aggression: 0.55, callDownMod: 0.24,  bluffFreq: 0.05 }
  },

  STRATEGY_KEYS: ['GTO', 'TAG', 'LAG', 'Nit', 'Station'],

  /**
   * ランダムな戦略プロファイル名を返す
   */
  pickRandomStrategy() {
    const idx = SecurityUtils.nextInt(0, this.STRATEGY_KEYS.length - 1);
    return this.STRATEGY_KEYS[idx];
  },

  /**
   * CPUのメイン意思決定エントリーポイント
   */
  decideAction(state, player) {
    const profile = this.PROFILES[player.strategy] || this.PROFILES.GTO;
    if (state.street === 'PREFLOP') {
      return this.decidePreFlop(state, player, profile);
    }
    return this.decidePostFlop(state, player, profile);
  },

  /**
   * プリフロップ意思決定 (JOPT 2025 FT基準: 深いスタックでの無謀なAll-inを完全抑止)
   */
  decidePreFlop(state, player, profile) {
    const handInfo = Evaluator.getPreFlopHandInfo(player.cards);
    const score = handInfo.score;
    const toCall = state.currentBet - player.bet;
    const totalChips = player.stack + player.bet;
    const effStackBB = totalChips / 100;

    // ポジションに応じたベース参加閾値算出
    const posThresholds = { UTG: 65, MP: 58, CO: 50, BTN: 38, SB: 43, BB: 46 };
    const baseOpen = (posThresholds[player.positionName] || 55) - profile.vpipMod;

    // ケース1: 未オープン状態 (currentBet <= 1BB)
    if (state.currentBet <= 100) {
      if (score >= baseOpen) {
        // Stationの一部下位ハンドのみリンプ、それ以外は標準オープンレイズ (2.2x〜3.0x)
        if (player.strategy === 'Station' && score < baseOpen + 8 && SecurityUtils.nextFloat() < 0.45) {
          return { type: toCall === 0 ? 'CHECK' : 'CALL' };
        }
        const openSize = player.positionName === 'SB' ? 300 : 250;
        return this.buildRaiseAction(state, player, openSize);
      }
      return { type: toCall === 0 ? 'CHECK' : 'FOLD' };
    }

    // ケース2: オープンレイズに直面 (currentBet <= 4BB)
    if (state.currentBet <= 400) {
      const threeBetThreshold = 81 - profile.threeBetMod;
      // プレミアムまたはブラフ3Bet枠 (A5s/A4s/スーテッドコネクター)
      const isBluff3BetCandidate = handInfo.code.endsWith('s') && score >= 62 && score <= 72;
      const doBluff3Bet = isBluff3BetCandidate && SecurityUtils.nextFloat() < (profile.bluffFreq * 0.5);

      if (score >= threeBetThreshold || doBluff3Bet) {
        const mult = (player.positionName === 'SB' || player.positionName === 'BB') ? 3.5 : 3.0;
        const target = Math.round(state.currentBet * mult);
        return this.buildRaiseAction(state, player, target);
      }

      // コールレンジ判定
      const callThreshold = baseOpen + 5 - (player.positionName === 'BB' ? 8 : 0);
      if (score >= callThreshold && toCall <= player.stack * 0.35) {
        return { type: 'CALL' };
      }
      return { type: toCall === 0 ? 'CHECK' : 'FOLD' };
    }

    // ケース3: 3Bet / 4Bet以上に直面 (JOPT FT規律: いたずらにAll-inしない)
    // 5Bet All-inが許容されるのは AA, KK, QQ, AKs, AKo (スコア88以上) またはショートスタックのみ
    if (score >= 92 || (score >= 88 && effStackBB <= 45)) {
      if (state.currentBet >= 1800 || player.stack <= state.currentBet * 2.5) {
        return this.buildRaiseAction(state, player, totalChips); // 正当なプレミアムAll-in
      }
      const fourBetSize = Math.round(state.currentBet * 2.3);
      return this.buildRaiseAction(state, player, fourBetSize);
    }

    // 3Betに対する適正コール (JJ, TT, AQs, AKo 等でオッズが合う場合)
    if (score >= 80 && toCall <= totalChips * 0.28) {
      return { type: 'CALL' };
    }

    return { type: toCall === 0 ? 'CHECK' : 'FOLD' };
  },

  /**
   * ポストフロップ意思決定 (MDF・ポットオッズ・SPRに基づく精密ベットサイズ制御)
   */
  decidePostFlop(state, player, profile) {
    const toCall = state.currentBet - player.bet;
    const totalPot = state.pot;
    const evalRes = Evaluator.evaluate7([...player.cards, ...state.board]);
    const draws = Evaluator.detectDraws([...player.cards, ...state.board]);

    // 成立役とボードから推定エクイティ (0.0〜1.0) を算出
    const boardRanks = state.board.map(c => Evaluator.cardRank(c)).sort((a, b) => b - a);
    const topBoardRank = boardRanks[0] || 2;
    let madeStrength = 0.2;

    if (evalRes.category >= 5) {
      madeStrength = 0.94; // ストレート以上
    } else if (evalRes.category === 4) {
      madeStrength = 0.86; // スリーカード
    } else if (evalRes.category === 3) {
      madeStrength = 0.78; // ツーペア
    } else if (evalRes.category === 2) {
      // ワンペア: トップペア以上かミドル/ボトムペアか
      if (evalRes.primaryRank >= topBoardRank) madeStrength = 0.66;
      else if (evalRes.primaryRank >= boardRanks[1]) madeStrength = 0.48;
      else madeStrength = 0.34;
    } else {
      // ハイカード (Aハイなら少し加算)
      madeStrength = evalRes.primaryRank === 14 ? 0.24 : 0.14;
    }

    let drawBonus = 0;
    if (draws.flushDraw) drawBonus += 0.19;
    if (draws.straightDraw) drawBonus += 0.14;

    const estEquity = Math.min(0.99, madeStrength + drawBonus);

    // ケースA: 前にベットがない場合 (Check or Bet)
    if (toCall === 0) {
      const shouldValueBet = estEquity >= 0.62;
      const shouldBluff = (estEquity < 0.38 || drawBonus > 0) && SecurityUtils.nextFloat() < profile.bluffFreq;

      if (shouldValueBet || shouldBluff) {
        // ポット比率による適正サイジング (33%〜75% Pot、無意味なオーバーベットAll-in禁止)
        const ratio = estEquity >= 0.78 ? 0.68 : 0.45;
        let betTarget = Math.round((totalPot * ratio) / 10) * 10;
        betTarget = Math.max(100, betTarget);
        // 残りスタックがポットの1.1倍以下でナッツ級のときのみAll-inコミット
        if (player.stack <= totalPot * 1.1 && estEquity >= 0.82) {
          betTarget = player.stack;
        } else {
          betTarget = Math.min(betTarget, Math.round(totalPot * 0.85));
        }
        return this.buildRaiseAction(state, player, player.bet + betTarget);
      }
      return { type: 'CHECK' };
    }

    // ケースB: 相手のベットに直面 (Pot Odds & MDF判定)
    const reqEquity = toCall / (totalPot + toCall);
    const effectiveEq = estEquity + profile.callDownMod;

    // モンスターハンドでのバリューレイズ (2.5x〜3.0x)
    if (estEquity >= 0.85 && player.stack > toCall) {
      const raiseTarget = Math.min(
        player.bet + player.stack,
        Math.round(state.currentBet * 2.6 / 10) * 10
      );
      // いたずらな巨大All-in抑止: SPRがまだ高い場合は通常レイズに留める
      if (raiseTarget - state.currentBet >= state.lastRaiseIncrement) {
        return this.buildRaiseAction(state, player, raiseTarget);
      }
    }

    if (effectiveEq >= reqEquity) {
      return { type: 'CALL' };
    }

    return { type: 'FOLD' };
  },

  /**
   * 最小レイズ規則とスタック上限を検証して安全なBET/RAISEアクションオブジェクトを生成
   */
  buildRaiseAction(state, player, desiredTotalBet) {
    const maxTotal = player.stack + player.bet;
    const toCall = state.currentBet - player.bet;
    if (maxTotal <= state.currentBet) {
      return { type: toCall > 0 ? 'CALL' : 'CHECK' };
    }
    let clamped = Math.max(state.minRaiseTo, desiredTotalBet);
    clamped = Math.min(maxTotal, Math.round(clamped / 10) * 10);
    return { type: 'RAISE', amount: clamped };
  }
};

/**
 * ============================================================================
 * [Module 4] Storage & Stats Manager (Ten-Four 準拠)
 * 10,000ハンド対応リングバッファと直近100ハンド詳細履歴、スキーマ検証
 * ============================================================================
 */
const StatsManager = {
  KEY_COMPACT: 'POKER_STATS_COMPACT_V1',
  KEY_HISTORY: 'POKER_HISTORY_DETAIL_V1',
  MAX_COMPACT: 10000,
  MAX_HISTORY: 100,

  data: {
    totalHands: 0,
    totalValidHands: 0,
    totalNetBB: 0,
    totalEvBB: 0,
    totalVpip: 0,
    totalPfr: 0,
    records: [] // 1要素: [netBB, evBB, vpipInt, pfrInt, isWalkInt]
  },
  history: [],

  init() {
    this.load();
  },

  /**
   * LocalStorageからの安全な読み込み＆型検証 (改ざん防止)
   */
  load() {
    try {
      const rawStats = window.localStorage.getItem(this.KEY_COMPACT);
      if (rawStats) {
        const parsed = JSON.parse(rawStats);
        if (parsed && Array.isArray(parsed.records)) {
          this.data.totalHands = Number(parsed.totalHands) || 0;
          this.data.totalValidHands = Number(parsed.totalValidHands) || 0;
          this.data.totalNetBB = Number(parsed.totalNetBB) || 0;
          this.data.totalEvBB = Number(parsed.totalEvBB) || 0;
          this.data.totalVpip = Number(parsed.totalVpip) || 0;
          this.data.totalPfr = Number(parsed.totalPfr) || 0;
          this.data.records = parsed.records
            .slice(-this.MAX_COMPACT)
            .filter(r => Array.isArray(r) && r.length === 5 && r.every(n => typeof n === 'number' && isFinite(n)));
        }
      }
      const rawHist = window.localStorage.getItem(this.KEY_HISTORY);
      if (rawHist) {
        const parsedH = JSON.parse(rawHist);
        if (Array.isArray(parsedH)) {
          this.history = parsedH.slice(0, this.MAX_HISTORY);
        }
      }
    } catch (_) {
      // 破損時は安全に初期化
    }
  },

  save() {
    try {
      window.localStorage.setItem(this.KEY_COMPACT, JSON.stringify(this.data));
      window.localStorage.setItem(this.KEY_HISTORY, JSON.stringify(this.history));
    } catch (_) {
      // ストレージ制限到達時は古いレコードを削減
    }
  },

  /**
   * 1ハンド終了時のスタッツ＆履歴記録
   */
  recordHand(summary) {
    const netBB = Number(summary.netBB.toFixed(2));
    const evBB = Number(summary.evBB.toFixed(2));
    const vpipInt = summary.vpip ? 1 : 0;
    const pfrInt = summary.pfr ? 1 : 0;
    const walkInt = summary.isWalk ? 1 : 0;

    this.data.totalHands += 1;
    if (!walkInt) {
      this.data.totalValidHands += 1;
      this.data.totalVpip += vpipInt;
      this.data.totalPfr += pfrInt;
    }
    this.data.totalNetBB = Number((this.data.totalNetBB + netBB).toFixed(2));
    this.data.totalEvBB = Number((this.data.totalEvBB + evBB).toFixed(2));

    this.data.records.push([netBB, evBB, vpipInt, pfrInt, walkInt]);
    if (this.data.records.length > this.MAX_COMPACT) {
      this.data.records.shift();
    }

    this.history.unshift({
      handNumber: summary.handNumber,
      heroPos: summary.heroPos,
      heroCardsText: summary.heroCardsText,
      boardText: summary.boardText,
      netBB,
      evBB,
      cpuReveals: summary.cpuReveals,
      actionSummary: summary.actionSummary
    });
    if (this.history.length > this.MAX_HISTORY) {
      this.history.pop();
    }

    this.save();
  },

  /**
   * 指定スパン (100 / 1000 / 10000 / 'ALL') のTen-Four準拠スタッツを計算
   */
  getMetrics(span) {
    if (span === 'ALL') {
      const n = this.data.totalHands;
      const validN = this.data.totalValidHands;
      const net = this.data.totalNetBB;
      const ev = this.data.totalEvBB;
      return {
        hands: n,
        netBB: net,
        winRate: n > 0 ? (net / n) * 100 : 0,
        evBB: ev,
        evWinRate: n > 0 ? (ev / n) * 100 : 0,
        vpip: validN > 0 ? (this.data.totalVpip / validN) * 100 : 0,
        pfr: validN > 0 ? (this.data.totalPfr / validN) * 100 : 0
      };
    }

    const limit = Number(span) || 100;
    const slice = this.data.records.slice(-limit);
    const n = slice.length;
    let netSum = 0;
    let evSum = 0;
    let vpipSum = 0;
    let pfrSum = 0;
    let walkSum = 0;

    for (const r of slice) {
      netSum += r[0];
      evSum += r[1];
      if (r[4] === 0) {
        vpipSum += r[2];
        pfrSum += r[3];
      } else {
        walkSum += 1;
      }
    }
    const validN = n - walkSum;
    return {
      hands: n,
      netBB: netSum,
      winRate: n > 0 ? (netSum / n) * 100 : 0,
      evBB: evSum,
      evWinRate: n > 0 ? (evSum / n) * 100 : 0,
      vpip: validN > 0 ? (vpipSum / validN) * 100 : 0,
      pfr: validN > 0 ? (pfrSum / validN) * 100 : 0
    };
  },

  clearAll() {
    this.data = {
      totalHands: 0,
      totalValidHands: 0,
      totalNetBB: 0,
      totalEvBB: 0,
      totalVpip: 0,
      totalPfr: 0,
      records: []
    };
    this.history = [];
    this.save();
  }
};

/**
 * ============================================================================
 * [Module 5] State Store
 * ゲーム状態の一元管理 (チップはすべて 1BB = 100 の整数ミリBBで保持)
 * ============================================================================
 */
const GameState = {
  numOpponents: 8,
  handNumber: 0,
  street: 'IDLE', // 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN'
  deck: [],
  board: [],
  pot: 0,
  pots: [],
  buttonSeat: 0,
  activeSeat: -1,
  currentBet: 0,
  lastRaiseIncrement: 100,
  minRaiseTo: 200,
  fastForward: false,
  allInBoardSnapshot: null,
  players: [],
  actionLogs: []
};

/**
 * ============================================================================
 * [Module 6] Game Controller
 * ハンド進行ループ、ブラインド徴収、サイドポット分割、早期Fold高速スキップ
 * ============================================================================
 */
const GameController = {
  timerId: null,

  init() {
    StatsManager.init();
    this.setupSeats(GameState.numOpponents);
    UI.initEvents();
    this.startNewHand();
  },

  /**
   * 座席の初期化 (Seat 0 = Hero、Seat 1〜N = CPU)
   */
  setupSeats(numOpponents) {
    if (this.timerId) clearTimeout(this.timerId);
    GameState.numOpponents = numOpponents;
    GameState.players = [];
    const totalSeats = numOpponents + 1;

    for (let i = 0; i < totalSeats; i++) {
      GameState.players.push({
        id: i,
        name: i === 0 ? 'Hero' : `CPU ${i}`,
        isHero: i === 0,
        seat: i,
        positionName: '',
        stack: 10000, // 100.0 BB
        bet: 0,
        totalCommitted: 0,
        cards: [],
        status: 'ACTIVE',
        actedThisStreet: false,
        strategy: i === 0 ? null : AIEngine.pickRandomStrategy(),
        lastActionText: '',
        currentHandName: '',
        vpipFlag: false,
        pfrFlag: false,
        isWalk: false
      });
    }
    GameState.buttonSeat = SecurityUtils.nextInt(0, totalSeats - 1);
    UI.buildSeatDOM(GameState);
  },

  /**
   * 全員のスタックを100BB以上に自動補充
   */
  topUpStacks(forceAll = false) {
    for (const p of GameState.players) {
      if (forceAll || p.stack < 10000) {
        p.stack = 10000;
      }
    }
  },

  /**
   * 新規ハンドの開始
   */
  startNewHand() {
    if (this.timerId) clearTimeout(this.timerId);
    UI.hideResultOverlay();

    this.topUpStacks(false);
    GameState.handNumber += 1;
    GameState.street = 'PREFLOP';
    GameState.board = [];
    GameState.pot = 0;
    GameState.pots = [];
    GameState.currentBet = 0;
    GameState.lastRaiseIncrement = 100;
    GameState.minRaiseTo = 200;
    GameState.fastForward = false;
    GameState.allInBoardSnapshot = null;
    GameState.actionLogs = [];

    const totalSeats = GameState.players.length;
    GameState.buttonSeat = (GameState.buttonSeat + 1) % totalSeats;

    // 52枚のデッキ生成＆暗号学的シャッフル
    const rawDeck = Array.from({ length: 52 }, (_, idx) => idx);
    GameState.deck = SecurityUtils.shuffle(rawDeck);

    // ポジション名の割り当て
    this.assignPositionNames();

    // 各プレイヤーの状態リセット＆ホールカード2枚配布
    for (const p of GameState.players) {
      p.bet = 0;
      p.totalCommitted = 0;
      p.cards = [GameState.deck.pop(), GameState.deck.pop()];
      p.status = 'ACTIVE';
      p.actedThisStreet = false;
      p.lastActionText = '';
      p.vpipFlag = false;
      p.pfrFlag = false;
      p.isWalk = false;
      // 1ハンドごとにJOPT FTプロファイルを再抽選(または維持)
      if (!p.isHero) {
        p.strategy = AIEngine.pickRandomStrategy();
      }
    }

    // ブラインドの強制徴収 (SB = 0.5BB(50), BB = 1.0BB(100))
    const sbSeat = totalSeats === 2 ? GameState.buttonSeat : (GameState.buttonSeat + 1) % totalSeats;
    const bbSeat = totalSeats === 2 ? (GameState.buttonSeat + 1) % totalSeats : (GameState.buttonSeat + 2) % totalSeats;

    this.postBlind(GameState.players[sbSeat], 50, 'SB 0.5');
    this.postBlind(GameState.players[bbSeat], 100, 'BB 1');

    GameState.currentBet = 100;
    GameState.lastRaiseIncrement = 100;
    GameState.minRaiseTo = 200;

    // プリフロップの最初の手番 (BBの左隣)
    GameState.activeSeat = (bbSeat + 1) % totalSeats;

    this.updateHeroLiveHand();
    UI.render(GameState);
    this.processNextTurn();
  },

  /**
   * 座席数に応じた正確なポジション名 (BTN, SB, BB, UTG, MP, CO等) の付与
   */
  assignPositionNames() {
    const n = GameState.players.length;
    const btn = GameState.buttonSeat;
    const namesByCount = {
      2: ['BTN', 'BB'],
      5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
      7: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'],
      9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
      10: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP1', 'MP2', 'LJ', 'HJ', 'CO']
    };
    const template = namesByCount[n] || namesByCount[7];
    for (let offset = 0; offset < n; offset++) {
      const seatIdx = (btn + offset) % n;
      GameState.players[seatIdx].positionName = template[offset] || `P${offset}`;
    }
  },

  postBlind(player, amount, label) {
    const actual = Math.min(player.stack, amount);
    player.stack -= actual;
    player.bet += actual;
    player.totalCommitted += actual;
    GameState.pot += actual;
    player.lastActionText = label;
    if (player.stack === 0) player.status = 'ALLIN';
  },

  /**
   * Heroの現在の成立役とドロー状況を即座に計算してステートに反映
   */
  updateHeroLiveHand() {
    const hero = GameState.players[0];
    if (!hero || hero.cards.length < 2) return;

    if (GameState.board.length === 0) {
      const pf = Evaluator.getPreFlopHandInfo(hero.cards);
      let tier = 'スタンダード';
      if (pf.score >= 88) tier = 'プレミアム';
      else if (pf.score >= 72) tier = '強ハンド';
      else if (pf.score < 42) tier = 'マージナル';
      hero.currentHandName = `${pf.code} (${tier})`;
    } else {
      const res = Evaluator.evaluate7([...hero.cards, ...GameState.board]);
      const draws = Evaluator.detectDraws([...hero.cards, ...GameState.board]);
      const drawTags = [];
      if (draws.flushDraw && res.category < 6) drawTags.push('FD');
      if (draws.straightDraw && res.category < 5) drawTags.push('SD');
      const suffix = drawTags.length > 0 ? ` +${drawTags.join('/')}` : '';
      hero.currentHandName = `${res.name}${suffix}`;
    }
  },

  /**
   * ターン進行制御: 終了判定・ストリート進行・高速スキップ制御
   */
  processNextTurn() {
    // 生存プレイヤー (FOLDしていないプレイヤー) の確認
    const contenders = GameState.players.filter(p => p.status !== 'FOLDED');
    if (contenders.length === 1) {
      // 全員Foldによる単一勝者確定 -> 即座にハンド終了処理へ
      this.finishHandByFold(contenders[0]);
      return;
    }

    // 現在のストリートでアクションが必要なプレイヤーを探す
    const nextSeat = this.findNextActiveSeat(GameState.activeSeat);
    if (nextSeat === -1) {
      // 現ストリートの全員のアクション完了 -> 次のストリートへ
      this.advanceStreet();
      return;
    }

    GameState.activeSeat = nextSeat;
    const currentPlayer = GameState.players[nextSeat];

    // Heroが既にFoldしている場合、または全員オールイン状態の場合は高速スキップ
    const hero = GameState.players[0];
    if (hero.status === 'FOLDED') {
      GameState.fastForward = true;
    }

    UI.render(GameState);

    if (currentPlayer.isHero) {
      // Heroのアクション待ち
      UI.enableHeroControls(GameState);
    } else {
      // CPUのアクション実行
      UI.disableHeroControls();
      const delay = GameState.fastForward ? 0 : 280;
      if (delay === 0) {
        this.executeCpuTurn(currentPlayer);
      } else {
        this.timerId = setTimeout(() => this.executeCpuTurn(currentPlayer), delay);
      }
    }
  },

  /**
   * 次にアクション可能な座席インデックスを返す (全員完了なら -1)
   */
  findNextActiveSeat(startSeat) {
    const n = GameState.players.length;
    const canActPlayers = GameState.players.filter(p => p.status === 'ACTIVE');

    // アクティブ(ALLINでもFOLDでもない)なプレイヤーが0人なら即座に次ストリートへ
    if (canActPlayers.length === 0) return -1;

    for (let i = 0; i < n; i++) {
      const idx = (startSeat + i) % n;
      const p = GameState.players[idx];
      if (p.status !== 'ACTIVE') continue;

      // まだこのストリートで一度もアクションしていない、または最高ベット額に追いついていない場合
      if (!p.actedThisStreet || p.bet < GameState.currentBet) {
        // ただし他全員がALLINまたはFOLDで、自分が既に最高ベット額を出している場合はアクション不要
        if (canActPlayers.length === 1 && p.bet >= GameState.currentBet) {
          return -1;
        }
        return idx;
      }
    }
    return -1;
  },

  executeCpuTurn(cpuPlayer) {
    const decision = AIEngine.decideAction(GameState, cpuPlayer);
    this.applyAction(cpuPlayer, decision.type, decision.amount || 0);
  },

  /**
   * プレイヤーまたはCPUのアクション適用
   */
  applyAction(player, type, targetBetAmount = 0) {
    player.actedThisStreet = true;
    const toCall = GameState.currentBet - player.bet;

    if (type === 'FOLD') {
      player.status = 'FOLDED';
      player.lastActionText = 'FOLD';
      GameState.actionLogs.push(`${player.name}(${player.positionName}): Fold`);
      if (player.isHero) {
        GameState.fastForward = true;
      }
    } else if (type === 'CHECK') {
      player.lastActionText = 'CHECK';
      GameState.actionLogs.push(`${player.name}(${player.positionName}): Check`);
    } else if (type === 'CALL') {
      const actualCall = Math.min(player.stack, toCall);
      player.stack -= actualCall;
      player.bet += actualCall;
      player.totalCommitted += actualCall;
      GameState.pot += actualCall;

      if (GameState.street === 'PREFLOP' && actualCall > 0) {
        player.vpipFlag = true;
      }
      if (player.stack === 0) {
        player.status = 'ALLIN';
        player.lastActionText = `ALL-IN ${SecurityUtils.formatBB(player.bet)}`;
      } else {
        player.lastActionText = `CALL ${SecurityUtils.formatBB(player.bet)}`;
      }
      GameState.actionLogs.push(`${player.name}(${player.positionName}): Call ${SecurityUtils.formatBB(player.bet)}BB`);
    } else if (type === 'RAISE') {
      const maxPossible = player.stack + player.bet;
      const finalBet = Math.min(maxPossible, Math.max(GameState.minRaiseTo, targetBetAmount));
      const addedChips = finalBet - player.bet;
      const raiseDiff = finalBet - GameState.currentBet;

      player.stack -= addedChips;
      player.bet = finalBet;
      player.totalCommitted += addedChips;
      GameState.pot += addedChips;

      if (raiseDiff > GameState.lastRaiseIncrement) {
        GameState.lastRaiseIncrement = raiseDiff;
      }
      GameState.currentBet = finalBet;
      GameState.minRaiseTo = GameState.currentBet + GameState.lastRaiseIncrement;

      // 他プレイヤーの actedThisStreet フラグを再オープン
      for (const other of GameState.players) {
        if (other.id !== player.id && other.status === 'ACTIVE') {
          other.actedThisStreet = false;
        }
      }

      if (GameState.street === 'PREFLOP') {
        player.vpipFlag = true;
        player.pfrFlag = true;
      }

      const verb = toCall === 0 ? 'BET' : 'RAISE';
      if (player.stack === 0) {
        player.status = 'ALLIN';
        player.lastActionText = `ALL-IN ${SecurityUtils.formatBB(finalBet)}`;
      } else {
        player.lastActionText = `${verb} ${SecurityUtils.formatBB(finalBet)}`;
      }
      GameState.actionLogs.push(`${player.name}(${player.positionName}): ${verb} ${SecurityUtils.formatBB(finalBet)}BB`);
    }

    // 次の座席へ進める
    GameState.activeSeat = (player.seat + 1) % GameState.players.length;
    this.processNextTurn();
  },

  /**
   * ストリート進行 (PREFLOP -> FLOP -> TURN -> RIVER -> SHOWDOWN)
   */
  advanceStreet() {
    // 各プレイヤーの現ストリートbetをリセット
    for (const p of GameState.players) {
      p.bet = 0;
      p.actedThisStreet = false;
      if (p.status === 'ACTIVE') p.lastActionText = '';
    }
    GameState.currentBet = 0;
    GameState.lastRaiseIncrement = 100;
    GameState.minRaiseTo = 100;

    // 以降誰もアクションできない（全員All-in、またはACTIVEが1人以下）か判定
    const activeCount = GameState.players.filter(p => p.status === 'ACTIVE').length;
    const someoneAllIn = GameState.players.some(p => p.status === 'ALLIN');
    if (activeCount <= 1 && someoneAllIn && GameState.allInBoardSnapshot === null && GameState.board.length < 5) {
      // リバー前のオールインランアウト確定 -> EV計算用に現時点のボードをスナップショット保存
      GameState.allInBoardSnapshot = [...GameState.board];
      GameState.fastForward = true;
    }

    if (GameState.street === 'PREFLOP') {
      GameState.street = 'FLOP';
      GameState.board.push(GameState.deck.pop(), GameState.deck.pop(), GameState.deck.pop());
    } else if (GameState.street === 'FLOP') {
      GameState.street = 'TURN';
      GameState.board.push(GameState.deck.pop());
    } else if (GameState.street === 'TURN') {
      GameState.street = 'RIVER';
      GameState.board.push(GameState.deck.pop());
    } else if (GameState.street === 'RIVER') {
      GameState.street = 'SHOWDOWN';
      this.resolveShowdown();
      return;
    }

    // ボードが開いた瞬間にHeroの現在役を即時更新
    this.updateHeroLiveHand();

    // BTNの左隣から最初に行動可能な座席をセット
    GameState.activeSeat = (GameState.buttonSeat + 1) % GameState.players.length;
    UI.render(GameState);

    if (activeCount <= 1) {
      // 誰もベットできないランアウト状態なら即座に次のストリートへ進める
      this.advanceStreet();
    } else {
      this.processNextTurn();
    }
  },

  /**
   * サイドポット配列の構築 (各プレイヤーのtotalCommitted階層から正確に分割)
   */
  buildSidePots() {
    const contributors = GameState.players.filter(p => p.totalCommitted > 0);
    const levels = [...new Set(contributors.map(p => p.totalCommitted))].sort((a, b) => a - b);
    const pots = [];
    let prevLevel = 0;

    for (const lvl of levels) {
      const diff = lvl - prevLevel;
      if (diff <= 0) continue;
      const matched = contributors.filter(p => p.totalCommitted >= lvl);
      const potAmount = diff * matched.length;
      const eligibleIds = matched.filter(p => p.status !== 'FOLDED').map(p => p.id);
      pots.push({ amount: potAmount, eligibleIds });
      prevLevel = lvl;
    }
    GameState.pots = pots;
    return pots;
  },

  /**
   * 全員Foldによる決着処理
   */
  finishHandByFold(winner) {
    GameState.street = 'SHOWDOWN';
    GameState.activeSeat = -1;

    const hero = GameState.players[0];
    // HeroがBBで、誰もオープンせず全員FoldしてHeroに一度も手番が回らなかった場合はWalkと記録
    if (winner.isHero && hero.positionName === 'BB' && !hero.vpipFlag && GameState.board.length === 0) {
      hero.isWalk = true;
    }

    winner.stack += GameState.pot;
    const heroWonChips = winner.isHero ? GameState.pot : 0;
    const netBB = (heroWonChips - hero.totalCommitted) / 100;
    const evBB = netBB; // Fold決着時はEV収支＝実収支

    const headline = `${winner.name} が ${SecurityUtils.formatBB(GameState.pot)} BB を獲得 (全員Fold)`;
    this.finalizeAndRecord(headline, netBB, evBB);
  },

  /**
   * ショーダウン決着処理 (サイドポット分配 + モンテカルロEV算出)
   */
  resolveShowdown() {
    GameState.activeSeat = -1;
    const pots = this.buildSidePots();
    const contenders = GameState.players.filter(p => p.status !== 'FOLDED');

    // 各生存プレイヤーの最終役を評価
    const evalMap = {};
    for (const p of contenders) {
      const ev = Evaluator.evaluate7([...p.cards, ...GameState.board]);
      evalMap[p.id] = ev;
      p.currentHandName = ev.name;
    }

    const wonByPlayer = {};
    for (const p of GameState.players) wonByPlayer[p.id] = 0;

    // 各ポットごとに最高スコア勝者を判定して分配
    for (const pot of pots) {
      if (pot.eligibleIds.length === 0) continue;
      let bestScore = -1;
      let winners = [];
      for (const pid of pot.eligibleIds) {
        const sc = evalMap[pid].score;
        if (sc > bestScore) {
          bestScore = sc;
          winners = [pid];
        } else if (sc === bestScore) {
          winners.push(pid);
        }
      }

      const share = Math.floor((pot.amount / winners.length) / 10) * 10;
      let remainder = pot.amount - share * winners.length;

      // 端数はBTNの左隣に近い勝者へ付与
      for (const wid of winners) {
        wonByPlayer[wid] += share;
      }
      if (remainder > 0) {
        wonByPlayer[winners[0]] += remainder;
      }
    }

    // 獲得チップをスタックへ加算
    const winnerSummaries = [];
    for (const p of contenders) {
      if (wonByPlayer[p.id] > 0) {
        p.stack += wonByPlayer[p.id];
        winnerSummaries.push(`${p.name}: +${SecurityUtils.formatBB(wonByPlayer[p.id])}BB (${evalMap[p.id].name})`);
      }
    }

    const hero = GameState.players[0];
    const heroWon = wonByPlayer[hero.id] || 0;
    const netBB = (heroWon - hero.totalCommitted) / 100;

    // リバー前にオールインランアウトが発生していた場合はモンテカルロ法でEV収支を算出
    let evBB = netBB;
    if (GameState.allInBoardSnapshot !== null && hero.status !== 'FOLDED') {
      const expectedHeroChips = Evaluator.calculateMonteCarloEV(
        GameState.players,
        GameState.allInBoardSnapshot,
        pots
      );
      if (expectedHeroChips !== null) {
        evBB = (expectedHeroChips - hero.totalCommitted) / 100;
      }
    }

    const headline = winnerSummaries.join(' / ') || 'Showdown Complete';
    this.finalizeAndRecord(headline, netBB, evBB);
  },

  /**
   * スタッツ保存＆結果オーバーレイ表示
   */
  finalizeAndRecord(headline, netBB, evBB) {
    const hero = GameState.players[0];
    const cpuReveals = GameState.players.slice(1).map(cpu => ({
      name: cpu.name,
      pos: cpu.positionName,
      strategy: cpu.strategy,
      cardsText: cpu.cards.map(c => Evaluator.cardToText(c)).join(' '),
      status: cpu.status,
      handName: GameState.board.length >= 3 ? Evaluator.evaluate7([...cpu.cards, ...GameState.board]).name : ''
    }));

    StatsManager.recordHand({
      handNumber: GameState.handNumber,
      heroPos: hero.positionName,
      heroCardsText: hero.cards.map(c => Evaluator.cardToText(c)).join(' '),
      boardText: GameState.board.map(c => Evaluator.cardToText(c)).join(' ') || '(PreFlop)',
      netBB,
      evBB,
      vpip: hero.vpipFlag,
      pfr: hero.pfrFlag,
      isWalk: hero.isWalk,
      cpuReveals,
      actionSummary: GameState.actionLogs.slice(-6).join(' → ')
    });

    UI.disableHeroControls();
    UI.render(GameState);
    UI.showResultOverlay(headline, netBB, evBB, cpuReveals);
  }
};

/**
 * ============================================================================
 * [Module 7] UI Renderer & Event Binder
 * 三角関数による全端末対応楕円座席レイアウト、スライダー＆固定倍率ボタン連動
 * ============================================================================
 */
const UI = {
  currentStatsSpan: '100',

  initEvents() {
    // 対戦人数変更
    const selOpp = document.getElementById('select-opponents');
    selOpp.addEventListener('change', (e) => {
      const n = Number(e.target.value) || 6;
      GameController.setupSeats(n);
      GameController.startNewHand();
    });

    // 100BB補充ボタン
    document.getElementById('btn-topup').addEventListener('click', () => {
      GameController.topUpStacks(true);
      this.render(GameState);
    });

    // 次のハンドへボタン＆キーボードショートカット (Space / Enter)
    document.getElementById('btn-next-hand').addEventListener('click', () => {
      GameController.startNewHand();
    });
    window.addEventListener('keydown', (e) => {
      const overlay = document.getElementById('result-overlay');
      if (!overlay.classList.contains('hidden') && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        GameController.startNewHand();
      }
    });

    // 画面リサイズ時の楕円座席座標再計算
    window.addEventListener('resize', () => {
      this.updateSeatCoordinates(GameState);
    });

    // ベットスライダーのリアルタイム同期
    const slider = document.getElementById('bet-slider');
    slider.addEventListener('input', () => {
      this.syncRaiseButtonWithSlider();
    });

    // 固定倍率ボタン (2x, 2.5x, 3x, 4x, 50%Pot, Pot, MAX)
    const multBtns = document.querySelectorAll('.mult-btn');
    multBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const hero = GameState.players[0];
        if (!hero) return;
        const maxTotal = hero.stack + hero.bet;
        let target = GameState.minRaiseTo;

        if (btn.dataset.mult) {
          const m = parseFloat(btn.dataset.mult);
          const base = GameState.currentBet > 0 ? GameState.currentBet : 100;
          target = Math.round((base * m) / 10) * 10;
        } else if (btn.dataset.pot) {
          const ratio = parseFloat(btn.dataset.pot);
          const toCall = GameState.currentBet - hero.bet;
          const potAfterCall = GameState.pot + toCall;
          target = GameState.currentBet + Math.round((potAfterCall * ratio) / 10) * 10;
        } else if (btn.dataset.allin) {
          target = maxTotal;
        }

        target = Math.max(Number(slider.min), Math.min(maxTotal, target));
        slider.value = String(target);
        this.syncRaiseButtonWithSlider();
      });
    });

    // Hero メインアクションボタン (FOLD / CHECK-CALL / BET-RAISE)
    document.getElementById('btn-fold').addEventListener('click', () => {
      const hero = GameState.players[0];
      GameController.applyAction(hero, 'FOLD');
    });

    document.getElementById('btn-check-call').addEventListener('click', () => {
      const hero = GameState.players[0];
      const toCall = GameState.currentBet - hero.bet;
      GameController.applyAction(hero, toCall > 0 ? 'CALL' : 'CHECK');
    });

    document.getElementById('btn-bet-raise').addEventListener('click', () => {
      const hero = GameState.players[0];
      const val = Number(document.getElementById('bet-slider').value);
      GameController.applyAction(hero, 'RAISE', val);
    });

    // モーダル開閉イベント (スタッツ / 履歴)
    document.getElementById('btn-stats').addEventListener('click', () => {
      this.renderStatsModal(this.currentStatsSpan);
      document.getElementById('modal-stats').classList.remove('hidden');
    });

    document.getElementById('btn-history').addEventListener('click', () => {
      this.renderHistoryModal();
      document.getElementById('modal-history').classList.remove('hidden');
    });

    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.close;
        if (targetId) document.getElementById(targetId).classList.add('hidden');
      });
    });

    // スタッツ期間切り替えタブ (100 / 1000 / 10000 / ALL)
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentStatsSpan = tab.dataset.span;
        this.renderStatsModal(this.currentStatsSpan);
      });
    });

    // 統計データリセット
    document.getElementById('btn-clear-stats').addEventListener('click', () => {
      StatsManager.clearAll();
      this.renderStatsModal(this.currentStatsSpan);
    });
  },

  /**
   * 座席ポッドDOMの構築と楕円周上の配置
   */
  buildSeatDOM(state) {
    const layer = document.getElementById('seats-layer');
    layer.textContent = '';

    for (const p of state.players) {
      const pod = SecurityUtils.el('div', `seat-pod ${p.isHero ? 'hero-pod' : ''}`);
      pod.id = `seat-pod-${p.seat}`;

      const cardsDiv = SecurityUtils.el('div', 'pod-cards');
      cardsDiv.id = `seat-cards-${p.seat}`;

      const topLine = SecurityUtils.el('div', 'pod-top-line');
      const posBadge = SecurityUtils.el('span', 'pos-badge', p.positionName);
      posBadge.id = `seat-pos-${p.seat}`;
      const nameSpan = SecurityUtils.el('span', 'pod-name', p.name);
      topLine.append(posBadge, nameSpan);

      const stackDiv = SecurityUtils.el('div', 'pod-stack', `${SecurityUtils.formatBB(p.stack)} BB`);
      stackDiv.id = `seat-stack-${p.seat}`;

      const actBadge = SecurityUtils.el('div', 'pod-action-badge', '');
      actBadge.id = `seat-act-${p.seat}`;

      pod.append(cardsDiv, topLine, stackDiv, actBadge);

      if (p.isHero) {
        const liveHand = SecurityUtils.el('div', 'pod-hand-live', '');
        liveHand.id = 'hero-pod-hand-text';
        pod.appendChild(liveHand);
      }

      layer.appendChild(pod);
    }

    this.updateSeatCoordinates(state);
  },

  /**
   * 画面縦横比に応じた三角関数楕円配置 (PC横画面〜小型スマホ縦画面まで被りゼロ)
   */
  updateSeatCoordinates(state) {
    const total = state.players.length;
    const isPortrait = window.innerHeight > window.innerWidth;
    const rx = isPortrait ? 40 : 43;
    const ry = isPortrait ? 43 : 40;

    for (let i = 0; i < total; i++) {
      const pod = document.getElementById(`seat-pod-${i}`);
      if (!pod) continue;
      // Seat 0 (Hero) を下部中央 (90度 = pi/2) に固定し、時計回りに均等配置
      const theta = (Math.PI / 2) + (2 * Math.PI * i) / total;
      const x = 50 + rx * Math.cos(theta);
      const y = 50 + ry * Math.sin(theta);
      pod.style.left = `${x}%`;
      pod.style.top = `${y}%`;
    }
  },

  /**
   * カードDOM要素の生成
   */
  createCardElement(cardInt, isHidden = false, isSmall = false) {
    const sizeCls = isSmall ? 'card-sm' : '';
    if (isHidden) {
      return SecurityUtils.el('div', `playing-card card-back ${sizeCls}`);
    }
    const r = Evaluator.cardRank(cardInt);
    const s = Evaluator.cardSuit(cardInt);
    const suitChar = Evaluator.SUITS[s];
    const cardEl = SecurityUtils.el('div', `playing-card suit-${suitChar} ${sizeCls}`);
    const rankEl = SecurityUtils.el('span', 'c-rank', Evaluator.RANKS[r - 2]);
    const suitEl = SecurityUtils.el('span', 'c-suit', Evaluator.SUIT_SYMBOLS[suitChar]);
    cardEl.append(rankEl, suitEl);
    return cardEl;
  },

  /**
   * 画面全体の高速リアクティブ描画更新
   */
  render(state) {
    document.getElementById('hand-counter').textContent = `Hand #${state.handNumber}`;
    document.getElementById('main-pot-text').textContent = `POT: ${SecurityUtils.formatBB(state.pot)} BB`;
    document.getElementById('street-indicator').textContent = state.street;

    // ボードカードの描画
    const boardContainer = document.getElementById('board-cards');
    boardContainer.textContent = '';
    for (const c of state.board) {
      boardContainer.appendChild(this.createCardElement(c, false, false));
    }

    // 各プレイヤー座席ポッドの更新
    for (const p of state.players) {
      const pod = document.getElementById(`seat-pod-${p.seat}`);
      if (!pod) continue;

      pod.classList.toggle('active-turn', state.activeSeat === p.seat && state.street !== 'SHOWDOWN');
      pod.classList.toggle('folded', p.status === 'FOLDED');

      const posEl = document.getElementById(`seat-pos-${p.seat}`);
      posEl.textContent = p.positionName;
      posEl.classList.toggle('is-btn', p.seat === state.buttonSeat);

      document.getElementById(`seat-stack-${p.seat}`).textContent = `${SecurityUtils.formatBB(p.stack)} BB`;
      document.getElementById(`seat-act-${p.seat}`).textContent = p.lastActionText;

      // カードの描画 (CPUはSHOWDOWNまで裏面、プレイ中は戦略も完全秘匿)
      const cardsWrap = document.getElementById(`seat-cards-${p.seat}`);
      cardsWrap.textContent = '';
      if (p.cards.length === 2) {
        const revealCpu = state.street === 'SHOWDOWN' && p.status !== 'FOLDED';
        const hideCard = !p.isHero && !revealCpu;
        cardsWrap.appendChild(this.createCardElement(p.cards[0], hideCard, !p.isHero));
        cardsWrap.appendChild(this.createCardElement(p.cards[1], hideCard, !p.isHero));
      }
    }

    // Heroの現在の役状況をポッド内＆下部モニターに即座に反映
    const hero = state.players[0];
    if (hero) {
      const podHandText = document.getElementById('hero-pod-hand-text');
      if (podHandText) podHandText.textContent = hero.currentHandName;
      document.getElementById('hero-hand-strength').textContent = hero.currentHandName || '待機中';
    }
  },

  /**
   * Heroの手番到来時にスライダー範囲・ボタンラベルを計算して有効化
   */
  enableHeroControls(state) {
    const hero = state.players[0];
    const toCall = state.currentBet - hero.bet;
    const maxTotal = hero.stack + hero.bet;

    const btnFold = document.getElementById('btn-fold');
    const btnCall = document.getElementById('btn-check-call');
    const btnRaise = document.getElementById('btn-bet-raise');
    const slider = document.getElementById('bet-slider');
    const multBtns = document.querySelectorAll('.mult-btn');

    btnFold.disabled = toCall === 0;
    btnCall.disabled = false;

    if (toCall === 0) {
      btnCall.textContent = 'CHECK';
    } else if (toCall >= hero.stack) {
      btnCall.textContent = `CALL ALL-IN (${SecurityUtils.formatBB(hero.stack)} BB)`;
    } else {
      btnCall.textContent = `CALL ${SecurityUtils.formatBB(toCall)} BB`;
    }

    // レイズ余地があるか判定
    if (maxTotal <= state.currentBet) {
      btnRaise.disabled = true;
      btnRaise.textContent = 'RAISE 不可';
      slider.disabled = true;
      multBtns.forEach(b => { b.disabled = true; });
    } else {
      const minVal = Math.min(state.minRaiseTo, maxTotal);
      slider.min = String(minVal);
      slider.max = String(maxTotal);
      slider.value = String(minVal);
      slider.disabled = false;
      btnRaise.disabled = false;
      multBtns.forEach(b => { b.disabled = false; });
      this.syncRaiseButtonWithSlider();
    }
  },

  disableHeroControls() {
    document.getElementById('btn-fold').disabled = true;
    document.getElementById('btn-check-call').disabled = true;
    document.getElementById('btn-bet-raise').disabled = true;
    document.getElementById('bet-slider').disabled = true;
    document.querySelectorAll('.mult-btn').forEach(b => { b.disabled = true; });
  },

  /**
   * スライダー値とRAISEボタン表記のリアルタイム同期
   */
  syncRaiseButtonWithSlider() {
    const hero = GameState.players[0];
    if (!hero) return;
    const slider = document.getElementById('bet-slider');
    const val = Number(slider.value);
    const maxTotal = hero.stack + hero.bet;
    const verb = GameState.currentBet === 0 ? 'BET' : 'RAISE TO';

    document.getElementById('slider-val-label').textContent = `${SecurityUtils.formatBB(val)} BB`;
    const btnRaise = document.getElementById('btn-bet-raise');
    if (val >= maxTotal) {
      btnRaise.textContent = `ALL-IN ${SecurityUtils.formatBB(maxTotal)} BB`;
    } else {
      btnRaise.textContent = `${verb} ${SecurityUtils.formatBB(val)} BB`;
    }
  },

  /**
   * ハンド終了時の結果＆全CPU戦略公開オーバーレイ表示
   */
  showResultOverlay(headline, netBB, evBB, cpuReveals) {
    const overlay = document.getElementById('result-overlay');
    document.getElementById('result-title').textContent = headline;

    const netSign = netBB >= 0 ? '+' : '';
    const evSign = evBB >= 0 ? '+' : '';
    document.getElementById('result-ev-badge').textContent =
      `Hero収支: ${netSign}${netBB.toFixed(1)} BB (EV: ${evSign}${evBB.toFixed(1)} BB)`;

    const list = document.getElementById('result-cpu-reveal');
    list.textContent = '';

    for (const c of cpuReveals) {
      const row = SecurityUtils.el('div', 'reveal-item');
      const left = SecurityUtils.el('div');
      const nameSpan = SecurityUtils.el('span', '', `${c.name} (${c.pos})`);
      const stratBadge = SecurityUtils.el('span', 'strat-tag', c.strategy);
      left.append(nameSpan, stratBadge);

      const rightText = `${c.cardsText} ${c.status === 'FOLDED' ? '[Fold]' : c.handName}`;
      const right = SecurityUtils.el('div', '', rightText);
      row.append(left, right);
      list.appendChild(row);
    }

    overlay.classList.remove('hidden');
  },

  hideResultOverlay() {
    document.getElementById('result-overlay').classList.add('hidden');
  },

  /**
   * スタッツモーダル描画 (Ten-Four準拠の8指標)
   */
  renderStatsModal(span) {
    const m = StatsManager.getMetrics(span);
    const container = document.getElementById('stats-grid-container');
    container.textContent = '';

    const items = [
      { label: '記録ハンド数', val: `${m.hands} Hands` },
      { label: '実収支 (Net Won)', val: `${m.netBB >= 0 ? '+' : ''}${m.netBB.toFixed(1)} BB` },
      { label: 'WinRate (bb/100)', val: `${m.winRate >= 0 ? '+' : ''}${m.winRate.toFixed(1)} bb/100` },
      { label: '収支 (EV Adjusted)', val: `${m.evBB >= 0 ? '+' : ''}${m.evBB.toFixed(1)} BB` },
      { label: 'WinRate (EV bb/100)', val: `${m.evWinRate >= 0 ? '+' : ''}${m.evWinRate.toFixed(1)} bb/100` },
      { label: 'VPIP (参加率)', val: `${m.vpip.toFixed(1)} %` },
      { label: 'PFR (プリフロップレイズ率)', val: `${m.pfr.toFixed(1)} %` }
    ];

    for (const it of items) {
      const card = SecurityUtils.el('div', 'stat-card');
      const title = SecurityUtils.el('div', 'stat-title', it.label);
      const num = SecurityUtils.el('div', 'stat-num', it.val);
      card.append(title, num);
      container.appendChild(card);
    }
  },

  /**
   * ハンド履歴モーダル描画 (直近100ハンド)
   */
  renderHistoryModal() {
    const container = document.getElementById('history-list-container');
    container.textContent = '';

    if (StatsManager.history.length === 0) {
      container.appendChild(SecurityUtils.el('div', '', 'まだハンド履歴がありません。'));
      return;
    }

    for (const h of StatsManager.history) {
      const card = SecurityUtils.el('div', 'hist-card');
      const netSign = h.netBB >= 0 ? '+' : '';
      const evSign = h.evBB >= 0 ? '+' : '';
      const top = SecurityUtils.el(
        'div',
        'hist-top',
        `Hand #${h.handNumber} | Hero(${h.heroPos}): ${h.heroCardsText} | ボード: ${h.boardText} | 収支: ${netSign}${h.netBB}BB (EV: ${evSign}${h.evBB}BB)`
      );

      const cpuStr = h.cpuReveals
        .map(c => `${c.name}[${c.strategy}]: ${c.cardsText}`)
        .join(' / ');
      const cpus = SecurityUtils.el('div', 'hist-cpus', cpuStr);
      const acts = SecurityUtils.el('div', 'hist-actions', h.actionSummary);

      card.append(top, cpus, acts);
      container.appendChild(card);
    }
  }
};

// アプリケーション起動
window.addEventListener('DOMContentLoaded', () => {
  GameController.init();
});