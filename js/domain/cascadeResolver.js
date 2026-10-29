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
  const specialCycle = Boolean(board?.rules?.specialCycle);
  const instantSpecials = Boolean(board?.rules?.instantSpecials);
  let totalScore = 0;
  let specialsCreated = 0;
  // 生涯统计：按实际生成的特殊方块类型累计（含 EX-9 立即引爆的特殊方块）
  const specialsByType = { stripe_h: 0, stripe_v: 0, bomb: 0, rainbow: 0 };
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
      // EX-5：被冻住的特殊方块免疫消除，爆炸与匹配都不能把它带走
      if (board.isSpecialFrozen(r, c)) return;
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
      // EX-5 限量规则的实现位置：配额用完的类型不再进入生成计划（该次匹配只消除、不生成）
      plans = planSpecials(board, matches, preferred, rng).filter((plan) => board.canGenerateSpecial(plan.special));
      for (const plan of plans) {
        specialsByType[plan.special] = (specialsByType[plan.special] || 0) + 1;
      }
      if (instantSpecials) {
        /*
         * EX-9 禁术·咒发：把特殊方块直接放在匹配落点上并立刻引爆，
         * 不进入 exclude，也不留下成品。玩家看到的是四连放条纹、
         * 五连清色、拐角爆炸的即时效果。
         */
        for (const plan of plans) {
          board.setType(plan.r, plan.c, board.typeAt(plan.r, plan.c), plan.special);
        }
        for (const m of matches) for (const cell of m.cells) addCell(cell.r, cell.c);
        plans = [];
      } else {
        for (const plan of plans) exclude.add(key(plan.r, plan.c));
        for (const m of matches) for (const cell of m.cells) addCell(cell.r, cell.c);
      }
    }

    if (!clearMap.size && !plans.length) break;

    // 特殊元素连锁引爆：被卷入清除范围的特殊元素依次触发
    const triggered = new Set();
    let bombsTriggered = 0;
    const queue = [...clearMap.values()];
    while (queue.length) {
      const cell = queue.pop();
      const special = board.specialAt(cell.r, cell.c);
      if (!special) continue;
      const k = key(cell.r, cell.c);
      if (triggered.has(k)) continue;
      // EX-5 节律：已被冻住的特殊方块本轮不能再触发
      if (specialCycle && board.isSpecialFrozen(cell.r, cell.c)) continue;
      triggered.add(k);
      if (special === SPECIAL.BOMB) bombsTriggered += 1;
      // EX-5：记录“这一类特殊方块本轮已经用过”，随后它照常被消除
      if (specialCycle) board.markSpecialUsed(special);
      for (const target of blastCells(board, cell.r, cell.c, special, rng)) {
        const tk = key(target.r, target.c);
        // EX-5：冰冻特殊方块不被波及，也不因波及而触发
        if (board.isSpecialFrozen(target.r, target.c)) continue;
        if (board.iceAt(target.r, target.c) > 0) {
          iceHits.add(tk);
          continue;
        }
        if (board.typeAt(target.r, target.c) < 0) continue;
        if (exclude.has(tk) || clearMap.has(tk)) continue;
        clearMap.set(tk, target);
        queue.push(target);
      }

      /*
       * EX-7 雷暴：任意炸弹引爆时，把场上其余炸弹一并卷入连锁。
       * 这样玩家不需要把炸弹一个个换着引爆，一颗炸弹就能点燃全场。
       */
      if (special === SPECIAL.BOMB && board.rules?.bombChainAll) {
        board.eachCell((rr, cc) => {
          if (board.specialAt(rr, cc) !== SPECIAL.BOMB) return;
          if (board.iceAt(rr, cc) > 0 || board.typeAt(rr, cc) < 0 || board.isSpecialFrozen(rr, cc)) return;
          const bk = key(rr, cc);
          if (exclude.has(bk) || clearMap.has(bk)) return;
          clearMap.set(bk, { r: rr, c: cc });
          queue.push({ r: rr, c: cc });
        });
      }
    }

    // 执行消除并统计
    const cleared = [];
    for (const cell of clearMap.values()) {
      if (board.isSpecialFrozen(cell.r, cell.c)) continue;
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
      // EX-5 限量规则：记录本局该类特殊方块的生成次数
      board.recordSpecialGenerated(plan.special);
      // EX-5 节律（保留规则）：如果该类型本轮已经用过，新生成的方块一出生就是冰冻状态
      if (specialCycle) board.applySpecialCreationRule(plan.r, plan.c);

      /*
       * 特殊方块落点会被排除在消除范围之外，但它仍然属于本次匹配。
       * 如果只按 clearMap 统计相邻冰块，落点旁边的冰块就会漏掉一次削减。
       * 这里补记落点四邻的冰块，保证“在冰块旁边生成特殊方块”也能正常破冰。
       */
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = plan.r + dr;
        const cc = plan.c + dc;
        if (board.inside(rr, cc) && board.iceAt(rr, cc) > 0) iceHits.add(key(rr, cc));
      }
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

    const maxMultiplier = Number(board.rules?.maxChainMultiplier);
    const multiplier = chainMultiplier(index, Number.isFinite(maxMultiplier) ? maxMultiplier : undefined);
    const baseMultiplier = Number(board.rules?.baseScoreMultiplier);
    const bombBonus = Number(board.rules?.bombBonus);
    const stepScore = Math.round(
      clearedCount * SCORE.PER_TILE * multiplier * (Number.isFinite(baseMultiplier) && baseMultiplier > 0 ? baseMultiplier : 1)
    ) + triggered.size * SCORE.SPECIAL_BONUS
      + (Number.isFinite(bombBonus) && bombBonus > 0 ? bombsTriggered * bombBonus : 0);
    totalScore += stepScore;

    const boardAfterClear = board.clone();
    const boardAfter = boardAfterClear.clone();
    if (rng) boardAfter.applyGravityAndRefill(rng);
    board.types.set(boardAfter.types);
    board.specials = boardAfter.specials;
    board.specialActive.set(boardAfter.specialActive);
    // 冰冻状态必须一并同步：否则重填的普通元素会继承旧位置的冰冻标记
    board.specialFrozen.set(boardAfter.specialFrozen);
    board.ice.set(boardAfter.ice);

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

  /*
   * EX-5 节律：一次结算（一次操作）结束后统一检查。
   * 放在连锁之外而不是每一段之后，避免同一次操作的后续连锁立刻开启新一轮，
   * 让“炸弹 / 彩虹 / 条纹各用一次”这一轮在玩家视角里完整走完。
   *
   * 若本轮尚未结束，则把场上已有的同类特殊方块也一并冻住；
   * 三种类型都用过一轮时直接解冻全部，进入下一轮。
   */
  if (specialCycle) {
    if (board.allSpecialCategoriesUsed()) board.resetSpecialRound();
    else board.syncSpecialFrozen();
  }

  return {
    sequence,
    chainCount: sequence.length,
    totalScore,
    collected,
    specialsCreated,
    specialsByType,
    iceCleared,
    overflow,
  };
}
