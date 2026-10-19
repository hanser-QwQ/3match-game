/**
 * M10 存档服务 StorageService（基础设施层）
 *
 * 存档结构与需求文档第 7.3 节一致，当前 saveVersion 为 2：
 *   player / progress / boosters / settings / interruptedSession / localBest
 * 写入采用"整体覆盖 + 版本号"，避免部分字段写入造成不一致。
 *
 * 失败路径（FR-07 / NFR-14 / AC-11、AC-35）：
 *   写入失败 → 提示玩家并切换为内存存档，界面标注进度可能不被保存，绝不静默失败；
 *   存档损坏 → 保留原始副本到 <key>.corrupt，以初始存档启动，不清空不覆盖。
 */

import { EVENTS } from '../core/events.js';
import { SAVE_KEY, SAVE_VERSION } from '../core/constants.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function localISO(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

export function defaultSettings() {
  return {
    soundEnabled: true,
    volume: 50,
    colorBlindEnhanced: false,
    reducedMotion: false,
    showGrid: true,
    showCursor: true,
  };
}

export function createDefaultSave() {
  const now = localISO();
  return {
    savedAt: now,
    saveVersion: SAVE_VERSION,
    player: { nickname: '玩家', totalScore: 0, createdAt: now },
    progress: {},
    boosters: { shuffle: 1, hammer: 1, addMoves: 0 },
    settings: defaultSettings(),
    tutorialDone: false,
    interruptedSession: null,
    localBest: [],
    // 扩展字段：一次性奖励的发放标记，避免同一奖励重复发放
    flags: { addMovesRewarded: false },
  };
}

/** 版本 1 → 版本 2（第 7.4 节迁移规则的逐条实现） */
export function migrateV1(data) {
  const base = createDefaultSave();
  const progress = {};
  const localBest = [];
  let total = 0;

  for (const [id, lv] of Object.entries(data.levels || {})) {
    const stars = clamp(Number(lv?.stars) || 0, 0, 3);
    const highScore = Math.max(0, Number(lv?.highScore) || 0);
    progress[id] = {
      unlocked: true,
      cleared: stars > 0,
      stars,
      highScore,
      clearedAt: lv?.clearedAt ?? null,
    };
    total += highScore;
    if (stars > 0) localBest.push({ levelId: Number(id), score: highScore, stars, clearedAt: lv?.clearedAt ?? null });
  }

  const volume = data.settings?.volume;
  return {
    ...base,
    player: { nickname: '玩家', totalScore: total, createdAt: base.player.createdAt },
    progress,
    boosters: { ...base.boosters, ...(data.boosters || {}) },
    settings: {
      ...base.settings,
      soundEnabled: data.settings?.soundEnabled !== false,
      volume: typeof volume === 'number' ? Math.round(volume * 100) : 50,
    },
    localBest: localBest.sort((a, b) => a.levelId - b.levelId),
    saveVersion: 2,
  };
}

/** 补齐缺省字段并夹紧取值范围；只做结构兜底，不猜测业务语义 */
export function normalizeSave(input) {
  const base = createDefaultSave();
  const data = input && typeof input === 'object' ? input : {};
  const settings = { ...base.settings, ...(data.settings || {}) };

  const progress = {};
  for (const [id, lv] of Object.entries(data.progress || {})) {
    if (!/^\d+$/.test(id) || !lv) continue;
    progress[id] = {
      unlocked: Boolean(lv.unlocked),
      cleared: Boolean(lv.cleared),
      stars: clamp(Number(lv.stars) || 0, 0, 3),
      highScore: Math.max(0, Number(lv.highScore) || 0),
      clearedAt: lv.clearedAt ?? null,
    };
  }
  progress['1'] = { ...(progress['1'] || { cleared: false, stars: 0, highScore: 0, clearedAt: null }), unlocked: true };
  // 解锁链：第 n 关由第 n−1 关的 cleared 决定
  const ids = Object.keys(progress).map(Number).sort((a, b) => a - b);
  for (const id of ids) {
    if (id === 1) continue;
    if (progress[id - 1]?.cleared) progress[id].unlocked = true;
  }

  return {
    savedAt: data.savedAt || base.savedAt,
    saveVersion: SAVE_VERSION,
    player: {
      nickname: typeof data.player?.nickname === 'string' && data.player.nickname ? data.player.nickname.slice(0, 12) : base.player.nickname,
      totalScore: Math.max(0, Number(data.player?.totalScore) || 0),
      createdAt: data.player?.createdAt || base.player.createdAt,
    },
    progress,
    boosters: {
      shuffle: Math.max(0, Number(data.boosters?.shuffle) || 0),
      hammer: Math.max(0, Number(data.boosters?.hammer) || 0),
      addMoves: Math.max(0, Number(data.boosters?.addMoves) || 0),
    },
    settings: {
      soundEnabled: settings.soundEnabled !== false,
      volume: clamp(Number(settings.volume) || 0, 0, 100),
      colorBlindEnhanced: Boolean(settings.colorBlindEnhanced),
      reducedMotion: Boolean(settings.reducedMotion),
      showGrid: settings.showGrid !== false,
      showCursor: settings.showCursor !== false,
    },
    tutorialDone: Boolean(data.tutorialDone),
    interruptedSession: data.interruptedSession && typeof data.interruptedSession === 'object' ? data.interruptedSession : null,
    localBest: Array.isArray(data.localBest) ? data.localBest.filter((x) => x && Number.isInteger(x.levelId)) : [],
    flags: { addMovesRewarded: Boolean(data.flags?.addMovesRewarded) },
  };
}

export class StorageService {
  constructor({ bus = null, key = SAVE_KEY } = {}) {
    this.bus = bus;
    this.key = key;
    this.degraded = false;
    this.memory = null;
    this.lastReadState = 'empty';
    this.available = this.probe();
  }

  probe() {
    try {
      const probeKey = `${this.key}.probe`;
      localStorage.setItem(probeKey, '1');
      localStorage.removeItem(probeKey);
      return true;
    } catch {
      return false;
    }
  }

  degrade(reason) {
    if (this.degraded) return;
    this.degraded = true;
    this.bus?.emit(EVENTS.SAVE_FAILED, { reason, message: '进度可能不会被保存' });
    this.bus?.emit(EVENTS.STORAGE_DEGRADED, { reason });
  }

  read() {
    if (!this.available) {
      this.degrade('STORAGE_UNAVAILABLE');
      return null;
    }
    let raw = null;
    try {
      raw = localStorage.getItem(this.key);
    } catch (err) {
      this.degrade('STORAGE_UNAVAILABLE');
      return null;
    }
    if (!raw) {
      this.lastReadState = 'empty';
      return null;
    }
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || !Number(data.saveVersion)) throw new Error('BAD_SHAPE');
      let next = data;
      if (Number(data.saveVersion) < SAVE_VERSION) {
        next = migrateV1(data);
        const result = this.write(next);
        if (!result.ok) throw new Error('MIGRATION_WRITE_FAILED');
      }
      this.lastReadState = 'ok';
      return normalizeSave(next);
    } catch (err) {
      // 保留损坏副本供排查，不静默清空
      try {
        localStorage.setItem(`${this.key}.corrupt`, raw);
      } catch {
        /* 副本写入失败不影响主流程 */
      }
      this.lastReadState = 'corrupt';
      this.bus?.emit(EVENTS.TOAST, { type: 'warn', text: '存档读取失败，已保留原始副本并以新进度开始' });
      return null;
    }
  }

  write(snapshot) {
    const payload = { ...snapshot, saveVersion: SAVE_VERSION, savedAt: localISO() };
    const text = JSON.stringify(payload);
    if (text.length > 64 * 1024) {
      // 存档上限按 64 KB 设计，超出说明中断会话快照异常
      console.warn('[storage] 存档超过 64 KB', text.length);
    }
    if (!this.available || this.degraded) {
      this.memory = payload;
      return { ok: false, degraded: true, error: 'STORAGE_UNAVAILABLE' };
    }
    try {
      localStorage.setItem(this.key, text);
      this.memory = payload;
      return { ok: true, size: text.length };
    } catch (err) {
      // 配额不足时清理可放弃的副本后重试一次
      try {
        localStorage.removeItem(`${this.key}.corrupt`);
        localStorage.setItem(this.key, text);
        this.memory = payload;
        return { ok: true, size: text.length, recovered: true };
      } catch {
        this.degrade(err?.name === 'QuotaExceededError' ? 'STORAGE_QUOTA_EXCEEDED' : 'STORAGE_UNAVAILABLE');
        this.memory = payload;
        return { ok: false, degraded: true, error: err?.name || 'WRITE_FAILED' };
      }
    }
  }

  clear() {
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* ignore */
    }
    this.memory = null;
  }
}
