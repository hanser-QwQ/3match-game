/**
 * 关卡平衡测试工具（离线，不参与运行时）
 *
 * 用一个“目标感知的贪心玩家”反复跑关卡，统计可达分数，
 * 用来校准星级阈值。运行：node tools/sim-levels.mjs [局数]
 *
 * 说明：
 * - 每步枚举所有能形成消除的相邻交换，选择“即时收益 + 目标进度”最高的一步。
 * - 不计道具、不计特殊方块组合交换，因此结果偏保守，适合作为阈值下限参考。
 * - 统计“提前结算 + 剩余步数奖励”和“打满全部步数”两种策略中的较高分。
 */
import { readFileSync } from 'node:fs';
import { createBoard } from '../js/domain/boardFactory.js';
import { resolveCascade } from '../js/domain/cascadeResolver.js';
import { isValidSwap } from '../js/domain/matchEngine.js';
import { reshuffle } from '../js/domain/deadlockDetector.js';
import { isGoalComplete, goalTasks } from '../js/domain/goals.js';
import { RandomSource } from '../js/core/random.js';

const RUNS = Math.max(1, Number(process.argv[2]) || 4);
const levelsRoot = new URL('../levels/', import.meta.url);

function loadLevel(id) {
  return JSON.parse(readFileSync(new URL(`level-${String(id).padStart(2, '0')}.json`, levelsRoot), 'utf8'));
}

function iceCells(board) {
  let n = 0;
  for (let i = 0; i < board.ice.length; i += 1) if (board.ice[i] > 0) n += 1;
  return n;
}

function iceDurability(board) {
  let n = 0;
  for (let i = 0; i < board.ice.length; i += 1) n += board.ice[i];
  return n;
}

function goalWeights(goal) {
  const weights = { score: 0, collect: 0, ice: 0, targets: [] };
  const add = (def) => {
    if (!def) return;
    if (def.type === 'score') weights.score += 1;
    else if (def.type === 'collect') {
      weights.collect = Math.max(weights.collect, 120);
      weights.targets.push(def.element);
    } else if (def.type === 'clear_ice') {
      weights.ice = Math.max(weights.ice, 180);
    }
  };
  if (goal.type === 'combo') {
    add(goal.primary);
    add(goal.secondary);
  } else {
    add(goal);
  }
  if (weights.score === 0) weights.score = 0.25;
  return weights;
}

function candidateMoves(board) {
  const out = [];
  for (let r = 0; r < board.rows; r += 1) {
    for (let c = 0; c < board.cols; c += 1) {
      if (!board.isFree(r, c)) continue;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (!board.isFree(rr, cc)) continue;
        const a = { r, c };
        const b = { r: rr, c: cc };
        if (isValidSwap(board, a, b)) out.push([a, b]);
      }
    }
  }
  return out;
}

function simulate(level, seed) {
  const rng = new RandomSource(seed);
  let board = createBoard({ ...level.board, rules: level.rules || {} }, rng);
  const weights = goalWeights(level.goal);
  const initialIce = iceCells(board);
  let score = 0;
  const collected = {};
  let bestSettle = 0;

  for (let move = 0; move < level.moves; move += 1) {
    const moves = candidateMoves(board);
    if (!moves.length) {
      reshuffle(board, rng);
      continue;
    }

    let best = null;
    for (let i = 0; i < moves.length; i += 1) {
      const [a, b] = moves[i];
      const clone = board.clone();
      clone.swap(a, b);
      const beforeIce = iceDurability(clone);
      const res = resolveCascade(clone, { rng: new RandomSource(seed * 1000 + move * 100 + i) });
      let gain = 0;
      const gained = {};
      for (const step of res.sequence) {
        gain += step.score;
        for (const item of step.cleared) gained[item.type] = (gained[item.type] || 0) + 1;
      }
      const iceGain = beforeIce - iceDurability(clone);

      let value = gain * weights.score;
      if (weights.collect) {
        for (const target of weights.targets) value += (gained[target] || 0) * weights.collect;
      }
      if (weights.ice) value += iceGain * weights.ice;

      if (!best || value > best.value) {
        best = { value, board: clone, gain, gained };
      }
    }

    board = best.board;
    score += best.gain;
    for (const [type, n] of Object.entries(best.gained)) collected[type] = (collected[type] || 0) + n;

    const counters = { score, collected, iceLeft: iceCells(board), initialIce };
    if (isGoalComplete(level.goal, counters)) {
      const remaining = level.moves - move - 1;
      bestSettle = Math.max(bestSettle, score + remaining * 100);
    }
  }

  const counters = { score, collected, iceLeft: iceCells(board), initialIce };
  const cleared = isGoalComplete(level.goal, counters);
  const finalScore = cleared ? Math.max(bestSettle, score) : score;
  return {
    score: finalScore,
    cleared,
    tasks: goalTasks(level.goal, counters).map((t) => `${t.label} ${t.cleared}/${t.total}`),
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const DEFAULT_IDS = [1, 3, 5, 8, 10, 12, 14, 15, 16, 17, 18, 19, 20, 101, 102, 103, 104, 105];
const filter = process.argv[3] ? process.argv[3].split(',').map(Number).filter(Number.isInteger) : null;
const ids = filter && filter.length ? filter : DEFAULT_IDS;
console.log(`模拟 ${RUNS} 局/关\n`);
console.log('关卡\t名称\t1星\t2星\t3星\t中位分\t最高分\t通关率\t未通关进度');
for (const id of ids) {
  const level = loadLevel(id);
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) runs.push(simulate(level, id * 1000 + i));
  const scores = runs.map((r) => r.score);
  const cleared = runs.filter((r) => r.cleared).length;
  const failed = runs.find((r) => !r.cleared);
  console.log([
    id,
    level.name,
    level.starThresholds[0],
    level.starThresholds[1],
    level.starThresholds[2],
    median(scores),
    Math.max(...scores),
    `${cleared}/${RUNS}`,
    failed ? failed.tasks.join(' / ') : '-',
  ].join('\t'));
}
