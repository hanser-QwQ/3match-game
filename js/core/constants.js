/**
 * 全局常量与元素定义。
 *
 * 元素在颜色之外必须携带形状标识（NFR-10），因此每种元素同时定义
 * color（填充色）、dark（描边色）与 shape（形状标识）三项。
 */

export const ROWS = 8;
export const COLS = 8;

/** 基础元素种类上限，关卡可配置使用其中 4 至 6 种 */
export const ELEMENT_TYPES = 6;

/** 元素定义：顺序即 type 取值 0..5 */
export const ELEMENTS = [
  { key: 'rose', name: '玫红圆珠', color: '#e8557f', dark: '#a82a4d', shape: 'circle' },
  { key: 'azure', name: '深蓝方块', color: '#3f78d0', dark: '#1f4787', shape: 'square' },
  { key: 'leaf', name: '翠绿三角', color: '#2f9e6f', dark: '#186b48', shape: 'triangle' },
  { key: 'amber', name: '琥珀菱片', color: '#e2a520', dark: '#a06f05', shape: 'diamond' },
  { key: 'violet', name: '紫罗兰星', color: '#8b63d6', dark: '#57379b', shape: 'star' },
  { key: 'teal', name: '青碧六边', color: '#17a3b8', dark: '#0a6c7c', shape: 'hexagon' },
];

/** 特殊元素类型 */
export const SPECIAL = {
  STRIPE_H: 'stripe_h',
  STRIPE_V: 'stripe_v',
  RAINBOW: 'rainbow',
  BOMB: 'bomb',
};

/** 计分规则（FR-06） */
export const SCORE = {
  PER_TILE: 10,
  SPECIAL_BONUS: 50,
  CLEAR_BONUS_PER_MOVE: 100,
  MAX_MULTIPLIER: 3,
};

/** 道具定义（FR-12） */
export const BOOSTERS = {
  shuffle: { id: 'shuffle', name: '洗牌', icon: 'shuffle', desc: '重排整个棋盘' },
  hammer: { id: 'hammer', name: '锤子', icon: 'hammer', desc: '敲掉任意一个元素', target: true },
  addMoves: { id: 'addMoves', name: '加三步', icon: 'plus', desc: '本关剩余步数 +3' },
  rainbow: { id: 'rainbow', name: '彩虹', icon: 'rainbow', desc: '把一个元素变成彩虹', target: true },
  bomb: { id: 'bomb', name: '炸弹', icon: 'bomb', desc: '把一个元素变成炸弹', target: true },
  icePick: { id: 'icePick', name: '破冰', icon: 'ice', desc: '削减 3×3 范围内的冰层', target: true },
};

/** 每局所选道具共用的使用次数（不是每种各 2 次） */
export const BOOSTER_TOTAL_LIMIT = 2;

/** 每局最多携带的道具数量 */
export const BOOSTER_LOADOUT_LIMIT = 3;

/** 老存档与默认配置：沿用原来的三件套 */
export const DEFAULT_BOOSTER_LOADOUT = ['shuffle', 'hammer', 'addMoves'];

/** 会话状态（TB-03） */
export const SESSION_STATE = {
  IN_PROGRESS: 'in_progress',
  PAUSED: 'paused',
  RESOLVED: 'resolved',
};

/** 场景标识（M16） */
export const SCENE = {
  HOME: 'home',
  LEVELS: 'levels',
  GAME: 'game',
  RESULT: 'result',
  BOOSTERS: 'boosters',
  SETTINGS: 'settings',
  RANK: 'rank',
  ACHIEVEMENTS: 'achievements',
  RULES: 'rules',
  NOTICE: 'notice',
};

/** 存档键与版本（FR-07 / 第 7.4 节） */
export const SAVE_KEY = 'match3.save.v2';
export const SAVE_VERSION = 2;

/** 目标类型（第 5.4 节） */
export const GOAL = {
  SCORE: 'score',
  COLLECT: 'collect',
  CLEAR_ICE: 'clear_ice',
  COMBO: 'combo',
};

/** 连锁倍率：第 s 段 1 + 0.5 × (s − 1)，封顶 3 倍 */
export function chainMultiplier(chainIndex, maxMultiplier = SCORE.MAX_MULTIPLIER) {
  const cap = Number.isFinite(maxMultiplier) && maxMultiplier >= 1 ? maxMultiplier : SCORE.MAX_MULTIPLIER;
  return Math.min(1 + 0.5 * (chainIndex - 1), cap);
}
