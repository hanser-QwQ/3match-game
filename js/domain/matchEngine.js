/**
 * M02 匹配引擎 MatchEngine（领域层，零浏览器依赖）
 *
 * 三个职责：
 *   1. 扫描横向 / 纵向三个及以上的同色连线（findMatches）
 *   2. 在临时棋盘上做虚拟交换，判定一次交换是否可行（isValidSwap）
 *   3. 由连线形状推导特殊元素的生成位置与类型（planSpecials）
 *
 * 本模块不持有可变状态，输入棋盘快照，输出匹配集合或布尔判定。
 */

import { SPECIAL } from '../core/constants.js';

export const key = (r, c) => `${r},${c}`;
export const parseKey = (k) => {
  const [r, c] = k.split(',').map(Number);
  return { r, c };
};

export function isAdjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

/**
 * 扫描全盘连线。
 * @returns {{cells:{r:number,c:number}[], dir:'row'|'col', type:number, length:number}[]}
 */
export function findMatches(board) {
  const matches = [];

  // 横向
  for (let r = 0; r < board.rows; r += 1) {
    let c = 0;
    while (c < board.cols) {
      if (!board.isMatchable(r, c)) {
        c += 1;
        continue;
      }
      const type = board.typeAt(r, c);
      let end = c + 1;
      while (end < board.cols && board.isMatchable(r, end) && board.typeAt(r, end) === type) end += 1;
      const length = end - c;
      if (length >= 3) {
        const cells = [];
        for (let k = c; k < end; k += 1) cells.push({ r, c: k });
        matches.push({ cells, dir: 'row', type, length });
      }
      c = end;
    }
  }

  // 纵向
  for (let c = 0; c < board.cols; c += 1) {
    let r = 0;
    while (r < board.rows) {
      if (!board.isMatchable(r, c)) {
        r += 1;
        continue;
      }
      const type = board.typeAt(r, c);
      let end = r + 1;
      while (end < board.rows && board.isMatchable(end, c) && board.typeAt(end, c) === type) end += 1;
      const length = end - r;
      if (length >= 3) {
        const cells = [];
        for (let k = r; k < end; k += 1) cells.push({ r: k, c });
        matches.push({ cells, dir: 'col', type, length });
      }
      r = end;
    }
  }

  return matches;
}

/** 判断经过 (r,c) 的横纵方向是否已构成三连及以上 */
export function hasMatchAt(board, r, c) {
  if (!board.isMatchable(r, c)) return false;
  const type = board.typeAt(r, c);

  let count = 1;
  for (let k = c - 1; k >= 0 && board.isMatchable(r, k) && board.typeAt(r, k) === type; k -= 1) count += 1;
  for (let k = c + 1; k < board.cols && board.isMatchable(r, k) && board.typeAt(r, k) === type; k += 1) count += 1;
  if (count >= 3) return true;

  count = 1;
  for (let k = r - 1; k >= 0 && board.isMatchable(k, c) && board.typeAt(k, c) === type; k -= 1) count += 1;
  for (let k = r + 1; k < board.rows && board.isMatchable(k, c) && board.typeAt(k, c) === type; k += 1) count += 1;
  return count >= 3;
}

/**
 * 判定一次相邻交换是否可行。
 * 交换只涉及类型与特殊标识；冰块格与不可用格不参与。
 */
export function isValidSwap(board, a, b) {
  if (!isAdjacent(a, b)) return false;
  if (!board.isFree(a.r, a.c) || !board.isFree(b.r, b.c)) return false;

  board.swap(a, b);
  const ok = hasMatchAt(board, a.r, a.c) || hasMatchAt(board, b.r, b.c);
  board.swap(a, b);
  return ok;
}

/** 并查集合并相互交叉的连线（L 形 / T 形由此识别） */
function groupMatches(matches) {
  const parent = matches.map((_, i) => i);
  const find = (x) => {
    let p = x;
    while (parent[p] !== p) p = parent[p];
    while (parent[x] !== p) {
      const next = parent[x];
      parent[x] = p;
      x = next;
    }
    return p;
  };
  const union = (x, y) => {
    const px = find(x);
    const py = find(y);
    if (px !== py) parent[py] = px;
  };

  const owner = new Map();
  matches.forEach((m, i) => {
    for (const cell of m.cells) {
      const k = key(cell.r, cell.c);
      if (owner.has(k)) union(i, owner.get(k));
      else owner.set(k, i);
    }
  });

  const groups = new Map();
  matches.forEach((m, i) => {
    const root = find(i);
    if (!groups.has(root)) {
      groups.set(root, { cells: new Map(), hasRow: false, hasCol: false, maxLen: 0, longest: null });
    }
    const g = groups.get(root);
    for (const cell of m.cells) g.cells.set(key(cell.r, cell.c), cell);
    if (m.dir === 'row') g.hasRow = true;
    else g.hasCol = true;
    if (m.length > g.maxLen) {
      g.maxLen = m.length;
      g.longest = m;
    }
  });

  return [...groups.values()];
}

/**
 * 由连线形状推导特殊元素（第 5.3 节）。
 *
 *   交叉形（L 形 / T 形，五格起）→ 炸弹，落在交叉点
 *   直线五连 → 彩虹
 *   直线四连 → 条纹，方向由连线方向决定
 *
 * @param preferred 玩家本次交换涉及的格子，优先作为特殊元素落点
 */
export function planSpecials(board, matches, preferred = []) {
  if (!matches.length) return [];
  const preferredKeys = new Set(preferred.map((p) => key(p.r, p.c)));
  const plans = [];

  for (const group of groupMatches(matches)) {
    let special = null;
    if (group.hasRow && group.hasCol) special = SPECIAL.BOMB;
    else if (group.maxLen >= 5) special = SPECIAL.RAINBOW;
    else if (group.maxLen === 4) special = group.longest.dir === 'row' ? SPECIAL.STRIPE_H : SPECIAL.STRIPE_V;
    if (!special) continue;

    /*
     * 落点必须是"还没有特殊元素"的普通格。
     * 因为落点会被排除在本次消除之外（它要原地变成新的特殊元素），
     * 如果落在已有的条纹 / 彩虹 / 炸弹上，那颗特殊元素既不会被消除，
     * 也不会触发自己的效果——表现出来就是"消掉条纹后它没炸，图案还留在原地"。
     */
    const cells = [...group.cells.values()];
    const plain = cells.filter((cell) => board.specialAt(cell.r, cell.c) === null);
    if (!plain.length) continue; // 整组都是特殊元素：让它们全部触发，不再生成新的
    const isPlain = (p) => plain.some((cell) => cell.r === p.r && cell.c === p.c);

    let target = plain.find((cell) => preferredKeys.has(key(cell.r, cell.c)));

    if (!target && special === SPECIAL.BOMB) {
      // 交叉点：同时出现在横线与竖线中的格子
      const hitCount = new Map();
      for (const m of matches) {
        if (!group.cells.has(key(m.cells[0].r, m.cells[0].c))) continue;
        for (const cell of m.cells) {
          const k = key(cell.r, cell.c);
          hitCount.set(k, (hitCount.get(k) || 0) + 1);
        }
      }
      const cross = [...hitCount.entries()].filter(([, n]) => n > 1).map(([k]) => parseKey(k));
      const crossPlain = cross.find(isPlain);
      if (crossPlain) target = crossPlain;
    }
    if (!target) {
      const m = group.longest;
      const plainInLongest = m.cells.filter(isPlain);
      target = plainInLongest[Math.floor(plainInLongest.length / 2)] || plain[0];
    }
    plans.push({ r: target.r, c: target.c, special, type: group.longest.type });
  }

  return plans;
}

/**
 * 特殊元素交换（FR-13）。
 *
 * 必须在物理交换之前调用：彩虹需要读取"被交换对象"的颜色，
 * 交换之后该颜色会随类型一起被换走。
 *
 * @returns {{cells:{r,c}[], combo:string}|null} cells 作为首轮清除的种子
 */
export function planSpecialSwap(board, a, b, rng) {
  const sa = board.specialAt(a.r, a.c);
  const sb = board.specialAt(b.r, b.c);
  if (!sa && !sb) return null;

  const rainbowA = sa === SPECIAL.RAINBOW;
  const rainbowB = sb === SPECIAL.RAINBOW;

  if (rainbowA || rainbowB) {
    const rainbowCell = rainbowA ? a : b;
    const otherCell = rainbowA ? b : a;
    const otherSpecial = rainbowA ? sb : sa;
    const seeds = [{ r: rainbowCell.r, c: rainbowCell.c }];

    if (otherSpecial === SPECIAL.RAINBOW) {
      board.eachCell((r, c) => {
        if (board.isMatchable(r, c) || board.specialAt(r, c)) {
          if (board.typeAt(r, c) >= 0 && board.iceAt(r, c) === 0) seeds.push({ r, c });
        }
      });
      return { cells: seeds, combo: 'rainbow+rainbow' };
    }

    const targetType = board.typeAt(otherCell.r, otherCell.c);
    if (targetType < 0) return { cells: seeds, combo: 'rainbow' };
    seeds.push({ r: otherCell.r, c: otherCell.c });

    // 彩虹 + 炸弹：炸弹没有颜色，改为以炸弹为中心清 5×5
    if (otherSpecial === SPECIAL.BOMB) {
      for (let rr = otherCell.r - 2; rr <= otherCell.r + 2; rr += 1) {
        for (let cc = otherCell.c - 2; cc <= otherCell.c + 2; cc += 1) {
          if (board.inside(rr, cc) && !board.isBlocked(rr, cc)) seeds.push({ r: rr, c: cc });
        }
      }
      return { cells: seeds, combo: 'rainbow+bomb' };
    }

    const sameType = [];
    board.eachCell((r, c) => {
      if (c === otherCell.c && r === otherCell.r) return;
      if (board.iceAt(r, c) === 0 && board.typeAt(r, c) === targetType) sameType.push({ r, c });
    });

    if (otherSpecial === SPECIAL.STRIPE_H || otherSpecial === SPECIAL.STRIPE_V) {
      // 彩虹 + 条纹：把全部同色元素转为条纹再一起清除
      sameType.forEach((cell, i) => {
        board.setType(cell.r, cell.c, targetType, i % 2 === 0 ? SPECIAL.STRIPE_H : SPECIAL.STRIPE_V);
        seeds.push(cell);
      });
      return { cells: seeds, combo: 'rainbow+stripe' };
    }

    for (const cell of sameType) seeds.push(cell);
    return { cells: seeds, combo: 'rainbow+normal' };
  }

  if (sa && sb) {
    // 条纹 + 条纹：整行与整列；炸弹 + 炸弹：两块 3×3 叠加；炸弹 + 条纹：3×3 加一整行
    return { cells: [{ r: a.r, c: a.c }, { r: b.r, c: b.c }], combo: `${sa}+${sb}` };
  }

  /*
   * 炸弹没有颜色，无法通过"凑三连"触发，因此与任意相邻元素交换即引爆。
   * 这也是它和条纹、彩虹的区别：后两者仍然靠颜色参与匹配。
   */
  if (sa === SPECIAL.BOMB || sb === SPECIAL.BOMB) {
    return { cells: [{ r: a.r, c: a.c }, { r: b.r, c: b.c }], combo: 'bomb' };
  }

  return null;
}

/** 某个特殊元素触发时波及的格子（不含自身） */
export function blastCells(board, r, c, special) {
  const out = [];
  const push = (rr, cc) => {
    if (board.inside(rr, cc) && !board.isBlocked(rr, cc)) out.push({ r: rr, c: cc });
  };
  switch (special) {
    case SPECIAL.STRIPE_H:
      for (let cc = 0; cc < board.cols; cc += 1) if (cc !== c) push(r, cc);
      break;
    case SPECIAL.STRIPE_V:
      for (let rr = 0; rr < board.rows; rr += 1) if (rr !== r) push(rr, c);
      break;
    case SPECIAL.BOMB:
      // 曼哈顿距离 ≤ 2 的菱形范围：以自身为中心共 13 格（横纵坐标之和不超过 2）
      for (let dr = -2; dr <= 2; dr += 1) {
        const span = 2 - Math.abs(dr);
        for (let dc = -span; dc <= span; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          push(r + dr, c + dc);
        }
      }
      break;
    case SPECIAL.RAINBOW: {
      // 被卷入爆炸的彩虹：清除棋盘上数量最多的一种元素
      const counts = new Map();
      board.eachCell((rr, cc) => {
        if (board.isMatchable(rr, cc)) {
          const t = board.typeAt(rr, cc);
          counts.set(t, (counts.get(t) || 0) + 1);
        }
      });
      let best = -1;
      let bestCount = -1;
      for (const [t, n] of counts) {
        if (n > bestCount) {
          best = t;
          bestCount = n;
        }
      }
      if (best >= 0) {
        board.eachCell((rr, cc) => {
          if (board.typeAt(rr, cc) === best && !(rr === r && cc === c)) push(rr, cc);
        });
      }
      break;
    }
    default:
      break;
  }
  return out;
}
