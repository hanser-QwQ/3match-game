/**
 * 关卡数据生成器（离线工具，不参与运行时）
 *
 * 用途：按需求文档第 5.5 节难度曲线与表 5-5 星级阈值，批量生成 levels/level-XX.json。
 * 运行：node tools/gen-levels.mjs
 * 说明：生成结果为唯一数据源，游戏运行时只读取 JSON，不读取本脚本。
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../levels');
mkdirSync(outDir, { recursive: true });

/** 表 5-5 与内插：按步数上限换算的星级阈值 */
const STAR_TABLE = {
  25: [2100, 2775, 3450],
  24: [2000, 2680, 3280],
  23: [1950, 2590, 3190],
  22: [1900, 2500, 3100],
  21: [1840, 2410, 3010],
  20: [1780, 2320, 2860],
  19: [1720, 2230, 2740],
  18: [1650, 2140, 2620],
};

/**
 * 1.5.1 平衡调整：下调偏严的星级阈值。
 * 目标与步数保持不变，只放宽评星分数，让完成目标后有更合理的星级回报。
 * 有分数目标的关卡，3 星线仍保持在目标分之上；纯收集 / 破冰关则整体下调。
 */
const STAR_OVERRIDES = {
  1: [1500, 2100, 2800],
  2: [1700, 2300, 2950],
  3: [1900, 2450, 3050],
  4: [1800, 2400, 2950],
  5: [1800, 2400, 2950],
  6: [1750, 2350, 2900],
  7: [1750, 2350, 2900],
  8: [1700, 2250, 2800],
  9: [1650, 2200, 2750],
  10: [1650, 2200, 2750],
  11: [1600, 2150, 2700],
  12: [1600, 2150, 2700],
  13: [1750, 2300, 2900],
  14: [1550, 2000, 2400],
  15: [1600, 2100, 2600],
  16: [1500, 2000, 2500],
  17: [1550, 2000, 2450],
  18: [1500, 1950, 2400],
  19: [1500, 1950, 2350],
  20: [1450, 1900, 2400],
};

const ICE = {
  none: [],
  // 6 格：中心十字
  cross6: [[3, 3], [3, 4], [4, 3], [4, 4], [1, 1], [1, 6]],
  // 8 格：日字形
  ring8: [[1, 2], [1, 5], [2, 3], [2, 4], [5, 3], [5, 4], [6, 2], [6, 5]],
  // 8 格：四角
  corner8: [[0, 0], [0, 7], [1, 3], [1, 4], [6, 3], [6, 4], [7, 0], [7, 7]],
  // 10 格：菱形
  diamond10: [[1, 1], [1, 6], [2, 2], [2, 5], [3, 3], [3, 4], [4, 3], [4, 4], [6, 1], [6, 6]],
  // 10 格：井字
  well10: [[0, 3], [0, 4], [2, 1], [2, 6], [3, 2], [3, 5], [4, 2], [4, 5], [7, 3], [7, 4]],
  // 12 格：外环
  edge12: [[0, 0], [0, 7], [1, 2], [1, 5], [2, 3], [2, 4], [5, 3], [5, 4], [6, 2], [6, 5], [7, 0], [7, 7]],
  // 8 格：上下两排
  rows8: [[1, 1], [1, 2], [1, 5], [1, 6], [6, 1], [6, 2], [6, 5], [6, 6]],
};

const LEVELS = [
  // —— 1 至 3 关：四项基础认知，4 种元素，25 步，分数达标 ——
  {
    levelId: 1, name: '初见', types: 4, moves: 25,
    goal: { type: 'score', amount: 1500 },
    hint: '交换相邻的两个元素，连成三个即可消除',
  },
  {
    levelId: 2, name: '三色小径', types: 4, moves: 25,
    goal: { type: 'score', amount: 1800 },
    hint: '一次消除四个，会得到更强的条纹元素',
  },
  {
    levelId: 3, name: '五彩初章', types: 4, moves: 25,
    goal: { type: 'score', amount: 2000 },
    hint: '剩余的步数会在通关时折算成额外分数',
  },
  // —— 4 至 8 关：引入 5、6 种元素与收集目标 ——
  {
    levelId: 4, name: '玫红收集', types: 5, moves: 24,
    goal: { type: 'collect', element: 0, amount: 18 },
    hint: '消除指定元素，累计到目标数量即可过关',
  },
  {
    levelId: 5, name: '深蓝之约', types: 5, moves: 24,
    goal: { type: 'collect', element: 1, amount: 20 },
    hint: '优先消除目标元素，边上留出的空位会带来连锁',
  },
  {
    levelId: 6, name: '绿意渐浓', types: 5, moves: 23,
    goal: { type: 'collect', element: 2, amount: 22 },
    hint: '连锁的倍率会一路涨到三倍，尽量制造连续消除',
  },
  {
    levelId: 7, name: '星辉点点', types: 6, moves: 23,
    goal: { type: 'collect', element: 4, amount: 20 },
    hint: '元素种类变多，找准一处能连带的位置再动手',
  },
  {
    levelId: 8, name: '双色协奏', types: 5, moves: 22,
    goal: {
      type: 'combo',
      primary: { type: 'score', amount: 1800 },
      secondary: { type: 'collect', element: 3, amount: 16 },
    },
    hint: '两个目标要同时完成，别只顾着堆分数',
  },
  // —— 9 至 14 关：特殊元素与冰块障碍 ——
  {
    levelId: 9, name: '冰封花园', types: 5, moves: 22, ice: 'cross6',
    goal: { type: 'clear_ice', amount: 6 },
    hint: '在冰块旁边消除，冰块的耐久会随之减少',
  },
  {
    levelId: 10, name: '碎冰之路', types: 6, moves: 22, ice: 'ring8',
    goal: { type: 'clear_ice', amount: 8 },
    hint: '条纹元素可以整行或整列清除，用来破冰最有效',
  },
  {
    levelId: 11, name: '冰下藏金', types: 6, moves: 22, ice: 'corner8',
    goal: {
      type: 'combo',
      primary: { type: 'clear_ice', amount: 8 },
      secondary: { type: 'collect', element: 5, amount: 14 },
    },
    hint: '冰块与收集同时进行，注意角落里的冰',
  },
  {
    levelId: 12, name: '霜寒未消', types: 6, moves: 21, ice: 'diamond10',
    goal: { type: 'clear_ice', amount: 10 },
    hint: '被困住的元素不能交换，先清掉它旁边的位置',
  },
  {
    levelId: 13, name: '冷杉林', types: 6, moves: 22, ice: 'well10',
    goal: {
      type: 'combo',
      primary: { type: 'clear_ice', amount: 9 },
      secondary: { type: 'score', amount: 1900 },
    },
    hint: '分数与破冰都要顾及，连锁能同时推进两者',
  },
  {
    levelId: 14, name: '冰原拾贝', types: 6, moves: 20, ice: 'edge12',
    goal: { type: 'clear_ice', amount: 10 },
    hint: '边缘的冰块更难触及，必要时用锤子敲开',
  },
  // —— 15 至 18 关：双目标与步数收紧 ——
  {
    levelId: 15, name: '双生目标', types: 6, moves: 20, ice: 'rows8',
    goal: {
      type: 'combo',
      primary: { type: 'score', amount: 2100 },
      secondary: { type: 'clear_ice', amount: 8 },
    },
    hint: '步数只有二十步，每一步都要争取形成连锁',
  },
  {
    levelId: 16, name: '步步为营', types: 6, moves: 21, ice: 'corner8', durability: 2,
    goal: {
      type: 'combo',
      primary: { type: 'collect', element: 1, amount: 18 },
      secondary: { type: 'clear_ice', amount: 7 },
    },
    hint: '冰块耐久翻倍，需要两次相邻消除才能敲开',
  },
  {
    levelId: 17, name: '精算之路', types: 6, moves: 21, ice: 'ring8', durability: 2,
    goal: {
      type: 'combo',
      primary: { type: 'score', amount: 1900 },
      secondary: { type: 'collect', element: 2, amount: 16 },
    },
    hint: '彩虹元素与条纹交换，可以清掉同色的全部元素',
  },
  {
    levelId: 18, name: '霜色黎明', types: 6, moves: 21, ice: 'diamond10', durability: 2,
    goal: {
      type: 'combo',
      primary: { type: 'clear_ice', amount: 9 },
      secondary: { type: 'collect', element: 0, amount: 15 },
    },
    hint: '先破中间的冰，棋盘的通路会顺畅很多',
  },
  // —— 19 至 20 关：综合运用道具与特殊元素组合 ——
  {
    levelId: 19, name: '极限边缘', types: 6, moves: 20, ice: 'edge12', durability: 2,
    goal: {
      type: 'combo',
      primary: { type: 'score', amount: 1850 },
      secondary: { type: 'clear_ice', amount: 9 },
    },
    hint: '道具不消耗步数，卡住的时候别硬撑',
  },
  {
    levelId: 20, name: '终章·雪境', types: 6, moves: 19, ice: 'diamond10', durability: 2,
    goal: {
      type: 'combo',
      primary: { type: 'clear_ice', amount: 10 },
      secondary: { type: 'score', amount: 1800 },
    },
    hint: '最后一步之前，先算清剩余的冰与分数',
  },
];

function build(level) {
  const iceCells = (ICE[level.ice] || []).map(([r, c]) => [r, c]);
  const data = {
    schemaVersion: 1,
    levelId: level.levelId,
    name: level.name,
    board: {
      rows: 8,
      cols: 8,
      elementTypes: level.types,
      iceCells,
      blockedCells: [],
    },
    goal: level.goal,
    moves: level.moves,
    starThresholds: STAR_OVERRIDES[level.levelId] || STAR_TABLE[level.moves],
    disabledBoosters: level.disabledBoosters || [],
    tutorialHint: level.hint,
  };
  if (level.durability) data.board.iceDurability = level.durability;
  return data;
}

for (const level of LEVELS) {
  const data = build(level);
  const file = resolve(outDir, `level-${String(level.levelId).padStart(2, '0')}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// 索引文件：关卡仓库在无法逐文件探测时可用它定位关卡范围。
// EX 关卡不由本脚本生成，保留旧索引中的 EX 编号，避免重新生成普通关时把它们丢掉。
const indexPath = resolve(outDir, 'index.json');
let exIds = [];
try {
  const previous = JSON.parse(readFileSync(indexPath, 'utf8'));
  exIds = (previous.levels || []).filter((id) => Number(id) >= 101);
} catch {
  // 首次生成没有旧索引
}
const indexLevels = [...LEVELS.map((l) => l.levelId), ...exIds];
writeFileSync(
  indexPath,
  JSON.stringify({ schemaVersion: 1, count: indexLevels.length, levels: indexLevels }, null, 2) + '\n',
  'utf8'
);

console.log(`已生成 ${LEVELS.length} 个关卡到 ${outDir}`);
