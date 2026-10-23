/**
 * M09 道具服务 BoosterService（领域层，零浏览器依赖）
 *
 * 只负责"能不能用"的规则判定。真正的效果（重排棋盘、敲掉元素、
 * 加步数）由应用层调用领域能力完成，次数计数与写档同事务处理。
 *
 * 规则：每关三种道具共用 2 次使用机会，不再有跨关库存。
 */

import { BOOSTERS, BOOSTER_TOTAL_LIMIT } from '../core/constants.js';

export const BOOSTER_IDS = Object.keys(BOOSTERS);

/** 每关道具总次数（三种道具共享） */
export function boosterLimit() {
  return BOOSTER_TOTAL_LIMIT;
}

/** 本关三种道具已经使用的总次数 */
export function boosterUsedTotal(usage = {}) {
  return Object.values(usage).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

/**
 * @param id 道具标识
 * @param ctx.usedTotal 本关三种道具已使用的总次数
 * @param ctx.disabled 本关禁用的道具列表
 * @param ctx.state 会话状态
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
  if ((ctx.usedTotal || 0) >= boosterLimit()) {
    return { ok: false, reason: 'LIMIT', message: '本关道具次数已用完' };
  }
  return { ok: true, needsTarget: id === 'hammer' };
}

/** 道具使用后的本道具计数（返回新对象，便于同事务写档） */
export function consumeBooster(id, { used }) {
  return { used: (used || 0) + 1 };
}

export function boosterList() {
  return BOOSTER_IDS.map((id) => BOOSTERS[id]);
}
