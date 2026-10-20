/**
 * M04 死局检测器 DeadlockDetector（领域层，零浏览器依赖）
 *
 * 判定棋盘上是否存在至少一次可形成消除的交换，并在无解时生成
 * 一个保证有解的重排。第 5.7 节规定：重试 20 次仍不通过时，
 * 直接在随机位置强制构造一对可消除元素，保证流程必然收敛。
 */

import { isValidSwap, findMatches, key } from './matchEngine.js';

export const MAX_RESHUFFLE_ATTEMPTS = 20;

/** 找出任意一次可行交换，找不到返回 null */
export function findAnyValidMove(board) {
  // 彩虹元素与任意相邻元素交换都有效，直接视为存在可行交换（EX-5 冰冻中除外）
  for (let r = 0; r < board.rows; r += 1) {
    for (let c = 0; c < board.cols; c += 1) {
      if (board.specialAt(r, c) === 'rainbow' && board.iceAt(r, c) === 0) {
        if (board.rules?.specialCycle && board.isSpecialFrozen(r, c)) continue;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rr = r + dr;
          const cc = c + dc;
          if (board.isFree(rr, cc)) return { a: { r, c }, b: { r: rr, c: cc } };
        }
      }
    }
  }

  for (let r = 0; r < board.rows; r += 1) {
    for (let c = 0; c < board.cols; c += 1) {
      if (!board.isFree(r, c)) continue;
      if (c + 1 < board.cols && board.isFree(r, c + 1)) {
        const a = { r, c };
        const b = { r, c: c + 1 };
        if (isValidSwap(board, a, b)) return { a, b };
      }
      if (r + 1 < board.rows && board.isFree(r + 1, c)) {
        const a = { r, c };
        const b = { r: r + 1, c };
        if (isValidSwap(board, a, b)) return { a, b };
      }
    }
  }
  return null;
}

export function hasValidMove(board) {
  return findAnyValidMove(board) !== null;
}

/** 兜底：在随机位置构造一次必然可行的交换 */
export function forceValidMove(board, rng) {
  const candidates = [];
  for (let r = 1; r < board.rows; r += 1) {
    for (let c = 0; c + 2 < board.cols; c += 1) {
      if (board.isFree(r, c) && board.isFree(r, c + 1) && board.isFree(r, c + 2) && board.isFree(r - 1, c)) {
        candidates.push({ r, c });
      }
    }
  }
  if (!candidates.length) return false;
  const { r, c } = candidates[rng ? rng.int(candidates.length) : 0];
  const a = rng ? rng.int(board.elementTypes) : 0;
  const b = (a + 1 + (rng ? rng.int(board.elementTypes - 1) : 0)) % board.elementTypes;
  // 摆成  B A A  /  A
  //              ↑ 把上面的 A 换下来即形成 AAA
  board.setType(r, c, b);
  board.setType(r, c + 1, a);
  board.setType(r, c + 2, a);
  board.setType(r - 1, c, a);
  return true;
}

/**
 * 重排整个棋盘，保证结果既没有现成连线，也至少存在一次可行交换。
 * 重排不需要消耗步数（由调用方保证），冰块与不可用格原地不动。
 */
export function reshuffle(board, rng, attempts = MAX_RESHUFFLE_ATTEMPTS) {
  const positions = [];
  const tiles = [];
  board.eachCell((r, c) => {
    if (board.isFree(r, c) && board.typeAt(r, c) >= 0) {
      positions.push({ r, c });
      tiles.push({ type: board.typeAt(r, c), special: board.specialAt(r, c) });
    }
  });
  if (positions.length < 3) return false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (rng) rng.shuffle(tiles);
    positions.forEach((pos, i) => board.setType(pos.r, pos.c, tiles[i].type, tiles[i].special));
    if (findMatches(board).length === 0 && hasValidMove(board)) return true;
  }

  forceValidMove(board, rng);
  return false;
}

/** 供调试与诊断：返回所有可行交换的数量 */
export function countValidMoves(board, limit = 64) {
  let n = 0;
  const seen = new Set();
  for (let r = 0; r < board.rows; r += 1) {
    for (let c = 0; c < board.cols; c += 1) {
      if (!board.isFree(r, c)) continue;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (!board.isFree(rr, cc)) continue;
        if (isValidSwap(board, { r, c }, { r: rr, c: cc })) {
          n += 1;
          if (n >= limit) return n;
        }
      }
    }
  }
  return n;
}

export { key };
