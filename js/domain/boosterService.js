/**
 * M09 道具服务 BoosterService（领域层，零浏览器依赖）
 *
 * 只负责"能不能用"的规则判定。真正的效果（重排棋盘、敲掉元素、
 * 加步数）由应用层调用领域能力完成，库存扣减与写档同事务处理。
 */

import { BOOSTERS } from '../core/constants.js';

export const BOOSTER_IDS = Object.keys(BOOSTERS);

export function boosterLimit(id) {
  return BOOSTERS[id]?.limit ?? 0;
}

/**
 * @param id 道具标识
 * @param ctx.inventory 库存数量
 * @param ctx.used 本关已使用次数
 * @param ctx.disabled 本关禁用的道具列表
 * @param ctx.state 会话状态
 * @param ctx.needsTarget 是否需要点选目标格（锤子）
 */
export function checkBooster(id, ctx = {}) {
  const def = BOOSTERS[id];
  if (!def) return { ok: false, reason: 'UNKNOWN_BOOSTER', message: '未知道具' };
  if (ctx.state && ctx.state !== 'in_progress') {
    return { ok: false, reason: 'STATE', message: '当前状态不能使用道具' };
  }
  if ((ctx.disabled || []).includes(id)) {
    return { ok: false, reason: 'DISABLED', message: '本关不能使用该道具' };
  }
  if ((ctx.inventory || 0) <= 0) {
    return { ok: false, reason: 'EMPTY', message: '道具数量不足' };
  }
  if ((ctx.used || 0) >= boosterLimit(id)) {
    return { ok: false, reason: 'LIMIT', message: '本关使用次数已用完' };
  }
  return { ok: true, needsTarget: id === 'hammer' };
}

/** 道具使用后的库存与计数（返回新对象，便于同事务写档） */
export function consumeBooster(id, { inventory, used }) {
  return {
    inventory: Math.max(0, (inventory || 0) - 1),
    used: (used || 0) + 1,
  };
}

export function boosterList() {
  return BOOSTER_IDS.map((id) => BOOSTERS[id]);
}
