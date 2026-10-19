/**
 * M06 关卡仓库 LevelRepository（基础设施层）
 *
 * 职责：加载关卡 JSON、逐关校验、隔离损坏关卡。
 * 单关校验失败不会导致整体加载失败，该关被标记为 invalid 并在列表上
 * 显示可读提示（NFR-15 / AC-36）。
 *
 * 加载顺序：优先 fetch 静态 JSON（数据驱动，新增关卡不需要改代码）；
 * 在 file:// 或 fetch 不可用的环境下退回内置副本（js/data/levels.embedded.js，
 * 由 tools/build-levels.mjs 从同一份 JSON 生成），保证双击打开也能玩。
 */

import { GOAL, ELEMENTS } from '../core/constants.js';

const VALID_ELEMENT_TYPES = new Set(['score', 'collect', 'clear_ice']);

function isCoord(v, rows, cols) {
  return Array.isArray(v) && v.length === 2 && Number.isInteger(v[0]) && Number.isInteger(v[1])
    && v[0] >= 0 && v[0] < rows && v[1] >= 0 && v[1] < cols;
}

function validateGoal(goal, rows, cols, errors) {
  if (!goal || typeof goal !== 'object') {
    errors.push('goal 缺失');
    return;
  }
  if (goal.type === GOAL.COMBO) {
    if (!goal.primary || !goal.secondary) errors.push('combo 目标缺少 primary 或 secondary');
    else {
      validateGoal(goal.primary, rows, cols, errors);
      validateGoal(goal.secondary, rows, cols, errors);
    }
    return;
  }
  if (!VALID_ELEMENT_TYPES.has(goal.type)) errors.push(`未知目标类型 ${goal.type}`);
  if (!Number.isInteger(goal.amount) || goal.amount <= 0) errors.push('goal.amount 必须是正整数');
  if (goal.type === GOAL.COLLECT && !(Number.isInteger(goal.element) && goal.element >= 0 && goal.element < ELEMENTS.length)) {
    errors.push('收集目标缺少合法的 element');
  }
}

/** 校验单个关卡配置，返回错误列表 */
export function validateLevel(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['关卡数据不是对象'];
  if (!Number.isInteger(data.levelId) || data.levelId <= 0) errors.push('levelId 非法');
  if (typeof data.name !== 'string' || !data.name || data.name.length > 16) errors.push('name 缺失或超过 16 字');

  const board = data.board || {};
  const rows = board.rows;
  const cols = board.cols;
  if (rows !== 8 || cols !== 8) errors.push('棋盘必须为 8 行 8 列');
  if (!Number.isInteger(board.elementTypes) || board.elementTypes < 4 || board.elementTypes > 6) {
    errors.push('elementTypes 必须在 4 至 6 之间');
  }

  const seen = new Set();
  for (const cell of board.iceCells || []) {
    if (!isCoord(cell, rows || 8, cols || 8)) errors.push(`冰块坐标非法 ${JSON.stringify(cell)}`);
    else {
      const k = cell.join(',');
      if (seen.has(k)) errors.push('冰块坐标重复');
      seen.add(k);
    }
  }
  for (const cell of board.blockedCells || []) {
    if (!isCoord(cell, rows || 8, cols || 8)) errors.push(`不可用格坐标非法 ${JSON.stringify(cell)}`);
  }

  validateGoal(data.goal, rows || 8, cols || 8, errors);

  if (!Number.isInteger(data.moves) || data.moves <= 0) errors.push('moves 必须是正整数');
  const t = data.starThresholds;
  if (!Array.isArray(t) || t.length !== 3 || !(t[0] > 0 && t[1] > t[0] && t[2] > t[1])) {
    errors.push('starThresholds 必须是三个严格递增的正整数');
  }
  for (const id of data.disabledBoosters || []) {
    if (!['shuffle', 'hammer', 'addMoves'].includes(id)) errors.push(`未知道具 ${id}`);
  }
  return errors;
}

export class LevelRepository {
  constructor({ basePath = 'levels/', bus = null, embedded = null } = {}) {
    this.basePath = basePath;
    this.bus = bus;
    this.embedded = embedded;
    this.items = new Map();
    this.loaded = false;
    this.source = 'none';
    this.loadError = null;
  }

  async loadAll() {
    if (this.loaded) return this;
    let list = null;
    try {
      list = await this._loadFromNetwork();
      this.source = 'network';
    } catch (err) {
      this.loadError = err;
    }
    if (!list || !list.length) {
      list = await this._loadEmbedded();
      this.source = 'embedded';
    }
    for (const raw of list) {
      const errors = validateLevel(raw);
      const entry = { ...raw, errors, valid: errors.length === 0 };
      if (errors.length) {
        this.bus?.emit('level:invalid', { levelId: raw?.levelId, errors });
      }
      if (raw && Number.isInteger(raw.levelId)) this.items.set(raw.levelId, entry);
    }
    this.loaded = true;
    return this;
  }

  async _loadFromNetwork() {
    if (typeof window !== 'undefined' && window.__M3_STANDALONE__) {
      throw new Error('STANDALONE');
    }
    const indexReq = await fetch(`${this.basePath}index.json`, { cache: 'no-cache' });
    if (!indexReq.ok) throw new Error(`index.json ${indexReq.status}`);
    const index = await indexReq.json();
    // 关卡的增删只需改动 JSON 与索引，不需要改任何逻辑代码（AC-37）
    const ids = Array.isArray(index.levels) ? index.levels.slice() : [];

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`${this.basePath}level-${String(id).padStart(2, '0')}.json`, { cache: 'no-cache' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (err) {
          // 单个文件读取失败只影响该关，不影响其余关卡（NFR-15）
          return { levelId: id, name: `关卡 ${id}`, error: String(err), board: {} };
        }
      })
    );
    return results;
  }

  async _loadEmbedded() {
    if (this.embedded) return this.embedded;
    if (typeof window !== 'undefined' && Array.isArray(window.__M3_EMBEDDED_LEVELS__)) {
      return window.__M3_EMBEDDED_LEVELS__;
    }
    try {
      const mod = await import('../data/levels.embedded.js');
      return mod.LEVELS || [];
    } catch {
      return [];
    }
  }

  get(id) {
    return this.items.get(Number(id)) || null;
  }

  /** 全部关卡（含损坏项），按关卡号排序 */
  list() {
    return [...this.items.values()].sort((a, b) => a.levelId - b.levelId);
  }

  playable() {
    return this.list().filter((lv) => lv.valid);
  }

  maxLevelId() {
    const all = this.playable();
    return all.length ? all[all.length - 1].levelId : 1;
  }

  count() {
    return this.items.size;
  }
}
