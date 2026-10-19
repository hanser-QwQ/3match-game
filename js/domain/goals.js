/**
 * 关卡目标规则（领域层，零浏览器依赖，第 5.4 节）
 *
 * 四种目标类型统一抽象为"任务列表"：
 *   score      一个任务，当前值取本次得分
 *   collect    一个任务，当前值取该元素的累计消除数
 *   clear_ice  一个任务，当前值取已清除的冰块数
 *   combo      两个任务，全部完成才算达成
 *
 * 界面只要把任务列表按"当前值 / 目标值"渲染，就能让不同关卡的目标
 * 保持同一种读法（界面与交互设计要求）。
 */

import { ELEMENTS, GOAL } from '../core/constants.js';

const SHORT_NAME = ['圆珠', '方块', '三角', '菱片', '星星', '六边'];

export function elementShortName(type) {
  return SHORT_NAME[type] || '元素';
}

export function elementFullName(type) {
  return ELEMENTS[type]?.name || '元素';
}

/** 关卡目标的任务定义（不含进度） */
export function goalDefinitions(goal) {
  if (!goal) return [];
  if (goal.type === GOAL.COMBO) {
    return [goal.primary, goal.secondary].filter(Boolean);
  }
  return [goal];
}

function taskProgress(def, counters) {
  switch (def.type) {
    case GOAL.SCORE:
      return { cleared: Math.min(counters.score, def.amount), total: def.amount };
    case GOAL.COLLECT:
      return { cleared: Math.min(counters.collected[def.element] || 0, def.amount), total: def.amount };
    case GOAL.CLEAR_ICE: {
      const total = counters.initialIce ?? 0;
      return { cleared: total - counters.iceLeft, total };
    }
    default:
      return { cleared: 0, total: def.amount || 0 };
  }
}

function taskLabel(def) {
  switch (def.type) {
    case GOAL.SCORE:
      return '达到分数';
    case GOAL.COLLECT:
      return `收集${elementShortName(def.element)}`;
    case GOAL.CLEAR_ICE:
      return '清除冰块';
    default:
      return '完成目标';
  }
}

export function createCounters(board) {
  const ice = board ? board.countIce() : 0;
  return { score: 0, collected: {}, iceLeft: ice, initialIce: ice };
}

/** 返回可直接渲染的任务列表 */
export function goalTasks(goal, counters) {
  return goalDefinitions(goal).map((def) => {
    const p = taskProgress(def, counters);
    return {
      type: def.type,
      element: def.element,
      label: taskLabel(def),
      cleared: Math.max(0, p.cleared),
      total: p.total,
      done: p.cleared >= p.total,
    };
  });
}

export function isGoalComplete(goal, counters) {
  const tasks = goalTasks(goal, counters);
  return tasks.length > 0 && tasks.every((t) => t.done);
}

/** 顶部提示语，用于关卡开始时的目标说明 */
export function goalSummary(goal) {
  const defs = goalDefinitions(goal);
  return defs
    .map((d) => {
      switch (d.type) {
        case GOAL.SCORE:
          return `达到 ${d.amount} 分`;
        case GOAL.COLLECT:
          return `收集 ${d.amount} 个${elementShortName(d.element)}`;
        case GOAL.CLEAR_ICE:
          return `清除全部 ${d.amount} 块冰`;
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('，并');
}
