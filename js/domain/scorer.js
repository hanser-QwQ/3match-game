/**
 * M05 计分器 Scorer（领域层，零浏览器依赖）
 *
 * 规则来自需求文档 FR-06 与第 5 章：
 *   基础消除每个元素 10 分，连锁倍率 1 / 1.5 / 2 / 2.5 / 3（封顶 3 倍）
 *   触发特殊元素额外 50 分
 *   通关时每剩余一步 100 分，未通关不结算
 * 全部为无状态纯函数，可按段逐条核对（AC-09、AC-21）。
 */

import { SCORE, chainMultiplier } from '../core/constants.js';

/** 单段连锁得分 */
export function scoreCascadeStep({
  clearedCount = 0,
  chainIndex = 1,
  specialTriggered = 0,
  maxMultiplier,
  baseMultiplier = 1,
} = {}) {
  const multiplier = chainMultiplier(chainIndex, maxMultiplier);
  const scale = Number.isFinite(baseMultiplier) && baseMultiplier > 0 ? baseMultiplier : 1;
  const base = Math.round(clearedCount * SCORE.PER_TILE * multiplier * scale);
  return base + specialTriggered * SCORE.SPECIAL_BONUS;
}

/** 通关剩余步数奖励分；未通关返回 0 */
export function scoreClearBonus({ remainingMoves = 0, cleared = false } = {}) {
  if (!cleared) return 0;
  return Math.max(0, remainingMoves) * SCORE.CLEAR_BONUS_PER_MOVE;
}

/**
 * 星级判定：返回 1 至 3；未达一星返回 0。
 * 阈值必须严格递增，否则返回 -1 交由调用方标记关卡数据异常。
 */
export function judgeStars(score, thresholds) {
  if (!Array.isArray(thresholds) || thresholds.length !== 3) return -1;
  if (!(thresholds[0] > 0 && thresholds[1] > thresholds[0] && thresholds[2] > thresholds[1])) return -1;
  if (score >= thresholds[2]) return 3;
  if (score >= thresholds[1]) return 2;
  if (score >= thresholds[0]) return 1;
  return 0;
}

/** 计算最终得分明细 */
export function settleScore({ baseScore = 0, remainingMoves = 0, cleared = false }) {
  const bonus = scoreClearBonus({ remainingMoves, cleared });
  return { baseScore, bonusScore: bonus, finalScore: baseScore + bonus };
}

export { chainMultiplier };
