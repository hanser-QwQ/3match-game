/**
 * M01 棋盘模型 Board（领域层，零浏览器依赖）
 *
 * 内部用三组平行数组表示 64 个格子，而不是对象数组：
 *   types    元素类型，-1 表示空格（已被消除 / 不可用格）
 *   specials 特殊元素标识，null 表示普通元素
 *   ice      冰块剩余耐久，0 表示无冰
 *   blocked  不可用格，1 表示永远为空、不参与下落与匹配
 *
 * 本模块只保证数据结构合法与一致，不做匹配判定，也不决定消除哪些格子。
 */

const SPECIAL_NONE = null;

export class Board {
  constructor(rows = 8, cols = 8, elementTypes = 6) {
    this.rows = rows;
    this.cols = cols;
    this.elementTypes = elementTypes;
    const n = rows * cols;
    this.types = new Int8Array(n).fill(-1);
    this.specials = new Array(n).fill(SPECIAL_NONE);
    this.ice = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
  }

  idx(r, c) {
    return r * this.cols + c;
  }

  inside(r, c) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  isBlocked(r, c) {
    return !this.inside(r, c) || this.blocked[this.idx(r, c)] === 1;
  }

  /** 可见且可下落的格子：不在不可用格，且没有被冰封住 */
  isFree(r, c) {
    if (!this.inside(r, c)) return false;
    const i = this.idx(r, c);
    return this.blocked[i] === 0 && this.ice[i] === 0;
  }

  /** 是否可以被匹配：必须有元素；彩虹与炸弹没有颜色，不参与颜色匹配 */
  isMatchable(r, c) {
    if (!this.isFree(r, c)) return false;
    const i = this.idx(r, c);
    if (this.types[i] < 0) return false;
    const sp = this.specials[i];
    return sp !== 'rainbow' && sp !== 'bomb';
  }

  typeAt(r, c) {
    return this.inside(r, c) ? this.types[this.idx(r, c)] : -1;
  }

  specialAt(r, c) {
    return this.inside(r, c) ? this.specials[this.idx(r, c)] : SPECIAL_NONE;
  }

  iceAt(r, c) {
    return this.inside(r, c) ? this.ice[this.idx(r, c)] : 0;
  }

  setIce(r, c, value) {
    if (!this.inside(r, c)) return;
    this.ice[this.idx(r, c)] = Math.max(0, value);
  }

  setType(r, c, type, special = SPECIAL_NONE) {
    if (!this.inside(r, c)) return;
    const i = this.idx(r, c);
    this.types[i] = type;
    this.specials[i] = type < 0 ? SPECIAL_NONE : special;
  }

  /** 清空一个格子（消除），返回被清除的元素类型，供收集目标统计 */
  clearCell(r, c) {
    if (!this.inside(r, c)) return -1;
    const i = this.idx(r, c);
    const type = this.types[i];
    this.types[i] = -1;
    this.specials[i] = SPECIAL_NONE;
    return type;
  }

  /** 交换两个格子的元素与特殊标识（冰块与不可用格不参与交换，由调用方保证） */
  swap(a, b) {
    const i = this.idx(a.r, a.c);
    const j = this.idx(b.r, b.c);
    [this.types[i], this.types[j]] = [this.types[j], this.types[i]];
    [this.specials[i], this.specials[j]] = [this.specials[j], this.specials[i]];
  }

  countIce() {
    let n = 0;
    for (let i = 0; i < this.ice.length; i += 1) if (this.ice[i] > 0) n += 1;
    return n;
  }

  countTiles() {
    let n = 0;
    for (let i = 0; i < this.types.length; i += 1) if (this.types[i] >= 0) n += 1;
    return n;
  }

  clone() {
    const copy = new Board(this.rows, this.cols, this.elementTypes);
    copy.types.set(this.types);
    copy.specials = this.specials.slice();
    copy.ice.set(this.ice);
    copy.blocked.set(this.blocked);
    return copy;
  }

  eachCell(fn) {
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) fn(r, c, this.idx(r, c));
    }
  }

  /**
   * 下落与补充（第 5.2 节）。
   *
   * 以"自由格连续段"为单位处理：不可用格与冰块把一列切成若干段，
   * 每段独立下落、独立从段顶补充。这样冰块既不会移动，也不会被穿过。
   * 返回新建的元素位置，供动画区分"原有元素"与"新补充元素"。
   */
  applyGravityAndRefill(rng) {
    const created = [];
    for (let c = 0; c < this.cols; c += 1) {
      let r = this.rows - 1;
      while (r >= 0) {
        if (!this.isFree(r, c)) {
          r -= 1;
          continue;
        }
        let bottom = r;
        let top = r;
        while (top - 1 >= 0 && this.isFree(top - 1, c)) top -= 1;

        // 自下而上收集本段内仍存在的元素
        const stack = [];
        for (let rr = bottom; rr >= top; rr -= 1) {
          const i = this.idx(rr, c);
          if (this.types[i] >= 0) stack.push({ type: this.types[i], special: this.specials[i] });
        }

        // 自下而上回写，剩余位置在段顶补充新元素
        let w = bottom;
        for (const item of stack) {
          this.setType(w, c, item.type, item.special);
          w -= 1;
        }
        while (w >= top) {
          this.setType(w, c, rng.int(this.elementTypes), SPECIAL_NONE);
          created.push({ r: w, c });
          w -= 1;
        }
        r = top - 1;
      }
    }
    return created;
  }

  /** 序列化为存档结构（数值矩阵，便于 JSON 存储与迁移） */
  serialize() {
    const board = [];
    const specials = [];
    const ice = [];
    for (let r = 0; r < this.rows; r += 1) {
      const tRow = [];
      const sRow = [];
      const iRow = [];
      for (let c = 0; c < this.cols; c += 1) {
        const i = this.idx(r, c);
        tRow.push(this.types[i]);
        sRow.push(this.specials[i]);
        iRow.push(this.ice[i]);
      }
      board.push(tRow);
      specials.push(sRow);
      ice.push(iRow);
    }
    return { board, specials, ice };
  }

  /** 从存档结构恢复；字段缺失时按空棋盘处理，由调用方决定是否提示 */
  static deserialize(data, config = {}) {
    const rows = data?.board?.length || config.rows || 8;
    const cols = data?.board?.[0]?.length || config.cols || 8;
    const board = new Board(rows, cols, config.elementTypes || 6);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const i = board.idx(r, c);
        board.types[i] = data.board[r]?.[c] ?? -1;
        board.specials[i] = data.specials?.[r]?.[c] ?? SPECIAL_NONE;
        board.ice[i] = data.ice?.[r]?.[c] ?? 0;
      }
    }
    for (const [r, c] of config.iceCells || []) {
      if (board.inside(r, c) && board.ice[board.idx(r, c)] === 0) {
        board.ice[board.idx(r, c)] = config.iceDurability || 1;
      }
    }
    for (const [r, c] of config.blockedCells || []) {
      if (board.inside(r, c)) {
        board.blocked[board.idx(r, c)] = 1;
        board.types[board.idx(r, c)] = -1;
      }
    }
    return board;
  }
}
