/**
 * 可注入种子的随机源（IF-I-05）。
 *
 * 直接使用 Math.random 会带来两个问题：单元测试无法复现棋盘，
 * 后续若要做每日挑战也无法保证同一日期生成同一棋盘。这里统一封装
 * mulberry32 伪随机算法，允许通过 seed 复现整条随机序列。
 */
export class RandomSource {
  constructor(seed = null) {
    this.seed = seed == null ? RandomSource.randomSeed() : seed >>> 0;
    this._state = this.seed;
  }

  static randomSeed() {
    return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  }

  /** 由字符串派生稳定种子，例如日期 '2026-10-19' */
  static fromString(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  reset(seed) {
    if (seed != null) this.seed = seed >>> 0;
    this._state = this.seed;
  }

  /** 返回 [0, 1) 的浮点数 */
  next() {
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 返回 [0, max) 的整数 */
  int(max) {
    return Math.floor(this.next() * max);
  }

  pick(list) {
    if (!list.length) return undefined;
    return list[this.int(list.length)];
  }

  /** Fisher–Yates 原地洗牌 */
  shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = this.int(i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
}
