/**
 * 棋盘生成工厂（领域层，零浏览器依赖）
 *
 * 从 Board 中拆出的原因：生成过程需要同时依赖匹配判定与死局检测，
 * 而 Board 本身必须保持零依赖。第 5.7 节的可解性保证集中在此实现，
 * FR-02（死局重排）与 FR-12（道具洗牌）共用同一套重试与兜底策略。
 */

import { Board } from './board.js';
import { hasValidMove, forceValidMove } from './deadlockDetector.js';

export const MAX_GENERATE_ATTEMPTS = 20;

/**
 * 填充棋盘，逐格避开会立刻形成三连的类型。
 * 这样一次填充即可保证初始棋盘没有现成连线，不需要反复整盘重试。
 */
function fillWithoutMatches(board, rng) {
  const types = board.elementTypes;
  for (let r = 0; r < board.rows; r += 1) {
    for (let c = 0; c < board.cols; c += 1) {
      if (board.isBlocked(r, c)) continue;
      const banned = new Set();

      if (c >= 2) {
        const a = board.typeAt(r, c - 1);
        const b = board.typeAt(r, c - 2);
        if (a >= 0 && a === b) banned.add(a);
      }
      if (r >= 2) {
        const a = board.typeAt(r - 1, c);
        const b = board.typeAt(r - 2, c);
        if (a >= 0 && a === b) banned.add(a);
      }

      const candidates = [];
      for (let t = 0; t < types; t += 1) if (!banned.has(t)) candidates.push(t);
      const type = candidates.length ? candidates[rng.int(candidates.length)] : rng.int(types);
      board.setType(r, c, type);
    }
  }
}

function applyLayout(board, config) {
  for (const [r, c] of config.blockedCells || []) {
    if (board.inside(r, c)) {
      board.blocked[board.idx(r, c)] = 1;
      board.types[board.idx(r, c)] = -1;
    }
  }
}

function applyIce(board, config) {
  const durability = config.iceDurability || 1;
  for (const [r, c] of config.iceCells || []) {
    if (board.inside(r, c) && !board.isBlocked(r, c)) {
      board.setIce(r, c, durability);
    }
  }
}

/**
 * 按关卡配置生成初始棋盘。
 * 保证：无现成连线、至少存在一次可行交换（第 5.1 节与 5.7 节）。
 */
export function createBoard(config, rng) {
  const rows = config.rows || 8;
  const cols = config.cols || 8;
  const elementTypes = Math.min(6, Math.max(3, config.elementTypes || 6));

  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt += 1) {
    const board = new Board(rows, cols, elementTypes);
    applyLayout(board, config);
    fillWithoutMatches(board, rng);
    applyIce(board, config);
    if (hasValidMove(board)) return board;
  }

  // 20 次仍未得到有解棋盘时强制构造一对可消除元素
  const board = new Board(rows, cols, elementTypes);
  applyLayout(board, config);
  fillWithoutMatches(board, rng);
  applyIce(board, config);
  forceValidMove(board, rng);
  return board;
}
