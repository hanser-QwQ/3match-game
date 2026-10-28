/**
 * 领域层单元测试（NFR-17 / AC-38）
 *
 * 运行：node --test tests/
 * 全部用例不依赖 DOM、Canvas、localStorage，可在任意 JavaScript 运行环境执行。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Board } from '../js/domain/board.js';
import { findMatches, isValidSwap, planSpecials, planSpecialSwap, hasMatchAt, blastCells } from '../js/domain/matchEngine.js';
import { resolveCascade } from '../js/domain/cascadeResolver.js';
import { hasValidMove, findAnyValidMove, reshuffle } from '../js/domain/deadlockDetector.js';
import { scoreCascadeStep, scoreClearBonus, judgeStars, settleScore } from '../js/domain/scorer.js';
import { goalTasks } from '../js/domain/goals.js';
import { createBoard } from '../js/domain/boardFactory.js';
import { RandomSource } from '../js/core/random.js';
import { SPECIAL, chainMultiplier } from '../js/core/constants.js';
import { resolveTheme } from '../js/core/theme.js';
import { LevelRepository } from '../js/infrastructure/levelRepository.js';
import { GameController } from '../js/application/gameController.js';
import { checkBooster, consumeBooster, boosterLimit, boosterUsedTotal, sanitizeBoosterLoadout } from '../js/domain/boosterService.js';
import { GameSession } from '../js/application/gameSession.js';
import { readFileSync } from 'node:fs';
import { createDefaultSave, normalizeSave } from '../js/infrastructure/storageService.js';
import { buildAchievementStats, evaluateAchievements } from '../js/domain/achievements.js';

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

test('冰块：特殊方块落点旁边的冰块也会削减耐久', () => {
  const board = makeBoard([
    'BCDEA',
    'CDEAB',
    'AAAAB',
    'DEABC',
  ]);
  // 只与四连的特殊方块落点 (2,2) 相邻，不与其它被消除格相邻
  board.setIce(1, 2, 1);
  const res = resolveCascade(board, { rng: rng(21) });
  assert.ok(res.specialsCreated >= 1, '四连应生成特殊方块');
  assert.ok(res.iceCleared >= 1, '落点旁边的冰块应被削减');
  assert.equal(board.iceAt(1, 2), 0);
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

test('EX-1 升阶：两个条纹交换合成为彩虹', () => {
  const board = new Board(4, 4, 5);
  board.setType(1, 1, 0, SPECIAL.STRIPE_H);
  board.setType(1, 2, 1, SPECIAL.STRIPE_V);
  board.rules = { stripePairToRainbow: true };

  const upgrade = planSpecialSwap(board, { r: 1, c: 1 }, { r: 1, c: 2 }, null);
  assert.equal(upgrade.upgradeRainbow, true, '开启规则时应返回彩虹升阶');
  assert.equal(upgrade.combo, 'stripe+stripe->rainbow');

  // 没有该规则时仍走普通的条纹 + 条纹组合
  board.rules = {};
  const normal = planSpecialSwap(board, { r: 1, c: 1 }, { r: 1, c: 2 }, null);
  assert.equal(normal.upgradeRainbow, undefined);
  assert.equal(normal.combo, 'stripe_h+stripe_v');
});

test('EX-1 升阶：交换两个条纹后，一个变彩虹、另一个降为普通元素', async () => {
  const level = {
    levelId: 101,
    name: 'EX-1 升阶',
    isEx: true,
    valid: true,
    hidden: false,
    moves: 20,
    goal: { type: 'score', amount: 100 },
    board: { rows: 8, cols: 8, elementTypes: 5, iceCells: [], blockedCells: [] },
    rules: { stripePairToRainbow: true },
    disabledBoosters: [],
  };
  const renderer = {
    setBoard() {},
    setHint() {},
    setInputLocked() {},
    setArmedTarget() {},
    syncBoard() {},
    async playSpecialSwap() {},
    async playSwap() {},
    async playStep() {},
    async playReshuffle() {},
  };
  const controller = new GameController({
    bus: { emit() {} },
    storage: { read: () => null, write: () => ({ ok: true }) },
    levels: { get: (id) => (Number(id) === 101 ? level : null), playable: () => [level] },
    audio: { setEnabled() {}, setVolume() {}, play() {} },
    renderer,
    tutorial: null,
    rng: new RandomSource(7),
    navigate() {},
    toast() {},
  });
  controller.save = {
    progress: {},
    settings: { soundEnabled: true, volume: 50 },
    interruptedSession: null,
    localBest: [],
    player: { totalScore: 0 },
  };

  assert.equal(controller.startLevel(101, { resume: false }), true);
  const s = controller.session;
  const keep = findAnyValidMove(s.board);
  const used = new Set(keep ? [`${keep.a.r},${keep.a.c}`, `${keep.b.r},${keep.b.c}`] : []);
  const pairs = [
    [{ r: 7, c: 6 }, { r: 7, c: 7 }],
    [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    [{ r: 7, c: 0 }, { r: 7, c: 1 }],
    [{ r: 0, c: 6 }, { r: 0, c: 7 }],
  ];
  const [a, b] = pairs.find(([p, q]) => !used.has(`${p.r},${p.c}`) && !used.has(`${q.r},${q.c}`)) || pairs[0];
  s.board.setType(a.r, a.c, 0, SPECIAL.STRIPE_H);
  s.board.setType(b.r, b.c, 1, SPECIAL.STRIPE_V);

  const res = await controller.handleSwap(a, b);
  assert.equal(res.ok, true);
  assert.equal(s.board.specialAt(b.r, b.c), SPECIAL.RAINBOW, '目标格应变成彩虹');
  assert.equal(s.board.specialAt(a.r, a.c), null, '另一个条纹应降为普通元素');
  assert.equal(s.movesLeft, 19, '合成彩虹消耗一步');
  assert.equal(s.turnCount, 1, '合成应计入一次操作');
});

test('EX-7 雷暴：四连强制生成炸弹，炸弹半径可扩大', () => {
  const board = makeBoard([
    'AAAAB',
    'CDEFC',
    'DEFCD',
    'EFDCE',
  ]);
  const matches = findMatches(board);
  const normal = planSpecials(board, matches, [], null);
  assert.equal(normal[0].special, SPECIAL.STRIPE_H);

  board.rules = { forceBombOnMatch: true, bombRadius: 3 };
  const forced = planSpecials(board, matches, [], null);
  assert.equal(forced[0].special, SPECIAL.BOMB);

  const blastBoard = new Board(8, 8, 6);
  blastBoard.rules = { bombRadius: 3 };
  const blast = blastCells(blastBoard, 4, 4, SPECIAL.BOMB, null);
  assert.equal(blast.length, 24, '半径 3 的菱形去掉中心应覆盖 24 格');
  const keys = new Set(blast.map((cell) => `${cell.r},${cell.c}`));
  assert.ok(keys.has('4,1'));
  assert.equal(keys.has('4,0'), false);
});

test('EX-7 雷暴：一颗炸弹会连锁引爆全场炸弹', () => {
  const board = new Board(8, 8, 6);
  board.setType(1, 1, 0, SPECIAL.BOMB);
  board.setType(6, 6, 1, SPECIAL.BOMB);
  board.rules = { bombChainAll: true, bombRadius: 3, bombBonus: 100 };
  const res = resolveCascade(board, { initialCells: [{ r: 1, c: 1 }], rng: rng(3) });
  assert.ok(res.sequence[0].triggered.length >= 2, '两颗炸弹都应被引爆');
  assert.ok(res.sequence[0].score >= 200, '两颗炸弹的额外加分应计入');
});

test('EX-9 禁术·咒发：四连立即释放条纹，且不留下特殊方块', () => {
  const board = makeBoard([
    'AAAAB',
    'CDEFC',
    'DEFCD',
    'EFDCE',
  ]);
  board.rules = { instantSpecials: true };
  const res = resolveCascade(board, { rng: rng(3) });

  assert.equal(res.sequence[0].specials.length, 0, '不应生成成品特殊方块');
  assert.ok(res.sequence[0].cleared.length > 4, '四连应额外释放一次条纹');
  assert.equal(res.specialsCreated, 0);
  let specials = 0;
  board.eachCell((r, c) => {
    if (board.specialAt(r, c)) specials += 1;
  });
  assert.equal(specials, 0, '结算后棋盘上不应留下特殊方块');
});

test('EX-9 禁术：不再生成特殊方块，基础分翻倍', () => {
  const board = makeBoard([
    'AAAAB',
    'CDEFC',
    'DEFCD',
    'EFDCE',
  ]);
  board.rules = { noSpecials: true };
  assert.deepEqual(planSpecials(board, findMatches(board), [], null), []);

  const plain = makeBoard(['AAAB', 'CDEF', 'DEFC', 'EFCD']);
  const normal = resolveCascade(plain, { rng: rng(5) });
  assert.equal(normal.sequence[0].score, 30);

  const doubled = makeBoard(['AAAB', 'CDEF', 'DEFC', 'EFCD']);
  doubled.rules = { baseScoreMultiplier: 2 };
  const boosted = resolveCascade(doubled, { rng: rng(5) });
  assert.equal(boosted.sequence[0].score, 60);
});

test('EX-10 祭典：连锁倍率上限可提升到 5 倍', () => {
  assert.equal(chainMultiplier(1), 1);
  assert.equal(chainMultiplier(9), 3);
  assert.equal(chainMultiplier(7, 5), 4);
  assert.equal(chainMultiplier(9, 5), 5);
});

test('EX-6 回响：生成特殊方块返还步数，单次最多 2 步', () => {
  const controller = new GameController({
    bus: { emit() {} },
    storage: { read: () => null, write: () => ({ ok: true }) },
    levels: { get: () => null, list: () => [], playable: () => [] },
    audio: { setEnabled() {}, setVolume() {}, play() {} },
    renderer: null,
    tutorial: null,
    rng: null,
    navigate() {},
    toast() {},
  });
  controller.session = {
    level: { rules: { refundMoveOnSpecial: 1 } },
    movesLeft: 5,
    movesTotal: 10,
  };
  controller.toast = () => {};
  controller.emitSession = () => {};

  assert.equal(controller.applySpecialMoveRefund({ specialsCreated: 1 }), 1);
  assert.equal(controller.session.movesLeft, 6);
  assert.equal(controller.applySpecialMoveRefund({ specialsCreated: 3 }), 2);
  assert.equal(controller.session.movesLeft, 8);
  assert.equal(controller.applySpecialMoveRefund({ specialsCreated: 0 }), 0);
  assert.equal(controller.session.movesLeft, 8);
});

test('EX-8 霜潮：每 4 步冻结一个 2×2 区域', async () => {
  const level = {
    levelId: 108,
    name: 'EX-8 霜潮',
    isEx: true,
    valid: true,
    hidden: false,
    moves: 20,
    goal: { type: 'score', amount: 2400 },
    board: { rows: 8, cols: 8, elementTypes: 6, iceCells: [], blockedCells: [] },
    rules: { freezeAreaEveryNMoves: 5, freezeAreaSize: 2, freezeAreaCells: 2, freezeAreaMaxIce: 8 },
    disabledBoosters: [],
    starThresholds: [2400, 3600, 4800],
  };
  const renderer = {
    setBoard() {},
    setHint() {},
    setInputLocked() {},
    setArmedTarget() {},
    syncBoard() {},
    async playFreeze() {},
    async playStep() {},
    async playSwap() {},
    async playSpecialSwap() {},
    async playReshuffle() {},
  };
  const controller = new GameController({
    bus: { emit() {} },
    storage: { read: () => null, write: () => ({ ok: true }) },
    levels: {
      get: (id) => (Number(id) === 108 ? level : null),
      list: () => [level],
      playable: () => [level],
    },
    audio: { setEnabled() {}, setVolume() {}, play() {} },
    renderer,
    tutorial: null,
    rng: new RandomSource(11),
    navigate() {},
    toast() {},
  });
  controller.save = {
    progress: {},
    settings: { soundEnabled: true, volume: 50 },
    tutorialDone: false,
    interruptedSession: null,
    localBest: [],
    achievements: {},
    player: { nickname: 'T', totalScore: 0 },
  };

  assert.equal(controller.startLevel(108, { resume: false }), true);
  const s = controller.session;
  s.turnCount = 5;
  await controller.applyFreezeRule();

  assert.equal(s.board.countIce(), 2, '一次应冻结 2 格');
  // 达到上限后不再继续加冰
  s.board.eachCell((r, c) => s.board.setIce(r, c, 0));
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 4; c += 1) s.board.setIce(r, c, 1);
  }
  assert.equal(s.board.countIce(), 8);
  await controller.applyFreezeRule();
  assert.equal(s.board.countIce(), 8, '场上冰格达到上限后不应继续结霜');
  let maxInArea = 0;
  for (let r = 0; r + 2 <= s.board.rows; r += 1) {
    for (let c = 0; c + 2 <= s.board.cols; c += 1) {
      let n = 0;
      for (let rr = r; rr < r + 2; rr += 1) {
        for (let cc = c; cc < c + 2; cc += 1) if (s.board.iceAt(rr, cc) > 0) n += 1;
      }
      maxInArea = Math.max(maxInArea, n);
    }
  }
  assert.ok(maxInArea >= 2, '冰块应聚集在 2×2 区域内');
});

test('EX-10 祭典：每 4 步赠予一个特殊方块', async () => {
  const level = {
    levelId: 110,
    name: 'EX-10 祭典',
    isEx: true,
    valid: true,
    hidden: false,
    moves: 20,
    goal: { type: 'score', amount: 3000 },
    board: { rows: 8, cols: 8, elementTypes: 6, iceCells: [], blockedCells: [] },
    rules: { giftSpecialEveryNMoves: 4 },
    disabledBoosters: [],
    starThresholds: [3000, 4200, 5400],
  };
  const renderer = {
    setBoard() {},
    setHint() {},
    setInputLocked() {},
    setArmedTarget() {},
    syncBoard() {},
    async playSpecialSwap() {},
    async playStep() {},
    async playSwap() {},
    async playReshuffle() {},
  };
  const controller = new GameController({
    bus: { emit() {} },
    storage: { read: () => null, write: () => ({ ok: true }) },
    levels: {
      get: (id) => (Number(id) === 110 ? level : null),
      list: () => [level],
      playable: () => [level],
    },
    audio: { setEnabled() {}, setVolume() {}, play() {} },
    renderer,
    tutorial: null,
    rng: new RandomSource(13),
    navigate() {},
    toast() {},
  });
  controller.save = {
    progress: {},
    settings: { soundEnabled: true, volume: 50 },
    tutorialDone: false,
    interruptedSession: null,
    localBest: [],
    achievements: {},
    player: { nickname: 'T', totalScore: 0 },
  };

  assert.equal(controller.startLevel(110, { resume: false }), true);
  const s = controller.session;
  const countSpecials = () => {
    let n = 0;
    s.board.eachCell((r, c) => {
      if (s.board.specialAt(r, c)) n += 1;
    });
    return n;
  };
  assert.equal(countSpecials(), 0);
  s.turnCount = 4;
  await controller.applyGiftRule();
  assert.equal(countSpecials(), 1, '祭典应赠予一个特殊方块');
});

test('EX-5 限量：特殊方块按类型配额生成，配额用完后不再生成', () => {
  const board = new Board(8, 8, 6);
  board.rules = { specialQuota: { stripe: 4, bomb: 3, rainbow: 1 } };

  assert.equal(board.canGenerateSpecial(SPECIAL.STRIPE_H), true);
  for (let i = 0; i < 4; i += 1) board.recordSpecialGenerated(SPECIAL.STRIPE_V);
  assert.equal(board.canGenerateSpecial(SPECIAL.STRIPE_H), false, '横竖条纹共用 stripe 配额');
  assert.equal(board.canGenerateSpecial(SPECIAL.STRIPE_V), false);
  assert.equal(board.specialGenerated.stripe, 4);

  for (let i = 0; i < 3; i += 1) board.recordSpecialGenerated(SPECIAL.BOMB);
  assert.equal(board.canGenerateSpecial(SPECIAL.BOMB), false, '炸弹配额 3 用完后不再生成');

  board.recordSpecialGenerated(SPECIAL.RAINBOW);
  assert.equal(board.canGenerateSpecial(SPECIAL.RAINBOW), false, '彩虹配额 1 用完后不再生成');

  const data = board.serialize();
  const back = Board.deserialize(data, { rows: 8, cols: 8, elementTypes: 6 });
  assert.deepEqual(back.specialGenerated, { stripe: 4, bomb: 3, rainbow: 1 }, '生成计数应被序列化保留');
});

test('EX-5 限量：配额为 0 时四连只消除、不生成条纹', () => {
  const blocked = makeBoard(['AAAAB', 'CDEFG', 'DFGCE', 'EGCDF']);
  blocked.rules = { specialQuota: { stripe: 0, bomb: 0, rainbow: 0 } };
  const res = resolveCascade(blocked, { rng: rng(7) });
  assert.equal(res.specialsCreated, 0, '所有配额为 0 时不应生成任何特殊方块');
  assert.equal(blocked.specialGenerated.stripe, 0);

  const allowed = makeBoard(['AAAAB', 'CDEFG', 'DFGCE', 'EGCDF']);
  allowed.rules = { specialQuota: { stripe: 1, bomb: 0, rainbow: 0 } };
  const res2 = resolveCascade(allowed, { rng: rng(7) });
  assert.equal(res2.specialsCreated, 1, '条纹配额 1 时只生成一个条纹');
  assert.equal(allowed.specialGenerated.stripe, 1);
});

test('特殊节律（保留规则）：使用炸弹后炸弹消失，之后新生成的炸弹被冻住', () => {
  const board = new Board(6, 6, 4);
  for (let r = 0; r < 6; r += 1) {
    for (let c = 0; c < 6; c += 1) board.setType(r, c, (r + c) % 4);
  }
  board.setType(0, 0, 0, SPECIAL.BOMB);
  // 场上已有的另一颗炸弹：本轮炸弹用过之后应当被及时冻住
  board.setType(5, 0, 1, SPECIAL.BOMB);
  board.setType(5, 5, 2, SPECIAL.STRIPE_H);
  board.rules = { specialCycle: true };

  const res = resolveCascade(board, { initialCells: [{ r: 0, c: 0 }], rng: rng(12) });
  assert.ok(res.sequence.length >= 1, '炸弹应正常引爆结算');
  assert.equal(board.specialAt(0, 0), null, '被使用的炸弹应正常消失');
  assert.ok(board.isSpecialCategoryUsed(SPECIAL.BOMB), '炸弹类型应被标记为本轮已使用');
  assert.ok(board.isSpecialFrozen(5, 0), '场上已有的同类炸弹也应及时冻住');
  assert.ok(!board.isSpecialFrozen(5, 5), '未使用类型的特殊方块不会被冻结');

  // 本轮再生成一颗炸弹：一出生就应该是冰冻状态
  board.setType(4, 0, 2, SPECIAL.BOMB);
  board.applySpecialCreationRule(4, 0);
  assert.ok(board.isSpecialFrozen(4, 0), '炸弹用过之后，新生成的炸弹应被冻住');

  const data = board.serialize();
  const back = Board.deserialize(data, { rows: 6, cols: 6, elementTypes: 4 });
  assert.deepEqual([...back.usedSpecialTypes].sort(), ['bomb'], '已使用类型应被序列化保留');
  assert.ok(back.isSpecialFrozen(4, 0), '冰冻状态应被序列化保留');
});

test('特殊节律（保留规则）：冰冻的特殊方块免疫爆炸，不会被炸掉也不会触发', () => {
  const board = new Board(6, 6, 4);
  for (let r = 0; r < 6; r += 1) {
    for (let c = 0; c < 6; c += 1) board.setType(r, c, (r + c) % 4);
  }
  // 第 2 行：条纹在左，冰冻炸弹在中间
  board.setType(2, 0, 0, SPECIAL.STRIPE_H);
  board.setType(2, 3, 1, SPECIAL.BOMB);
  board.setSpecialFrozen(2, 3, true);
  board.markSpecialUsed(SPECIAL.BOMB);
  board.rules = { specialCycle: true };

  const res = resolveCascade(board, { initialCells: [{ r: 2, c: 0 }], rng: rng(3) });
  const first = res.sequence[0];
  assert.ok(first, '条纹应触发');
  assert.ok(!first.cleared.some((x) => x.r === 2 && x.c === 3), '冰冻炸弹不应出现在消除列表里');
  assert.ok(!first.triggered.includes('2,3'), '冰冻炸弹不应被触发');
  assert.equal(board.specialAt(2, 3), SPECIAL.BOMB, '冰冻炸弹应留在棋盘上');
  assert.ok(board.isSpecialFrozen(2, 3), '冰冻炸弹应保持冰冻');
});

test('特殊节律（保留规则）：冰冻中的特殊方块不能被交换', () => {
  const board = makeBoard(['ABCD', 'CDEF', 'DFCE', 'ECFD']);
  board.setType(0, 0, 0, SPECIAL.BOMB);
  board.setSpecialFrozen(0, 0, true);
  board.rules = { specialCycle: true };
  // (0,0) 炸弹被冻住，(0,1) 是普通元素，交换应被禁止
  assert.equal(isValidSwap(board, { r: 0, c: 0 }, { r: 0, c: 1 }), false, '冰冻中的炸弹不可移动');
  assert.ok(!board.isFree(0, 0), '冰冻中的特殊方块不是自由格');
  assert.equal(planSpecialSwap(board, { r: 0, c: 0 }, { r: 0, c: 1 }), null, '冰冻中的特殊方块不能触发特殊交换');
  // 同一规则下，两个普通元素仍可正常判定
  const plain = makeBoard(['AAB', 'CDE', 'FGH']);
  plain.rules = { specialCycle: true };
  assert.equal(isValidSwap(plain, { r: 0, c: 1 }, { r: 0, c: 2 }), false);
});

test('关卡仓库：hidden 关卡不会进入列表与可玩列表', async () => {
  const make = (levelId, hidden) => ({
    levelId,
    name: `L${levelId}`,
    isEx: levelId > 100,
    hidden,
    board: { rows: 8, cols: 8, elementTypes: 6 },
    goal: { type: 'score', amount: 1000 },
    moves: 20,
    starThresholds: [1000, 2000, 3000],
    disabledBoosters: [],
  });

  const repo = new LevelRepository({ embedded: [make(1, false), make(105, true)] });
  await repo.loadAll();
  assert.equal(repo.list().length, 1, '隐藏关卡不应出现在列表里');
  assert.equal(repo.playable().length, 1, '隐藏关卡不应进入可玩列表');
  assert.equal(repo.get(105).hidden, true, '隐藏关卡的数据仍然保留，便于重新开放');
  assert.equal(repo.all().length, 2, '诊断接口仍能看到全部关卡');
});

test('破冰目标：棋盘冰块多于目标时，只计算目标数量', () => {
  const counters = { score: 0, collected: {}, iceLeft: 2, initialIce: 12 };
  const [task] = goalTasks({ type: 'clear_ice', amount: 10 }, counters);
  assert.equal(task.total, 10, '目标总量应为配置的 10，而不是棋盘上的 12');
  assert.equal(task.cleared, 10);
  assert.equal(task.done, true, '清掉 10 块冰后目标应完成');
});

test('关卡数据：评星阈值严格递增，3 星线高于分数目标', () => {
  const levelsRoot = new URL('../levels/', import.meta.url);
  const index = JSON.parse(readFileSync(new URL('index.json', levelsRoot), 'utf8'));
  for (const id of index.levels) {
    const file = new URL(`level-${String(id).padStart(2, '0')}.json`, levelsRoot);
    const level = JSON.parse(readFileSync(file, 'utf8'));
    const thresholds = level.starThresholds;
    assert.ok(Array.isArray(thresholds) && thresholds.length === 3, `关卡 ${id} 缺少三个星级阈值`);
    assert.ok(
      thresholds[0] > 0 && thresholds[1] > thresholds[0] && thresholds[2] > thresholds[1],
      `关卡 ${id} 的星级阈值必须严格递增`
    );

    const scoreGoal = (() => {
      if (level.goal?.type === 'score') return level.goal.amount;
      if (level.goal?.type === 'combo') {
        if (level.goal.primary?.type === 'score') return level.goal.primary.amount;
        if (level.goal.secondary?.type === 'score') return level.goal.secondary.amount;
      }
      return 0;
    })();
    if (scoreGoal) {
      assert.ok(thresholds[2] > scoreGoal, `关卡 ${id} 的 3 星线应高于分数目标`);
    }
  }
});

test('首页入口：继续按钮显示的关卡与点击进入的关卡一致', () => {
  const items = new Map([
    [1, { levelId: 1, isEx: false, valid: true, hidden: false }],
    [2, { levelId: 2, isEx: false, valid: true, hidden: false }],
    [101, { levelId: 101, isEx: true, valid: true, hidden: false }],
    [105, { levelId: 105, isEx: true, valid: true, hidden: true }],
  ]);
  const levels = {
    get(id) {
      return items.get(Number(id)) || null;
    },
    playable() {
      return [...items.values()].filter((lv) => lv.valid && !lv.hidden).sort((a, b) => a.levelId - b.levelId);
    },
  };
  const controller = new GameController({
    bus: { emit() {} },
    storage: { read: () => null, write: () => ({ ok: true }) },
    levels,
    audio: { setEnabled() {}, setVolume() {} },
    renderer: null,
    tutorial: null,
    rng: null,
    navigate() {},
    toast() {},
  });
  controller.save = { progress: { 1: { cleared: true } }, interruptedSession: null };

  assert.deepEqual(controller.homeEntry(), { levelId: 2, resume: false }, '没有中断会话时进入下一未通关普通关');

  controller.save.interruptedSession = { levelId: 101, board: [[1]] };
  assert.deepEqual(controller.homeEntry(), { levelId: 101, resume: true }, '暂停在 EX 关时应续玩 EX 关，而不是下一普通关');

  controller.save.interruptedSession = { levelId: 2, board: [[1]] };
  assert.deepEqual(controller.homeEntry(), { levelId: 2, resume: true }, '暂停在普通关时应续玩该关');

  controller.save.interruptedSession = { levelId: 105, board: [[1]] };
  assert.deepEqual(controller.homeEntry(), { levelId: 2, resume: false }, '隐藏关卡的中断会话应回退到下一普通关');
});

test('道具：每关三种道具共用 2 次，不再有库存概念', () => {
  assert.equal(boosterLimit(), 2, '每关总次数为 2');

  assert.equal(checkBooster('shuffle', { usedTotal: 0, state: 'in_progress' }).ok, true);
  const hammer = checkBooster('hammer', { usedTotal: 1, state: 'in_progress' });
  assert.equal(hammer.ok, true, '总次数还剩 1 次时仍可使用其它道具');
  assert.equal(hammer.needsTarget, true, '锤子需要点选目标');

  const exhausted = checkBooster('addMoves', { usedTotal: 2, state: 'in_progress' });
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.reason, 'LIMIT', '共用次数用完后所有道具都不能再用');

  const disabled = checkBooster('hammer', { usedTotal: 0, disabled: ['hammer'], state: 'in_progress' });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.reason, 'DISABLED');

  // 共享次数池：洗牌用一次后锤子仍可用，但总数只剩 1 次
  const usage = { shuffle: 0, hammer: 0, addMoves: 0 };
  usage.shuffle = consumeBooster('shuffle', { used: usage.shuffle }).used;
  assert.equal(boosterUsedTotal(usage), 1);
  usage.hammer = consumeBooster('hammer', { used: usage.hammer }).used;
  assert.equal(boosterUsedTotal(usage), 2);
  assert.equal(checkBooster('addMoves', { usedTotal: boosterUsedTotal(usage) }).ok, false);
});

test('道具配置：去重、过滤未知道具、最多 3 个、允许为空', () => {
  assert.deepEqual(
    sanitizeBoosterLoadout(['shuffle', 'shuffle', 'bomb', 'nope', 'rainbow', 'icePick', 'hammer']),
    ['shuffle', 'bomb', 'rainbow']
  );
  assert.deepEqual(sanitizeBoosterLoadout([]), [], '显式空数组表示不带道具');
  assert.deepEqual(sanitizeBoosterLoadout(null), []);
});

test('道具：取消等待目标的道具不消耗次数，并恢复计时速度', () => {
  const controller = Object.create(GameController.prototype);
  let armed = 'unset';
  controller.boosterArmed = 'hammer';
  controller.renderer = { setArmedTarget: (v) => { armed = v; } };
  controller.emitSession = () => {};
  controller.toast = () => {};

  assert.deepEqual(controller.cancelBooster(), { ok: true });
  assert.equal(controller.boosterArmed, null);
  assert.equal(armed, null, '取消后应清除准星');
  assert.deepEqual(controller.cancelBooster(), { ok: false }, '没有待选道具时取消应无操作');
});

test('EX 计时：手持目标道具时按 0.5 倍速消耗', () => {
  const controller = Object.create(GameController.prototype);
  controller.session = { state: 'in_progress' };
  controller.busy = false;
  controller.emitSession = () => {};
  controller._stopMoveTimer = () => {};

  controller.boosterArmed = 'hammer';
  controller._moveRemaining = 7000;
  controller._moveLastTick = performance.now() - 1000;
  controller._tickMoveTimer();
  assert.ok(
    controller._moveRemaining > 6400 && controller._moveRemaining < 6600,
    `手持道具应只消耗约 500ms，实际 ${controller._moveRemaining}`
  );

  controller.boosterArmed = null;
  controller._moveRemaining = 7000;
  controller._moveLastTick = performance.now() - 1000;
  controller._tickMoveTimer();
  assert.ok(
    controller._moveRemaining > 5900 && controller._moveRemaining < 6100,
    `取消后应恢复正常速度，实际 ${controller._moveRemaining}`
  );
});

test('道具配置：未携带的道具不可用，新道具需要点选目标', () => {
  const notLoaded = checkBooster('rainbow', { usedTotal: 0, state: 'in_progress', loadout: ['shuffle'] });
  assert.equal(notLoaded.ok, false);
  assert.equal(notLoaded.reason, 'NOT_LOADED');

  assert.equal(checkBooster('rainbow', { usedTotal: 0, state: 'in_progress', loadout: ['rainbow'] }).needsTarget, true);
  assert.equal(checkBooster('bomb', { usedTotal: 0, state: 'in_progress', loadout: ['bomb'] }).needsTarget, true);
  assert.equal(checkBooster('icePick', { usedTotal: 0, state: 'in_progress', loadout: ['icePick'] }).needsTarget, true);
  assert.equal(checkBooster('shuffle', { usedTotal: 0, state: 'in_progress', loadout: ['shuffle'] }).needsTarget, false);
});

test('存档：道具配置默认沿用三件套，显式空数组保留', () => {
  assert.deepEqual(createDefaultSave().boosterLoadout, ['shuffle', 'hammer', 'addMoves']);
  assert.deepEqual(normalizeSave({}).boosterLoadout, ['shuffle', 'hammer', 'addMoves']);
  assert.deepEqual(normalizeSave({ boosterLoadout: [] }).boosterLoadout, []);
  assert.deepEqual(
    normalizeSave({ boosterLoadout: ['bomb', 'bomb', 'nope', 'rainbow', 'icePick', 'shuffle'] }).boosterLoadout,
    ['bomb', 'rainbow', 'icePick']
  );
});

test('会话：快照保存本局道具配置', () => {
  const session = new GameSession({
    level: { moves: 20, goal: { type: 'score', amount: 100 } },
    board: new Board(8, 8, 6),
    loadout: ['bomb', 'rainbow'],
  });
  assert.deepEqual(session.boosterLoadout, ['bomb', 'rainbow']);
  assert.deepEqual(session.snapshot().boosterLoadout, ['bomb', 'rainbow']);
});

test('续玩：改道具组后使用新配置，已用次数保留', () => {
  const level = {
    levelId: 1,
    name: 'L1',
    valid: true,
    hidden: false,
    moves: 20,
    goal: { type: 'score', amount: 1000 },
    board: { rows: 8, cols: 8, elementTypes: 5, iceCells: [], blockedCells: [] },
    rules: {},
    disabledBoosters: [],
    starThresholds: [1000, 2000, 3000],
  };
  const controller = new GameController({
    bus: { emit() {} },
    storage: { read: () => null, write: () => ({ ok: true }) },
    levels: {
      get: (id) => (Number(id) === 1 ? level : null),
      list: () => [level],
      playable: () => [level],
    },
    audio: { setEnabled() {}, setVolume() {}, play() {} },
    renderer: null,
    tutorial: null,
    rng: new RandomSource(3),
    navigate() {},
    toast() {},
  });
  controller.save = { ...createDefaultSave(), boosterLoadout: ['shuffle', 'hammer', 'addMoves'] };

  assert.equal(controller.startLevel(1, { resume: false }), true);
  assert.deepEqual(controller.session.boosterLoadout, ['shuffle', 'hammer', 'addMoves']);
  controller.session.boosterUsage.shuffle = 1;
  controller.save.interruptedSession = controller.session.snapshot();
  controller.session = null;
  controller.save.boosterLoadout = [];

  assert.equal(controller.startLevel(1, { resume: true }), true);
  assert.deepEqual(
    controller.session.boosterLoadout,
    ['shuffle', 'hammer', 'addMoves'],
    '续玩是同一局，应沿用快照里的道具配置'
  );
  assert.equal(controller.session.isResumed, true);
  assert.equal(controller.session.boosterUsedTotal, 1, '续玩不应重置已用次数');
});

test('道具配置：修改会同步到当前会话，续玩不重置已用次数', () => {
  const controller = Object.create(GameController.prototype);
  controller.save = { boosterLoadout: [] };
  controller.session = {
    state: 'in_progress',
    isResumed: false,
    turnCount: 0,
    boosterUsedTotal: 0,
    boosterLoadout: [],
  };
  controller.storage = { write() {} };
  controller.emitSession = () => {};

  const out = controller.setBoosterLoadout(['rainbow', 'rainbow', 'bomb', 'icePick', 'shuffle']);
  assert.deepEqual(out, ['rainbow', 'bomb', 'icePick']);
  assert.deepEqual(controller.session.boosterLoadout, out, '未操作时应同步到当前会话');

  controller.session.turnCount = 1;
  controller.session.boosterUsedTotal = 1;
  controller.setBoosterLoadout(['shuffle']);
  assert.deepEqual(controller.session.boosterLoadout, ['shuffle'], '新开的一局可以换道具组');
  assert.equal(controller.session.boosterUsedTotal, 1, '换道具组不应重置已用次数');

  controller.session.isResumed = true;
  controller.setBoosterLoadout(['bomb']);
  assert.deepEqual(controller.session.boosterLoadout, ['shuffle'], '续玩局不应被外部配置改动');
});

test('道具：会话按三种道具的合计次数计算共享次数', () => {
  const session = new GameSession({
    level: { moves: 20, goal: { type: 'score', amount: 100 } },
    board: new Board(8, 8, 6),
  });
  session.boosterUsage = { shuffle: 1, hammer: 1, addMoves: 0 };
  assert.equal(session.boosterUsedTotal, 2, '洗牌 + 锤子各一次后共用次数已用完');
  assert.equal(checkBooster('addMoves', { usedTotal: session.boosterUsedTotal }).ok, false);
});

test('续玩：加三步后的剩余步数与总步数都不会被截回初始值', () => {
  const level = {
    levelId: 1,
    name: 'L1',
    isEx: false,
    valid: true,
    hidden: false,
    moves: 20,
    goal: { type: 'score', amount: 100 },
    board: { rows: 8, cols: 8, elementTypes: 6, iceCells: [], blockedCells: [] },
    rules: {},
    disabledBoosters: [],
  };
  const board = new Board(8, 8, 6);
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) board.setType(r, c, (r + c) % 6);
  }
  const data = board.serialize();
  const snap = {
    levelId: 1,
    board: data.board,
    specials: data.specials,
    ice: data.ice,
    movesLeft: 23,
    movesTotal: 23,
    boostersUsed: { shuffle: 0, hammer: 0, addMoves: 1 },
    score: 0,
  };

  const controller = new GameController({
    bus: { emit() {} },
    storage: { read: () => null, write: () => ({ ok: true }) },
    levels: { get: (id) => (Number(id) === 1 ? level : null), playable: () => [level] },
    audio: { setEnabled() {}, setVolume() {}, play() {} },
    renderer: null,
    tutorial: null,
    rng: new RandomSource(1),
    navigate() {},
    toast() {},
  });
  controller.save = {
    progress: {},
    settings: { soundEnabled: true, volume: 50 },
    interruptedSession: snap,
    localBest: [],
    player: { totalScore: 0 },
  };

  assert.equal(controller.startLevel(1, { resume: true }), true);
  assert.equal(controller.session.movesLeft, 23, '续玩后剩余步数应保留加三步的加成');
  assert.equal(controller.session.movesTotal, 23, '续玩后总步数应保留加三步的加成');
  assert.equal(controller.session.boosterUsage.addMoves, 1, '道具使用次数也应被恢复');
});

test('存档迁移：按历史最高分重算星级，只升不降', () => {
  const levelMap = new Map([
    [1, { levelId: 1, valid: true, starThresholds: [1500, 2100, 2800] }],
    [2, { levelId: 2, valid: true, starThresholds: [2000, 3000, 4000] }],
  ]);
  const controller = new GameController({
    bus: { emit() {} },
    storage: { read: () => null, write: () => ({ ok: true }) },
    levels: { get: (id) => levelMap.get(Number(id)) || null, playable: () => [...levelMap.values()] },
    audio: { setEnabled() {}, setVolume() {} },
    renderer: null,
    tutorial: null,
    rng: null,
    navigate() {},
    toast() {},
  });
  controller.save = {
    progress: {
      1: { cleared: true, stars: 1, highScore: 2200 },
      2: { cleared: true, stars: 3, highScore: 1000 },
      3: { cleared: false, stars: 3, highScore: 9999 },
    },
    localBest: [{ levelId: 1, score: 2200, stars: 1 }],
  };

  assert.equal(controller.recalculateStars(), true);
  assert.equal(controller.save.progress[1].stars, 2, '2200 分按新阈值应升到 2 星');
  assert.equal(controller.save.progress[2].stars, 3, '旧星级更高时保留 3 星');
  assert.equal(controller.save.progress[3].stars, 3, '未通关关卡不参与重算');
  assert.equal(controller.save.localBest[0].stars, 2, '本地成绩的星级也应同步');

  assert.equal(controller.recalculateStars(), false, '第二次重算不应再产生变化');
});

test('成就：统计通关数、星数与最高分，识别可回溯成就', () => {
  const levels = Array.from({ length: 20 }, (_, i) => ({ levelId: i + 1, isEx: false }));
  levels.push({ levelId: 101, isEx: true });
  const progress = {};
  for (let id = 1; id <= 5; id += 1) {
    progress[String(id)] = { cleared: true, stars: id <= 2 ? 3 : 2, highScore: id * 1000 };
  }
  progress['101'] = { cleared: true, stars: 3, highScore: 6000 };

  const stats = buildAchievementStats({ progress, player: { totalScore: 9999 } }, { list: () => levels });
  assert.equal(stats.clearedCount, 6);
  assert.equal(stats.clearedNormalCount, 5);
  assert.equal(stats.clearedExCount, 1);
  assert.equal(stats.threeStarCount, 3);
  assert.equal(stats.normalThreeStarCount, 2);
  assert.equal(stats.totalStars, 15);
  assert.equal(stats.maxHighScore, 6000);

  const ids = evaluateAchievements(stats).map((a) => a.id);
  assert.ok(ids.includes('first_clear'));
  assert.ok(ids.includes('clear_5'));
  assert.ok(ids.includes('first_ex'));
  assert.ok(ids.includes('first_3star'));
  assert.ok(ids.includes('score_5000'));
  assert.equal(ids.includes('clear_20'), false);
  assert.equal(ids.includes('all_ex'), false);
  assert.equal(ids.includes('chain_5'), false);
});

test('成就：本局连锁、剩余步数与无道具 EX 判定', () => {
  const stats = buildAchievementStats(
    { progress: {}, player: {} },
    { list: () => [] },
    { cleared: true, isEx: true, chainBest: 5, movesLeft: 6, boostersUsed: 0 }
  );
  const ids = evaluateAchievements(stats).map((a) => a.id);
  assert.ok(ids.includes('chain_5'));
  assert.ok(ids.includes('no_booster_ex'));
  assert.ok(ids.includes('moves_5'));
});

test('成就：启动时按已有进度补发可回溯成就', () => {
  const levels = Array.from({ length: 5 }, (_, i) => ({ levelId: i + 1, isEx: false, valid: true }));
  const controller = new GameController({
    bus: { emit() {} },
    storage: { read: () => null, write: () => ({ ok: true }) },
    levels: {
      get: (id) => levels.find((lv) => lv.levelId === Number(id)) || null,
      list: () => levels,
      playable: () => levels,
    },
    audio: { setEnabled() {}, setVolume() {} },
    renderer: null,
    tutorial: null,
    rng: null,
    navigate() {},
    toast() {},
  });
  controller.save = {
    progress: {
      1: { cleared: true, stars: 3, highScore: 6000 },
      2: { cleared: true, stars: 1, highScore: 1000 },
      3: { cleared: true, stars: 1, highScore: 1000 },
      4: { cleared: true, stars: 1, highScore: 1000 },
      5: { cleared: true, stars: 1, highScore: 1000 },
    },
    player: { totalScore: 10000 },
    achievements: {},
  };

  const ids = controller.claimAchievements().map((a) => a.id);
  assert.ok(ids.includes('first_clear'));
  assert.ok(ids.includes('clear_5'));
  assert.ok(ids.includes('first_3star'));
  assert.ok(ids.includes('score_5000'));
  assert.equal(ids.includes('clear_20'), false);
  assert.equal(controller.save.achievements.first_clear.seen, false, '补发成就应标为未读');
  assert.equal(controller.claimAchievements().length, 0, '重复补发不应新增');
});

test('成就：结算结果可解锁仅本局成就', () => {
  const controller = new GameController({
    bus: { emit() {} },
    storage: { read: () => null, write: () => ({ ok: true }) },
    levels: { get: () => null, list: () => [], playable: () => [] },
    audio: { setEnabled() {}, setVolume() {} },
    renderer: null,
    tutorial: null,
    rng: null,
    navigate() {},
    toast() {},
  });
  controller.save = { progress: {}, player: {}, achievements: {} };

  const unlocked = controller.claimAchievements({
    result: {
      cleared: true,
      isEx: true,
      chainBest: 5,
      movesLeft: 6,
      boostersUsed: 0,
      at: '2026-10-26T10:00:00+08:00',
    },
    persist: false,
  });
  const ids = unlocked.map((a) => a.id);
  assert.ok(ids.includes('chain_5'));
  assert.ok(ids.includes('no_booster_ex'));
  assert.ok(ids.includes('moves_5'));
  assert.equal(controller.save.achievements.chain_5.unlockedAt, '2026-10-26T10:00:00+08:00');
  assert.equal(controller.save.achievements.chain_5.seen, false);
  assert.equal(controller.achievementSummary().unseen, 3);
});

test('成就：通关结算会在结果对象上带出新解锁成就', async () => {
  const level = {
    levelId: 1,
    name: 'L1',
    valid: true,
    hidden: false,
    moves: 20,
    goal: { type: 'score', amount: 100 },
    board: { rows: 4, cols: 4, elementTypes: 4, iceCells: [], blockedCells: [] },
    rules: {},
    disabledBoosters: [],
    starThresholds: [100, 200, 300],
  };
  const renderer = {
    setBoard() {},
    setHint() {},
    setInputLocked() {},
    setArmedTarget() {},
    syncBoard() {},
    async playSwap() {},
    async playSpecialSwap() {},
    async playStep() {},
    async playReshuffle() {},
  };
  let routed = null;
  const controller = new GameController({
    bus: { emit() {} },
    storage: { read: () => null, write: () => ({ ok: true }) },
    levels: {
      get: (id) => (Number(id) === 1 ? level : null),
      list: () => [level],
      playable: () => [level],
    },
    audio: { setEnabled() {}, setVolume() {}, play() {} },
    renderer,
    tutorial: null,
    rng: new RandomSource(3),
    navigate: (scene, payload) => {
      routed = { scene, payload };
    },
    toast() {},
  });
  controller.save = {
    progress: {},
    settings: { soundEnabled: true, volume: 50 },
    tutorialDone: false,
    interruptedSession: null,
    localBest: [],
    achievements: {},
    player: { nickname: 'T', totalScore: 0 },
  };

  assert.equal(controller.startLevel(1, { resume: false }), true);
  const s = controller.session;
  s.counters.score = 150;
  s.movesLeft = 6;
  s.chainBest = 5;
  await controller.finish(true);

  assert.equal(routed.scene, 'result');
  const ids = routed.payload.achievements.map((a) => a.id);
  assert.ok(ids.includes('first_clear'));
  assert.ok(ids.includes('first_3star'));
  assert.ok(ids.includes('moves_5'));
  assert.ok(ids.includes('chain_5'));
  assert.ok(controller.save.achievements.first_clear, '成就应写入存档');
});

test('存档：成就记录读取，旧存档缺省为空表', () => {
  const save = normalizeSave({
    achievements: {
      first_clear: { unlockedAt: '2026-10-26T10:00:00+08:00', seen: false },
      bad: null,
    },
  });
  assert.equal(save.achievements.first_clear.unlockedAt, '2026-10-26T10:00:00+08:00');
  assert.equal(save.achievements.first_clear.seen, false);
  assert.equal('bad' in save.achievements, false);
  assert.deepEqual(normalizeSave({ progress: {} }).achievements, {});
  assert.deepEqual(createDefaultSave().achievements, {});
});

test('EX 计时：进入关卡先待开始，第一次操作后才启动，重开清除旧暂停状态', () => {
  const level = {
    levelId: 101,
    name: 'EX-1 升阶',
    isEx: true,
    valid: true,
    hidden: false,
    moves: 20,
    goal: { type: 'score', amount: 100 },
    board: { rows: 8, cols: 8, elementTypes: 6, iceCells: [], blockedCells: [] },
    rules: { moveTimeLimit: 1 },
    disabledBoosters: [],
    tutorialHint: '测试提示',
  };
  const renderer = {
    setBoard() {},
    setHint() {},
    setInputLocked() {},
    setArmedTarget() {},
    async playSwap() {},
    async playSpecialSwap() {},
    async playStep() {},
    async playReshuffle() {},
  };
  const controller = new GameController({
    bus: { emit() {} },
    storage: { read: () => null, write: () => ({ ok: true }) },
    levels: { get: (id) => (Number(id) === 101 ? level : null), playable: () => [level] },
    audio: { setEnabled() {}, setVolume() {}, play() {} },
    renderer,
    tutorial: null,
    rng: new RandomSource(1),
    navigate() {},
    toast() {},
  });
  controller.save = {
    progress: {},
    settings: { soundEnabled: true, volume: 50 },
    interruptedSession: null,
    localBest: [],
    player: { totalScore: 0 },
  };

  controller.startLevel(101, { resume: false });
  assert.equal(controller._moveTimerStarted, false, '进入关卡时计时器应处于待开始状态');
  assert.equal(controller._moveTimer, null, '进入关卡时不应启动计时器');
  assert.equal(controller._moveRemaining, 1000, '待开始时显示满时间');

  // 结算期间道具按钮应置灰，避免玩家点了没有反应
  controller.busy = true;
  assert.equal(controller.viewModel().boosters.every((b) => !b.available), true, '结算期间道具应不可用');
  controller.busy = false;

  // 模拟旧状态残留：暂停后再重开
  controller._pausedTimer = true;
  controller.startLevel(101, { resume: false });
  assert.equal(controller._pausedTimer, false, '重开应清除旧的暂停状态');
  assert.equal(controller._moveTimerStarted, false, '重开后仍应等待第一次操作');
  assert.equal(controller._moveTimer, null, '重开后计时器不应空转');

  // 模拟第一次操作完成
  controller._resetMoveTimer();
  assert.equal(controller._moveTimerStarted, true, '第一次操作后计时器应启动');
  assert.notEqual(controller._moveTimer, null, '第一次操作后应有计时器在跑');
  controller._stopMoveTimer();
});

test('星级重算：按新阈值只升不降，已通关关卡不会掉星', () => {
  const levels = new Map([
    [101, { valid: true, starThresholds: [2000, 2800, 3300] }],
    [102, { valid: true, starThresholds: [2200, 2700, 3200] }],
  ]);
  const writes = [];
  const controller = Object.create(GameController.prototype);
  controller.save = {
    progress: {
      101: { cleared: true, highScore: 3000, stars: 3 },
      102: { cleared: true, highScore: 2800, stars: 1 },
    },
    localBest: [],
  };
  controller.levels = { get: (id) => levels.get(Number(id)) };
  controller.storage = { write: (save) => writes.push(save) };

  assert.equal(controller.recalculateStars(), true);
  assert.equal(controller.save.progress['102'].stars, 2, '2800 应按新阈值升到 2 星');
  assert.equal(controller.save.progress['101'].stars, 3, '已获得的 3 星不应被降');
  assert.equal(writes.length, 1, '有变化时应落盘');
});

test('设置：主题模式、背景色相与纯色背景可持久化并夹紧', () => {
  const def = createDefaultSave();
  assert.equal(def.settings.themeMode, 'auto');
  assert.equal(def.settings.bgHue, 36);
  assert.equal(def.settings.plainBg, false);

  const save = normalizeSave({
    settings: { themeMode: 'dark', bgHue: 725, plainBg: 1 },
  });
  assert.equal(save.settings.themeMode, 'dark');
  assert.equal(save.settings.bgHue, 360);
  assert.equal(save.settings.plainBg, true);

  const zero = normalizeSave({ settings: { bgHue: 0 } });
  assert.equal(zero.settings.bgHue, 0, '0 是合法色相，不应回退到默认值');

  const bad = normalizeSave({ settings: { themeMode: 'neon', bgHue: -20 } });
  assert.equal(bad.settings.themeMode, 'auto');
  assert.equal(bad.settings.bgHue, 0);

  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
});

test('存档：旧版 boosters 库存字段被丢弃，默认存档不再包含库存', () => {
  const save = createDefaultSave();
  assert.equal('boosters' in save, false, '默认存档不再包含道具库存');
  assert.equal('flags' in save, false, '一次性奖励标记已不再使用');

  const migrated = normalizeSave({ boosters: { shuffle: 3, hammer: 2, addMoves: 1 }, progress: {} });
  assert.equal('boosters' in migrated, false, '旧存档的库存字段不应继续保留');
  assert.equal('flags' in migrated, false);
});

test('特殊节律（保留规则）：炸弹、彩虹、条纹三类都用过一轮后统一解冻', () => {
  const board = makeBoard(['AAAB', 'CDEF', 'DFCE', 'ECFD']);
  board.rules = { specialCycle: true };
  // 放入一颗已经冰冻的炸弹，代表“炸弹本轮已用过”
  board.setType(0, 3, 1, SPECIAL.BOMB);
  board.setSpecialFrozen(0, 3, true);
  board.markSpecialUsed(SPECIAL.BOMB);
  board.markSpecialUsed(SPECIAL.STRIPE_V);
  board.markSpecialUsed(SPECIAL.RAINBOW);
  assert.ok(board.allSpecialCategoriesUsed(), '三类都应标记为已使用');

  // 触发一次普通三连，让结算流程走到“轮次结束”检查
  const res = resolveCascade(board, { rng: rng(5) });
  assert.ok(res.sequence.length >= 1, '三连应正常结算');
  assert.ok(board.usedSpecialTypes.size === 0, '一轮结束后使用记录应清空');
  assert.ok(!board.isSpecialFrozen(0, 3), '轮次结束后冰冻炸弹应解冻');
});

