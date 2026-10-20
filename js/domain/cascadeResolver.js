/**
 * M03 连锁结算器 CascadeResolver（领域层，零浏览器依赖）
 *
 * 驱动"匹配 → 消除 → 下落 → 补充 → 再判定"的循环，输出结算序列。
 * 输出序列而不是只输出最终棋盘，是为了让渲染器按序列逐帧播放动画，
 * 也为单元测试提供明确的中间观测点（IF-D-03）。
 */

import { SCORE, chainMultiplier, SPECIAL } from '../core/constants.js';
import { findMatches, planSpecials, blastCells, key, parseKey } from './matchEngine.js';

/**
 * @param board 会被就地修改，结束后即为最终棋盘
 * @param options.rng 随机源
 * @param options.initialCells 首轮强制清除的种子（特殊元素交换时使用）
 * @param options.preferred 本次交换涉及的格子，用于决定特殊元素落点
 * @param options.maxChain 单次结算的连锁上限，超过则判定为异常
 */
export function resolveCascade(board, options = {}) {
  const { rng, maxChain = 64, preferred = [] } = options;
  let pending = options.initialCells && options.initialCells.length ? options.initialCells.slice() : null;

  const sequence = [];
  const collected = {};
  let totalScore = 0;
  let specialsCreated = 0;
  let iceCleared = 0;
  let overflow = false;

  for (let index = 1; index <= maxChain; index += 1) {
    const iceHits = new Set();
    const clearMap = new Map();
    const exclude = new Set();
    let plans = [];

    const addCell = (r, c) => {
      if (!board.inside(r, c) || board.isBlocked(r, c)) return;
      if (board.typeAt(r, c) < 0) return;
      const k = key(r, c);
      if (exclude.has(k) || clearMap.has(k)) return;
      if (board.iceAt(r, c) > 0) {
        iceHits.add(k);
        return;
      }
      clearMap.set(k, { r, c });
    };

    if (pending) {
      for (const cell of pending) addCell(cell.r, cell.c);
      pending = null;
    } else {
      const matches = findMatches(board);
      if (!matches.length) break;
      plans = planSpecials(board, matches, preferred, rng);
      for (const plan of plans) exclude.add(key(plan.r, plan.c));
      for (const m of matches) for (const cell of m.cells) addCell(cell.r, cell.c);
    }

    if (!clearMap.size && !plans.length) break;

    // 特殊元素连锁引爆：被卷入清除范围的特殊元素依次触发
    const triggered = new Set();
    const queue = [...clearMap.values()];
    const specialCycle = Boolean(board?.rules?.specialCycle);
    while (queue.length) {
      const cell = queue.pop();
      const special = board.specialAt(cell.r, cell.c);
      if (!special) continue;
      const k = key(cell.r, cell.c);
      if (triggered.has(k)) continue;
      // EX-5 节律：本轮已触发过的特殊方块暂时失效
      if (specialCycle && !board.isSpecialActive(cell.r, cell.c)) continue;
      triggered.add(k);
      if (specialCycle) board.setSpecialActive(cell.r, cell.c, false);
      for (const target of blastCells(board, cell.r, cell.c, special, rng)) {
        const tk = key(target.r, target.c);
        if (board.iceAt(target.r, target.c) > 0) {
          iceHits.add(tk);
          continue;
        }
        if (board.typeAt(target.r, target.c) < 0) continue;
        if (exclude.has(tk) || clearMap.has(tk)) continue;
        clearMap.set(tk, target);
        queue.push(target);
      }
    }

    // 执行消除并统计
    const cleared = [];
    for (const cell of clearMap.values()) {
      const type = board.typeAt(cell.r, cell.c);
      if (type < 0) continue;
      cleared.push({ r: cell.r, c: cell.c, type, special: board.specialAt(cell.r, cell.c) });
      collected[type] = (collected[type] || 0) + 1;
      board.clearCell(cell.r, cell.c);
      // 相邻消除削减冰块耐久（FR-14）
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = cell.r + dr;
        const cc = cell.c + dc;
        if (board.inside(rr, cc) && board.iceAt(rr, cc) > 0) iceHits.add(key(rr, cc));
      }
    }

    // 生成特殊元素
    for (const plan of plans) {
      board.setType(plan.r, plan.c, board.typeAt(plan.r, plan.c), plan.special);
    }
    specialsCreated += plans.length;

    // 结算冰块
    let iceClearedStep = 0;
    for (const k of iceHits) {
      const { r, c } = parseKey(k);
      const left = board.iceAt(r, c);
      if (left > 0) {
        board.setIce(r, c, left - 1);
        if (board.iceAt(r, c) === 0) iceClearedStep += 1;
      }
    }
    iceCleared += iceClearedStep;

    const clearedCount = cleared.length;
    if (!clearedCount && !iceClearedStep) break;

    const multiplier = chainMultiplier(index);
    const stepScore = Math.round(clearedCount * SCORE.PER_TILE * multiplier) + triggered.size * SCORE.SPECIAL_BONUS;
    totalScore += stepScore;

    const boardAfterClear = board.clone();
    const boardAfter = boardAfterClear.clone();
    if (rng) boardAfter.applyGravityAndRefill(rng);
    board.types.set(boardAfter.types);
    board.specials = boardAfter.specials;
    board.specialActive.set(boardAfter.specialActive);
    board.ice.set(boardAfter.ice);

    // EX-5 节律：本步结束后，若棋盘上还有特殊方块但全部处于冷却，则全体恢复可触发
    if (specialCycle) {
      let hasSpecial = 0;
      let hasActive = 0;
      for (let i = 0; i < board.specials.length; i += 1) {
        if (board.specials[i]) {
          hasSpecial += 1;
          if (board.specialActive[i]) hasActive += 1;
        }
      }
      if (hasSpecial > 0 && hasActive === 0) {
        for (let i = 0; i < board.specials.length; i += 1) {
          if (board.specials[i]) board.specialActive[i] = 1;
        }
      }
    }

    sequence.push({
      index,
      multiplier,
      cleared,
      clearedCount,
      triggered: [...triggered],
      specials: plans,
      iceHits: [...iceHits],
      iceCleared: iceClearedStep,
      score: stepScore,
      boardAfterClear,
      boardAfter: board.clone(),
    });

    if (index === maxChain) overflow = true;
  }

  return {
    sequence,
    chainCount: sequence.length,
    totalScore,
    collected,
    specialsCreated,
    iceCleared,
    overflow,
  };
}
