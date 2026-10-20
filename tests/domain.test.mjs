/**
 * 领域层单元测试（NFR-17 / AC-38）
 *
 * 运行：node --test tests/
 * 全部用例不依赖 DOM、Canvas、localStorage，可在任意 JavaScript 运行环境执行。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Board } from '../js/domain/board.js';
import { findMatches, isValidSwap, planSpecials, hasMatchAt, blastCells } from '../js/domain/matchEngine.js';
import { resolveCascade } from '../js/domain/cascadeResolver.js';
import { hasValidMove, findAnyValidMove, reshuffle } from '../js/domain/deadlockDetector.js';
import { scoreCascadeStep, scoreClearBonus, judgeStars, settleScore } from '../js/domain/scorer.js';
import { createBoard } from '../js/domain/boardFactory.js';
import { RandomSource } from '../js/core/random.js';
import { SPECIAL } from '../js/core/constants.js';

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

test('特殊元素：四连条纹、五连彩虹、L 形/T 形炸弹', () => {
  const four = makeBoard(['AAAAB', 'CDEFG', 'DFGCE', 'EGCDF']);
  const p4 = planSpecials(four, findMatches(four), []);
  assert.equal(p4.length, 1);
  assert.equal(p4[0].special, 'stripe_h', '横向四连生成横向条纹');

  const five = makeBoard(['AAAAA', 'CDEFG', 'DFGCE', 'EGCDF']);
  const p5 = planSpecials(five, findMatches(five), []);
  assert.equal(p5.length, 1);
  assert.equal(p5[0].special, 'rainbow');

  // 五格拐角（三连 + 三连）：炸弹，落在交叉点
  const lShape = makeBoard(['AAAB', 'ABCD', 'ACDE', 'CDEF']);
  const pl = planSpecials(lShape, findMatches(lShape), []);
  assert.equal(pl.length, 1);
  assert.equal(pl[0].special, 'bomb');
  assert.equal(pl[0].r, 0);
  assert.equal(pl[0].c, 0, '炸弹应落在横线与竖线的交叉点');

  // 四连 + 三连的六格拐角同样是炸弹
  const bigL = makeBoard(['AAAAB', 'ABCDE', 'ACDEF', 'CDEFG']);
  const pb = planSpecials(bigL, findMatches(bigL), []);
  assert.equal(pb.length, 1);
  assert.equal(pb[0].special, 'bomb');
});

test('炸弹范围：曼哈顿距离不超过 2 的菱形，共 12 个邻格', () => {
  const board = new Board(8, 8, 6);
  const cells = blastCells(board, 4, 4, 'bomb');
  const has = (r, c) => cells.some((x) => x.r === r && x.c === c);
  assert.equal(cells.length, 12, '中心 1 格 + 外围 12 格');
  assert.ok(has(2, 4) && has(6, 4) && has(4, 2) && has(4, 6), '正方向距离 2 在内');
  assert.ok(has(3, 3) && has(5, 5), '相邻斜角在内');
  assert.ok(!has(2, 2) && !has(3, 2), '曼哈顿距离 4 与 3 的格子不在范围内');
});

test('炸弹没有颜色，不参与匹配，只能靠交换或波及引爆', () => {
  const board = makeBoard(['AAAB', 'CDEF', 'DFCE', 'ECFD']);
  board.setType(0, 2, 0, 'bomb');
  // 炸弹所在格不参与连线判定
  assert.equal(board.isMatchable(0, 2), false, '炸弹不可匹配');
  // 三连被炸弹打断：(0,0)(0,1) 只剩两颗，不算消除
  assert.equal(findMatches(board).length, 0);
});

test('特殊元素落点不会被放在已有特殊元素上（否则它不触发也不消失）', () => {
  // 四连中间那颗已经是条纹：落点必须避开它，让它正常被消除并引爆
  const board = makeBoard(['AAAAB', 'CDEFG', 'DFGCE', 'EGCDF']);
  board.setType(0, 1, 0, 'stripe_h');
  const plans = planSpecials(board, findMatches(board), [{ r: 0, c: 1 }]);
  assert.equal(plans.length, 1);
  assert.notEqual(`${plans[0].r},${plans[0].c}`, '0,1', '落点不能是已有条纹的格子');
});

test('整组都是特殊元素时不再生成新的特殊元素', () => {
  const board = makeBoard(['AAAAB', 'CDEFG', 'DFGCE', 'EGCDF']);
  board.setType(0, 0, 0, 'stripe_h');
  board.setType(0, 1, 0, 'stripe_v');
  board.setType(0, 2, 0, 'bomb');
  const plans = planSpecials(board, findMatches(board), []);
  assert.equal(plans.length, 0, '全部是特殊元素时应全部触发，而不是新增一个');
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

// ------------------------------------------------------------------ EX 关卡规则

test('EX-1：三连可消除，但条纹/彩虹阈值单独提高', () => {
  const board = makeBoard(['AAAB', 'CDEF', 'DFCE', 'ECFD']);
  board.rules = { stripeThreshold: 5, rainbowThreshold: 6 };
  assert.equal(findMatches(board).length, 1, '三连仍可匹配');

  const four = makeBoard(['AAAAB', 'CDEFG', 'DFGCE', 'EGCDF']);
  four.rules = { stripeThreshold: 5, rainbowThreshold: 6 };
  assert.equal(findMatches(four).length, 1, '四连可匹配');
  const p4 = planSpecials(four, findMatches(four), []);
  assert.equal(p4.length, 0, '四连不应生成条纹（阈值已提高到 5）');

  const five = makeBoard(['AAAAA', 'CDEFG', 'DFGCE', 'EGCDF']);
  five.rules = { stripeThreshold: 5, rainbowThreshold: 6 };
  const p5 = planSpecials(five, findMatches(five), []);
  assert.equal(p5.length, 1);
  assert.equal(p5[0].special, 'stripe_h', '五连应生成条纹（彩虹阈值 6）');
});

test('EX-3：炸弹范围可缩小为周围 4 格，彩虹可随机消除指定数量', () => {
  const board = new Board(8, 8, 6);
  board.rules = { bombRange: 4 };
  const cells = blastCells(board, 4, 4, SPECIAL.BOMB);
  assert.equal(cells.length, 4, '小范围炸弹只有正交 4 格');

  const rb = new Board(8, 8, 6);
  rb.rules = { rainbowRandomClear: true, rainbowRandomCount: 5 };
  // 在 (0,0)..(3,3) 填入 A，其余 B，让最多颜色是 B
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      rb.setType(r, c, r < 4 && c < 4 ? 0 : 1);
    }
  }
  const rainbows = blastCells(rb, 4, 4, SPECIAL.RAINBOW, rng(55));
  assert.ok(rainbows.length <= 5 && rainbows.length > 0, '随机彩虹应消除 1~5 个');
});

test('EX-4：双层冰需要两次相邻消除才会消失', () => {
  const board = makeBoard(['AAAB', 'CDEF', 'DFCE', 'ECFD']);
  board.setIce(0, 3, 2);
  const res = resolveCascade(board, { rng: rng(9) });
  assert.equal(res.iceCleared, 0, '第一次相邻消除只削减一层冰，不计入清除');
  assert.equal(board.iceAt(0, 3), 1, '双层冰应还剩一层');
});

test('EX-5：触发后的特殊方块保留在棋盘上并进入冰冻', () => {
  const board = new Board(6, 6, 4);
  for (let r = 0; r < 6; r += 1) {
    for (let c = 0; c < 6; c += 1) board.setType(r, c, (r + c) % 4);
  }
  // 放两颗未冰冻的特殊方块，触发其中一颗，另一颗保持未冰冻
  board.setType(0, 0, 0, SPECIAL.BOMB);
  board.setType(5, 5, 1, SPECIAL.STRIPE_H);
  board.rules = { specialCycle: true };

  const res = resolveCascade(board, { initialCells: [{ r: 0, c: 0 }], rng: rng(12) });
  assert.ok(res.sequence.length >= 1, '特殊循环规则下仍可正常结算');
  assert.equal(board.specialAt(0, 0), SPECIAL.BOMB, '炸弹触发后仍应留在棋盘上');
  assert.ok(board.isSpecialFrozen(0, 0), '炸弹触发后应进入冰冻状态');
  assert.ok(!board.isSpecialFrozen(5, 5), '未触发的特殊方块应保持未冰冻');

  const data = board.serialize();
  const back = Board.deserialize(data, { rows: 6, cols: 6, elementTypes: 4 });
  assert.deepEqual(back.specialFrozen, board.specialFrozen, '冰冻状态应被序列化保留');
  assert.equal(back.specialAt(0, 0), SPECIAL.BOMB);
});

test('EX-5：冰冻中的特殊方块不能被交换', () => {
  const board = makeBoard(['ABCD', 'CDEF', 'DFCE', 'ECFD']);
  board.setType(0, 0, 0, SPECIAL.BOMB);
  board.setSpecialFrozen(0, 0, true);
  board.rules = { specialCycle: true };
  // (0,0) 炸弹被冻住，(0,1) 是普通元素，交换应被禁止
  assert.equal(isValidSwap(board, { r: 0, c: 0 }, { r: 0, c: 1 }), false, '冰冻中的炸弹不可移动');
  assert.ok(!board.isFree(0, 0), '冰冻中的特殊方块不是自由格');
  // 同一规则下，两个普通元素仍可正常判定
  const plain = makeBoard(['AAB', 'CDE', 'FGH']);
  plain.rules = { specialCycle: true };
  assert.equal(isValidSwap(plain, { r: 0, c: 1 }, { r: 0, c: 2 }), false);
});

test('EX-5：所有特殊方块都冰冻后统一解冻', () => {
  const board = new Board(6, 6, 4);
  for (let r = 0; r < 6; r += 1) {
    for (let c = 0; c < 6; c += 1) board.setType(r, c, (r + c) % 4);
  }
  // 两颗都已冰冻：触发其中一颗后它会重新冰冻，此时全部冰冻 → 统一解冻
  board.setType(0, 0, 0, SPECIAL.STRIPE_H);
  board.setSpecialFrozen(0, 0, true);
  board.setType(5, 5, 1, SPECIAL.BOMB);
  board.setSpecialFrozen(5, 5, true);
  board.rules = { specialCycle: true };

  // 先临时解冻条纹并强制触发，验证统一解冻
  board.setSpecialFrozen(0, 0, false);
  const res = resolveCascade(board, { initialCells: [{ r: 0, c: 0 }], rng: rng(2) });
  assert.ok(res.sequence.length >= 1, '条纹被强制触发');
  assert.ok(!board.isSpecialFrozen(0, 0), '统一解冻后条纹恢复可交互');
  assert.ok(!board.isSpecialFrozen(5, 5), '统一解冻后炸弹也恢复可交互');
});
