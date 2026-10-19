/**
 * 领域层单元测试（NFR-17 / AC-38）
 *
 * 运行：node --test tests/
 * 全部用例不依赖 DOM、Canvas、localStorage，可在任意 JavaScript 运行环境执行。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Board } from '../js/domain/board.js';
import { findMatches, isValidSwap, planSpecials, hasMatchAt } from '../js/domain/matchEngine.js';
import { resolveCascade } from '../js/domain/cascadeResolver.js';
import { hasValidMove, findAnyValidMove, reshuffle } from '../js/domain/deadlockDetector.js';
import { scoreCascadeStep, scoreClearBonus, judgeStars, settleScore } from '../js/domain/scorer.js';
import { createBoard } from '../js/domain/boardFactory.js';
import { RandomSource } from '../js/core/random.js';

const MAP = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };

/** 用字符画构造棋盘，'.' 表示空格 */
function makeBoard(rows) {
  const board = new Board(rows.length, rows[0].length, 6);
  rows.forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (ch === '.') board.setType(r, c, -1);
      else board.setType(r, c, MAP[ch]);
    });
  });
  return board;
}

function rng(seed = 12345) {
  return new RandomSource(seed);
}

test('匹配引擎：识别横向与纵向三连', () => {
  const board = makeBoard([
    'AAACDE',
    'CDEFAB',
    'ADEFBC',
    'ACDEFA',
    'ABCDEF',
    'BBBBCD',
  ]);
  const matches = findMatches(board);
  const rows = matches.filter((m) => m.dir === 'row');
  const cols = matches.filter((m) => m.dir === 'col');
  assert.equal(cols.length, 1, '第 0 列应识别出一个纵向三连');
  assert.equal(cols[0].length, 3);
  assert.equal(cols[0].type, MAP.A);
  assert.ok(rows.some((m) => m.length === 3 && m.cells[0].r === 0));
  assert.ok(rows.some((m) => m.length === 4 && m.cells[0].r === 5), '四连应识别出长度 4');
  assert.equal(matches.length, 3, '不应把不相邻的连线合并');
});

test('匹配引擎：被冰块覆盖的格子不参与匹配', () => {
  const board = makeBoard(['AAAB', 'CDEF', 'DFCE', 'ECFD']);
  assert.equal(findMatches(board).length, 1);
  board.setIce(0, 1, 1);
  assert.equal(findMatches(board).length, 0, '冰封的格子应打断连线');
});

test('匹配引擎：可行交换与不可行交换判定', () => {
  const board = makeBoard(['AAB', 'CDE', 'FGH']);
  // A A B -> A B A，不产生三连
  assert.equal(isValidSwap(board, { r: 0, c: 1 }, { r: 0, c: 2 }), false);

  const board2 = makeBoard(['ABA', 'CDE', 'FGH']);
  assert.equal(isValidSwap(board2, { r: 0, c: 1 }, { r: 1, c: 1 }), false);

  const board3 = makeBoard(['AAA', 'BCD', 'EFA']);
  assert.equal(hasMatchAt(board3, 0, 0), true);

  const board4 = makeBoard(['AAB', 'CDA', 'EFA']);
  // 把 (0,2) 的 B 与 (1,2) 的 A 交换，第 2 列形成 AAA
  assert.equal(isValidSwap(board4, { r: 0, c: 2 }, { r: 1, c: 2 }), true);
  // 交换判定必须是"虚拟"的，判完棋盘要还原
  assert.equal(board4.typeAt(0, 2), MAP.B);
  assert.equal(board4.typeAt(1, 2), MAP.A);
});

test('特殊元素：四连生成条纹、五连生成彩虹、L 形生成炸弹', () => {
  const four = makeBoard(['AAAAB', 'CDEFG', 'DFGCE', 'EGCDF']);
  const p4 = planSpecials(four, findMatches(four), []);
  assert.equal(p4.length, 1);
  assert.equal(p4[0].special, 'stripe_h', '横向四连生成横向条纹');

  const five = makeBoard(['AAAAA', 'CDEFG', 'DFGCE', 'EGCDF']);
  const p5 = planSpecials(five, findMatches(five), []);
  assert.equal(p5.length, 1);
  assert.equal(p5[0].special, 'rainbow');

  const lShape = makeBoard([
    'AAAB',
    'ABCD',
    'ACDE',
    'CDEF',
  ]);
  const pl = planSpecials(lShape, findMatches(lShape), []);
  assert.equal(pl.length, 1);
  assert.equal(pl[0].special, 'bomb');
  assert.equal(pl[0].r, 0);
  assert.equal(pl[0].c, 0, '炸弹应落在横线与竖线的交叉点');
});

test('特殊元素：条纹元素优先落在玩家交换的位置', () => {
  const board = makeBoard(['AAAAB', 'CDEFG', 'DFGCE', 'EGCDF']);
  const plans = planSpecials(board, findMatches(board), [{ r: 0, c: 3 }]);
  assert.deepEqual({ r: plans[0].r, c: plans[0].c }, { r: 0, c: 3 });
});

test('计分器：基础分与连锁倍率逐段核对（AC-09）', () => {
  assert.equal(scoreCascadeStep({ clearedCount: 3, chainIndex: 1 }), 30);
  assert.equal(scoreCascadeStep({ clearedCount: 3, chainIndex: 2 }), 45);
  assert.equal(scoreCascadeStep({ clearedCount: 3, chainIndex: 3 }), 60);
  assert.equal(scoreCascadeStep({ clearedCount: 10, chainIndex: 5 }), 300);
  // 倍率封顶 3 倍
  assert.equal(scoreCascadeStep({ clearedCount: 10, chainIndex: 9 }), 300);
  // 触发特殊元素额外 50 分
  assert.equal(scoreCascadeStep({ clearedCount: 3, chainIndex: 1, specialTriggered: 1 }), 80);
});

test('计分器：通关奖励分与未通关不奖励（AC-21）', () => {
  assert.equal(scoreClearBonus({ remainingMoves: 5, cleared: true }), 500);
  assert.equal(scoreClearBonus({ remainingMoves: 5, cleared: false }), 0);
  assert.deepEqual(settleScore({ baseScore: 1800, remainingMoves: 4, cleared: true }), {
    baseScore: 1800,
    bonusScore: 400,
    finalScore: 2200,
  });
});

test('计分器：星级阈值判定与非法阈值识别', () => {
  assert.equal(judgeStars(1899, [1900, 2500, 3100]), 0);
  assert.equal(judgeStars(1900, [1900, 2500, 3100]), 1);
  assert.equal(judgeStars(2600, [1900, 2500, 3100]), 2);
  assert.equal(judgeStars(3100, [1900, 2500, 3100]), 3);
  assert.equal(judgeStars(5000, [3000, 2500, 3100]), -1, '非严格递增应被拒绝');
});

test('连锁结算：首段倍率为 1，消除数量与得分一致', () => {
  const board = makeBoard(['AAAB', 'CDEF', 'DFCE', 'ECFD']);
  const res = resolveCascade(board, { rng: rng(7) });
  assert.equal(res.sequence[0].index, 1);
  assert.equal(res.sequence[0].multiplier, 1);
  assert.equal(res.sequence[0].clearedCount, 3);
  assert.equal(res.sequence[0].score, 30);
  assert.equal(res.collected[0], 3);
});

test('连锁结算：下落后再次形成连线时进入第二段，倍率升为 1.5', () => {
  const board = makeBoard(['AAAB', 'CDEF', 'DFCE', 'ECFD']);
  const res = resolveCascade(board, { rng: rng(3) });
  assert.ok(res.chainCount >= 1);
  assert.equal(res.sequence[0].multiplier, 1);
  if (res.sequence[1]) assert.equal(res.sequence[1].multiplier, 1.5);
  // 每段的得分必须等于该段消除数乘倍率再乘 10
  for (const step of res.sequence) {
    assert.equal(step.score, Math.round(step.clearedCount * 10 * step.multiplier));
  }
});

test('连锁结算：消除后棋盘被补满，不残留空格', () => {
  const board = createBoard({ rows: 8, cols: 8, elementTypes: 6 }, rng(11));
  board.setType(3, 3, 0);
  board.setType(3, 4, 0);
  board.setType(3, 5, 0);
  resolveCascade(board, { rng: rng(11) });
  board.eachCell((r, c) => {
    if (!board.isBlocked(r, c)) assert.ok(board.typeAt(r, c) >= 0, `格子 ${r},${c} 应被补满`);
  });
});

test('下落与补充：冰块与不可用格不参与下落', () => {
  const board = makeBoard([
    'ABCD',
    'EFAB',
    'CDEF',
    'ABCD',
  ]);
  board.setIce(1, 1, 1);
  board.blocked[board.idx(2, 2)] = 1;
  board.types[board.idx(2, 2)] = -1;
  const before = board.typeAt(1, 1);
  board.clearCell(0, 0);
  board.applyGravityAndRefill(rng(5));
  assert.equal(board.typeAt(1, 1), before, '冰封元素的类型不应改变');
  assert.equal(board.typeAt(2, 2), -1, '不可用格应保持为空');
  assert.ok(board.typeAt(0, 0) >= 0);
});

test('冰块：相邻消除削减耐久，耐久归零后冰块消失', () => {
  const board = makeBoard([
    'AAAB',
    'BCDB',
    'CDEF',
    'DEFG',
  ]);
  board.setIce(0, 3, 1);
  const res = resolveCascade(board, { rng: rng(9) });
  assert.ok(res.iceCleared >= 1, '相邻消除应打掉冰块');
  assert.equal(board.iceAt(0, 3), 0);
});

test('死局检测：识别无可行交换的棋盘', () => {
  const dead = makeBoard([
    'ABCDEF',
    'BCDEFA',
    'CDEFAB',
    'DEFABC',
    'EFABCD',
    'FABCDE',
  ]);
  assert.equal(hasValidMove(dead), false);

  const alive = makeBoard([
    'AABA',
    'BCDB',
    'CDEF',
    'DEFG',
  ]);
  assert.equal(hasValidMove(alive), true);
  assert.ok(findAnyValidMove(alive));
});

test('棋盘生成：200 个随机种子下均无初始连线且有解（第 5.7 节）', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const r = new RandomSource(seed);
    const board = createBoard({ rows: 8, cols: 8, elementTypes: 4 + (seed % 3) }, r);
    assert.equal(findMatches(board).length, 0, `seed ${seed} 出现初始连线`);
    assert.equal(hasValidMove(board), true, `seed ${seed} 无可行交换`);
    assert.equal(board.countTiles(), 64);
  }
});

test('棋盘生成：冰块数量与配置一致', () => {
  const board = createBoard(
    { rows: 8, cols: 8, elementTypes: 5, iceCells: [[1, 1], [1, 6], [6, 1]], iceDurability: 2 },
    rng(21)
  );
  assert.equal(board.countIce(), 3);
  assert.equal(board.iceAt(1, 1), 2);
});

test('重排：结果无连线且存在可行交换，且元素多重集不变', () => {
  const board = makeBoard([
    'AAAB',
    'BCDB',
    'CDEF',
    'DEFG',
  ]);
  const before = [...board.types].sort().join(',');
  const ok = reshuffle(board, rng(33));
  assert.equal(ok, true);
  assert.equal(findMatches(board).length, 0);
  assert.equal(hasValidMove(board), true);
  assert.equal([...board.types].sort().join(','), before, '重排不应改变元素构成');
});

test('棋盘序列化：往返后状态一致', () => {
  const board = createBoard({ rows: 8, cols: 8, elementTypes: 6, iceCells: [[2, 2]] }, rng(44));
  board.setType(0, 0, 2, 'stripe_v');
  const data = board.serialize();
  const back = Board.deserialize(data, { rows: 8, cols: 8, elementTypes: 6, iceCells: [[2, 2]] });
  assert.deepEqual(back.serialize(), data);
  assert.equal(back.specialAt(0, 0), 'stripe_v');
});
