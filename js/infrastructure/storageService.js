/**
 * M10 存档服务 StorageService（基础设施层）
 *
 * 存档结构与需求文档第 7.3 节一致，当前 saveVersion 为 2：
 *   player / progress / settings / interruptedSession / localBest / achievements
 * achievements 是向后兼容的附加字段，旧存档读取时补成空表。
 * 道具不再有跨关库存，每局所选道具共用 2 次，计数只存在于会话快照中。
 * 写入采用"整体覆盖 + 版本号"，避免部分字段写入造成不一致。
 *
 * 失败路径（FR-07 / NFR-14 / AC-11、AC-35）：
 *   写入失败 → 提示玩家并切换为内存存档，界面标注进度可能不被保存，绝不静默失败；
 *   存档损坏 → 保留原始副本到 <key>.corrupt，以初始存档启动，不清空不覆盖。
 */

import { EVENTS } from '../core/events.js';
import {
  SAVE_KEY,
  SAVE_VERSION,
  BOOSTERS,
  BOOSTER_LOADOUT_LIMIT,
  DEFAULT_BOOSTER_LOADOUT,
  ELEMENTS,
} from '../core/constants.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function normalizeBoosterLoadout(list) {
  const out = [];
  for (const id of Array.isArray(list) ? list : []) {
    if (!BOOSTERS[id] || out.includes(id)) continue;
    out.push(id);
    if (out.length >= BOOSTER_LOADOUT_LIMIT) break;
  }
  return out;
}

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
    themeMode: 'auto',
    bgHue: 36,
    plainBg: false,
  };
}

export function createCareerStats() {
  return {
    maxChain: 0,
    specials: { stripe_h: 0, stripe_v: 0, bomb: 0, rainbow: 0 },
    boosterUses: Object.fromEntries(Object.keys(BOOSTERS).map((id) => [id, 0])),
    tileClears: Object.fromEntries(ELEMENTS.map((_, index) => [String(index), 0])),
  };
}

function normalizeCareer(input) {
  const base = createCareerStats();
  if (!input || typeof input !== 'object') return base;

  const maxChain = Math.max(0, Math.floor(Number(input.maxChain) || 0));
  const specials = { ...base.specials };
  for (const id of Object.keys(specials)) {
    specials[id] = Math.max(0, Math.floor(Number(input.specials?.[id]) || 0));
  }
  const boosterUses = { ...base.boosterUses };
  for (const id of Object.keys(boosterUses)) {
    boosterUses[id] = Math.max(0, Math.floor(Number(input.boosterUses?.[id]) || 0));
  }
  const tileClears = { ...base.tileClears };
  for (const id of Object.keys(tileClears)) {
    tileClears[id] = Math.max(0, Math.floor(Number(input.tileClears?.[id]) || 0));
  }
  return { maxChain, specials, boosterUses, tileClears };
}

export function createDefaultSave() {
  const now = localISO();
  return {
    savedAt: now,
    saveVersion: SAVE_VERSION,
    player: { nickname: '玩家', totalScore: 0, createdAt: now },
    progress: {},
    settings: defaultSettings(),
    boosterLoadout: [...DEFAULT_BOOSTER_LOADOUT],
    career: createCareerStats(),
    tutorialDone: false,
    interruptedSession: null,
    localBest: [],
    achievements: {},
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
    // 第 4 颗星必须来自单独的突袭通关记录，不能从历史星级反推
    const raidCleared = Boolean(lv.raidCleared);
    const rawStars = clamp(Number(lv.stars) || 0, 0, 4);
    const stars = raidCleared ? 4 : Math.min(3, rawStars);
    progress[id] = {
      unlocked: Boolean(lv.unlocked),
      cleared: Boolean(lv.cleared) || stars > 0,
      stars,
      raidCleared,
      highScore: Math.max(0, Number(lv.highScore) || 0),
      clearedAt: lv.clearedAt ?? null,
    };
  }
  progress['1'] = {
    ...(progress['1'] || { cleared: false, stars: 0, raidCleared: false, highScore: 0, clearedAt: null }),
    unlocked: true,
  };
  // 解锁链：第 n 关由第 n−1 关的 cleared 决定
  const ids = Object.keys(progress).map(Number).sort((a, b) => a - b);
  for (const id of ids) {
    if (id === 1) continue;
    if (progress[id - 1]?.cleared) progress[id].unlocked = true;
  }

  // 成就记录是附加字段：只保留结构合法的条目，旧存档缺省为空表
  const achievements = {};
  for (const [id, item] of Object.entries(data.achievements || {})) {
    if (!id || id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
    if (!item || typeof item !== 'object') continue;
    achievements[id] = {
      unlockedAt: typeof item.unlockedAt === 'string' ? item.unlockedAt : null,
      seen: Boolean(item.seen),
    };
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
    settings: {
      soundEnabled: settings.soundEnabled !== false,
      volume: clamp(Number(settings.volume) || 0, 0, 100),
      colorBlindEnhanced: Boolean(settings.colorBlindEnhanced),
      reducedMotion: Boolean(settings.reducedMotion),
      showGrid: settings.showGrid !== false,
      showCursor: settings.showCursor !== false,
      themeMode: ['auto', 'light', 'dark'].includes(settings.themeMode) ? settings.themeMode : 'auto',
      bgHue: (() => {
        const hue = Number(settings.bgHue);
        return Number.isFinite(hue) ? clamp(hue, 0, 360) : 36;
      })(),
      plainBg: Boolean(settings.plainBg),
    },
    boosterLoadout: Array.isArray(data.boosterLoadout)
      ? normalizeBoosterLoadout(data.boosterLoadout)
      : [...DEFAULT_BOOSTER_LOADOUT],
    // 生涯统计从本版本开始记录；旧存档没有 career 时补零，不做历史反推
    career: normalizeCareer(data.career),
    tutorialDone: Boolean(data.tutorialDone),
    interruptedSession: data.interruptedSession && typeof data.interruptedSession === 'object' ? data.interruptedSession : null,
    localBest: Array.isArray(data.localBest)
      ? data.localBest
        .filter((x) => x && Number.isInteger(x.levelId))
        .map((item) => {
          const raidCleared = Boolean(progress[String(item.levelId)]?.raidCleared);
          return {
            ...item,
            stars: raidCleared ? 4 : Math.min(3, Math.max(0, Number(item.stars) || 0)),
          };
        })
      : [],
    achievements,
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
