import { MILLI_BB, MIN_CHIP_UNIT } from '../constants.js';

/**
 * ミリBB（整数）を画面表示用のBB文字列（小数点第1位）に変換する
 * @param {number} milliBB - ミリBB単位の整数
 * @returns {string} 例: "12.5"
 */
export function formatBB(milliBB) {
  const bb = (milliBB || 0) / MILLI_BB;
  return bb.toFixed(1);
}

/**
 * 任意のミリBB値を最小チップ単位（0.1BB = 100ミリBB）に丸める
 * @param {number} milliBB 
 * @returns {number}
 */
export function roundToChipUnit(milliBB) {
  return Math.round(milliBB / MIN_CHIP_UNIT) * MIN_CHIP_UNIT;
}