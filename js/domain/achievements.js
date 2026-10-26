/**
 * M16 成就判定（领域层，零浏览器依赖）。
 *
 * 成就分两类：
 * - 可回溯：通关数、星数、最高分等能从存档算出来的指标；
 * - 仅本局：连锁数、剩余步数、是否使用道具等只存在于一次结算结果里。
 *
 * 这样老存档在启动时可以补齐可回溯成就，而仅本局成就在之后的游戏里继续获得。
 */
import { ACHIEVEMENTS } from '../data/achievements.js';

/**
 * 汇总成就指标。
 * @param save 存档对象
 * @param levels 关卡仓库（需要 list()）
 * @param result 可选，本次结算结果
 */
export function buildAchievementStats(save, levels, result = null) {
  const list = levels?.list ? levels.list() : [];
  const progress = save?.progress || {};
  const stats = {
    clearedCount: 0,
    clearedNormalCount: 0,
    clearedExCount: 0,
    totalStars: 0,
    threeStarCount: 0,
    normalThreeStarCount: 0,
    maxHighScore: 0,
    totalScore: Math.max(0, Number(save?.player?.totalScore) || 0),
    runChainBest: 0,
    runNoBoosterEx: 0,
    runMovesLeft: 0,
  };

  for (const level of list) {
    if (level.valid === false) continue;
    const p = progress[String(level.levelId)];
    if (!p?.cleared) continue;
    const stars = Math.max(0, Math.min(3, Number(p.stars) || 0));
    stats.clearedCount += 1;
    stats.totalStars += stars;
    if (stars >= 3) {
      stats.threeStarCount += 1;
      if (!level.isEx) stats.normalThreeStarCount += 1;
    }
    if (level.isEx) stats.clearedExCount += 1;
    else stats.clearedNormalCount += 1;
    stats.maxHighScore = Math.max(stats.maxHighScore, Math.max(0, Number(p.highScore) || 0));
  }

  if (result) {
    stats.runChainBest = Math.max(0, Number(result.chainBest) || 0);
    stats.runMovesLeft = result.cleared ? Math.max(0, Number(result.movesLeft) || 0) : 0;
    stats.runNoBoosterEx = result.cleared && result.isEx && (Number(result.boostersUsed) || 0) === 0 ? 1 : 0;
  }

  return stats;
}

/** 返回当前指标下已经达成的成就定义列表 */
export function evaluateAchievements(stats) {
  return ACHIEVEMENTS.filter((achievement) => {
    const value = Number(stats?.[achievement.metric] || 0);
    return value >= achievement.target;
  });
}

/** 单个成就的当前进度，最多显示到目标值 */
export function achievementProgress(achievement, stats) {
  return Math.min(
    Math.max(0, Number(achievement.target) || 0),
    Math.max(0, Number(stats?.[achievement.metric] || 0))
  );
}
